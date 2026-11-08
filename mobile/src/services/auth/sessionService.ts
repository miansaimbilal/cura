import { IDatabase } from '../../db/types';
import { getWidgetSnapshotMetadata } from '../widgets/snapshotBuilder';
import { orchestrateWidgetPublish, WidgetNativePublisher } from '../widgets/publishOrchestrator';
import { clearSnapshots } from '../../../modules/widget-bridge/src';

export interface EpochTransitionOptions {
  publisher?: WidgetNativePublisher;
  clearSnapshotsFn?: () => Promise<boolean | void> | boolean | void;
}

export interface EpochTransitionResult {
  userId: string;
  accountEpoch: number;
  sourceRevision: number;
  publishedRevision: number;
  isNoOp?: boolean;
}

/**
 * Transitions account epoch during session changes (login, logout, switch user).
 * Computes new revision in JS first, updates metadata in a transaction,
 * clears old snapshot files, and orchestrates a fresh publication.
 */
export async function transitionAccountEpoch(
  db: IDatabase,
  newUserId: string = 'guest',
  options: EpochTransitionOptions = {}
): Promise<EpochTransitionResult> {
  const targetUserId = newUserId || 'guest';
  let epochResult: EpochTransitionResult = {
    userId: targetUserId,
    accountEpoch: 1,
    sourceRevision: 1,
    publishedRevision: 1,
  };

  await db.withTransactionAsync(async () => {
    const metadata = await getWidgetSnapshotMetadata(db);
    const newRev = metadata.source_revision + 1;
    const newEpoch = metadata.account_epoch + 1;

    // Explicitly set source_revision and published_revision to newRev
    await db.runAsync(
      `UPDATE widget_snapshot_metadata
       SET user_id = ?,
           account_epoch = account_epoch + 1,
           source_revision = ?,
           published_revision = ?,
           updated_at = datetime('now')
       WHERE id = 1;`,
      targetUserId,
      newRev,
      newRev
    );

    epochResult = {
      userId: targetUserId,
      accountEpoch: newEpoch,
      sourceRevision: newRev,
      publishedRevision: newRev,
      isNoOp: false,
    };
  });

  // After transaction commits, clear snapshots directory for old epoch
  if (options.clearSnapshotsFn) {
    await options.clearSnapshotsFn();
  } else {
    try {
      await clearSnapshots();
    } catch {
      // Safe fallback if bridge is unavailable in test environment
    }
  }

  // Publish fresh snapshot for the new user/epoch
  await orchestrateWidgetPublish(db, {
    userId: targetUserId,
    force: true,
    publisher: options.publisher,
  });

  return epochResult;
}

/**
 * Migrates local guest data (tasks, mood_entries, conversations, checkin_occurrences, sync_outbox)
 * to an authenticated user and transitions the account epoch atomically.
 *
 * Conflict Resolution Rule:
 * If newUserId already has rows (e.g. created on another device), both sets of data are merged.
 * If an ID collision occurs (same primary key UUID), the authenticated user's existing row is kept,
 * and the colliding guest row is discarded and logged.
 * For checkin_occurrences with UNIQUE(user_id, checkin_type, local_date), colliding guest occurrences are discarded.
 */
export async function migrateGuestDataToUser(
  db: IDatabase,
  newUserId: string,
  options: EpochTransitionOptions = {}
): Promise<EpochTransitionResult> {
  if (!newUserId || newUserId === 'guest') {
    throw new Error('Cannot migrate guest data to guest user');
  }

  // 1. Idempotency check: if user is already authenticated as newUserId and has no guest records
  const currentMeta = await getWidgetSnapshotMetadata(db);
  const guestTasks = (await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM tasks WHERE user_id = 'guest';"))?.c ?? 0;
  const guestMoods = (await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM mood_entries WHERE user_id = 'guest';"))?.c ?? 0;
  const guestConvs = (await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM conversations WHERE user_id = 'guest';"))?.c ?? 0;
  const guestCheckins = (await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM checkin_occurrences WHERE user_id = 'guest';"))?.c ?? 0;
  const guestSync = (await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM sync_outbox WHERE user_id = 'guest';"))?.c ?? 0;

  const totalGuestRows = guestTasks + guestMoods + guestConvs + guestCheckins + guestSync;

  if (currentMeta.user_id === newUserId && totalGuestRows === 0) {
    return {
      userId: newUserId,
      accountEpoch: currentMeta.account_epoch,
      sourceRevision: currentMeta.source_revision,
      publishedRevision: currentMeta.published_revision,
      isNoOp: true,
    };
  }

  let epochResult: EpochTransitionResult = {
    userId: newUserId,
    accountEpoch: 1,
    sourceRevision: 1,
    publishedRevision: 1,
    isNoOp: false,
  };

  // 2. Perform data migration and epoch transition in ONE atomic transaction
  await db.withTransactionAsync(async () => {
    // a) Tasks: discard colliding guest tasks, migrate remaining
    const taskCollisions = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM tasks WHERE user_id = 'guest' AND id IN (SELECT id FROM tasks WHERE user_id = ?);`,
      newUserId
    );
    if (taskCollisions.length > 0) {
      console.warn(
        `[guestMigration] Discarding ${taskCollisions.length} colliding guest task(s): ${taskCollisions.map((t) => t.id).join(', ')}`
      );
      await db.runAsync(
        `DELETE FROM tasks WHERE user_id = 'guest' AND id IN (SELECT id FROM tasks WHERE user_id = ?);`,
        newUserId
      );
    }
    await db.runAsync(`UPDATE tasks SET user_id = ? WHERE user_id = 'guest';`, newUserId);

    // b) Mood entries: discard colliding guest moods, migrate remaining
    const moodCollisions = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM mood_entries WHERE user_id = 'guest' AND id IN (SELECT id FROM mood_entries WHERE user_id = ?);`,
      newUserId
    );
    if (moodCollisions.length > 0) {
      console.warn(
        `[guestMigration] Discarding ${moodCollisions.length} colliding guest mood entry(s): ${moodCollisions.map((m) => m.id).join(', ')}`
      );
      await db.runAsync(
        `DELETE FROM mood_entries WHERE user_id = 'guest' AND id IN (SELECT id FROM mood_entries WHERE user_id = ?);`,
        newUserId
      );
    }
    await db.runAsync(`UPDATE mood_entries SET user_id = ? WHERE user_id = 'guest';`, newUserId);

    // c) Conversations: discard colliding guest conversations, migrate remaining
    const convCollisions = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM conversations WHERE user_id = 'guest' AND id IN (SELECT id FROM conversations WHERE user_id = ?);`,
      newUserId
    );
    if (convCollisions.length > 0) {
      console.warn(
        `[guestMigration] Discarding ${convCollisions.length} colliding guest conversation(s): ${convCollisions.map((c) => c.id).join(', ')}`
      );
      await db.runAsync(
        `DELETE FROM conversations WHERE user_id = 'guest' AND id IN (SELECT id FROM conversations WHERE user_id = ?);`,
        newUserId
      );
    }
    await db.runAsync(`UPDATE conversations SET user_id = ? WHERE user_id = 'guest';`, newUserId);

    // d) Check-in occurrences: resolve both id and UNIQUE(user_id, checkin_type, local_date) collisions
    const checkinCollisions = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM checkin_occurrences
       WHERE user_id = 'guest'
         AND (
           id IN (SELECT id FROM checkin_occurrences WHERE user_id = ?)
           OR (checkin_type, local_date) IN (
             SELECT checkin_type, local_date FROM checkin_occurrences WHERE user_id = ?
           )
         );`,
      newUserId,
      newUserId
    );
    if (checkinCollisions.length > 0) {
      console.warn(
        `[guestMigration] Discarding ${checkinCollisions.length} colliding guest check-in occurrence(s)`
      );
      await db.runAsync(
        `DELETE FROM checkin_occurrences
         WHERE user_id = 'guest'
           AND (
             id IN (SELECT id FROM checkin_occurrences WHERE user_id = ?)
             OR (checkin_type, local_date) IN (
               SELECT checkin_type, local_date FROM checkin_occurrences WHERE user_id = ?
             )
           );`,
        newUserId,
        newUserId
      );
    }
    await db.runAsync(`UPDATE checkin_occurrences SET user_id = ? WHERE user_id = 'guest';`, newUserId);

    // e) Sync outbox: discard colliding mutation_id
    const syncCollisions = await db.getAllAsync<{ mutation_id: string }>(
      `SELECT mutation_id FROM sync_outbox WHERE user_id = 'guest' AND mutation_id IN (SELECT mutation_id FROM sync_outbox WHERE user_id = ?);`,
      newUserId
    );
    if (syncCollisions.length > 0) {
      await db.runAsync(
        `DELETE FROM sync_outbox WHERE user_id = 'guest' AND mutation_id IN (SELECT mutation_id FROM sync_outbox WHERE user_id = ?);`,
        newUserId
      );
    }
    await db.runAsync(`UPDATE sync_outbox SET user_id = ? WHERE user_id = 'guest';`, newUserId);

    // f) Update widget_snapshot_metadata singleton
    // Compute newRev in JS first (newRev = oldSource + 1)
    const metadata = await getWidgetSnapshotMetadata(db);
    const newRev = metadata.source_revision + 1;
    const newEpoch = metadata.account_epoch + 1;

    await db.runAsync(
      `UPDATE widget_snapshot_metadata
       SET user_id = ?,
           account_epoch = ?,
           source_revision = ?,
           published_revision = ?,
           updated_at = datetime('now')
       WHERE id = 1;`,
      newUserId,
      newEpoch,
      newRev,
      newRev
    );

    epochResult = {
      userId: newUserId,
      accountEpoch: newEpoch,
      sourceRevision: newRev,
      publishedRevision: newRev,
      isNoOp: false,
    };
  });

  // 3. Clear snapshots directory for old epoch
  if (options.clearSnapshotsFn) {
    await options.clearSnapshotsFn();
  } else {
    try {
      await clearSnapshots();
    } catch {
      // Safe fallback
    }
  }

  // 4. Publish clean snapshot for the new user
  await orchestrateWidgetPublish(db, {
    userId: newUserId,
    force: true,
    publisher: options.publisher,
  });

  return epochResult;
}
