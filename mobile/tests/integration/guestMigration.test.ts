import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import { createTask, getTaskById } from '../../src/db/taskRepository';
import { createMoodEntry, getAllMoodEntries } from '../../src/db/moodRepository';
import { getWidgetSnapshotMetadata } from '../../src/services/widgets/snapshotBuilder';
import { WidgetNativePublisher } from '../../src/services/widgets/publishOrchestrator';
import { migrateGuestDataToUser } from '../../src/services/auth/sessionService';

describe('Phase 9: Guest Data Migration Integration Tests', () => {
  let db: NodeSQLiteAdapter;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);

    // Initial state: metadata initialized to guest
    await db.runAsync(
      `UPDATE widget_snapshot_metadata
       SET user_id = 'guest', account_epoch = 1, source_revision = 0, published_revision = 0
       WHERE id = 1;`
    );
  });

  it('Guest with 3 tasks + 2 moods -> migrate -> all rows now newUserId, guest rows = 0, epoch +1, source == published', async () => {
    // 1. Seed 3 guest tasks
    const t1 = await createTask(db, { userId: 'guest', title: 'Task 1' });
    const t2 = await createTask(db, { userId: 'guest', title: 'Task 2' });
    const t3 = await createTask(db, { userId: 'guest', title: 'Task 3' });

    // 2. Seed 2 guest moods
    await createMoodEntry(db, { userId: 'guest', moodType: 'happy' });
    await createMoodEntry(db, { userId: 'guest', moodType: 'calm' });

    const metaBefore = await getWidgetSnapshotMetadata(db);
    const initialEpoch = metaBefore.account_epoch;

    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);
    const authenticatedUserId = 'usr_auth_901';

    // 3. Migrate guest data
    const result = await migrateGuestDataToUser(db, authenticatedUserId, {
      publisher,
      clearSnapshotsFn,
    });

    expect(result.userId).toBe(authenticatedUserId);
    expect(result.accountEpoch).toBe(initialEpoch + 1);
    expect(result.sourceRevision).toBe(result.publishedRevision);

    // 4. Verify guest tasks = 0, authenticated tasks = 3
    const guestTasks = await db.getAllAsync(`SELECT id FROM tasks WHERE user_id = 'guest';`);
    expect(guestTasks).toHaveLength(0);

    const authTasks = await db.getAllAsync(`SELECT id FROM tasks WHERE user_id = ?;`, authenticatedUserId);
    expect(authTasks).toHaveLength(3);
    const authTaskIds = authTasks.map((t: any) => t.id);
    expect(authTaskIds).toContain(t1.id);
    expect(authTaskIds).toContain(t2.id);
    expect(authTaskIds).toContain(t3.id);

    // 5. Verify guest moods = 0, authenticated moods = 2
    const guestMoods = await getAllMoodEntries(db, { userId: 'guest' });
    expect(guestMoods).toHaveLength(0);

    const authMoods = await getAllMoodEntries(db, { userId: authenticatedUserId });
    expect(authMoods).toHaveLength(2);

    // 6. Verify metadata singleton
    const metaAfter = await getWidgetSnapshotMetadata(db);
    expect(metaAfter.user_id).toBe(authenticatedUserId);
    expect(metaAfter.account_epoch).toBe(initialEpoch + 1);
    expect(metaAfter.source_revision).toBe(metaAfter.published_revision);

    // 7. Verify bridge cleanup and publish called
    expect(clearSnapshotsFn).toHaveBeenCalledTimes(1);
    expect(publisher).toHaveBeenCalledTimes(1);
    expect(publisher.mock.calls[0][0].userId).toBe(authenticatedUserId);
  });

  it('Migrate with no guest data -> epoch still +1, no crash, no data loss', async () => {
    const metaBefore = await getWidgetSnapshotMetadata(db);
    const initialEpoch = metaBefore.account_epoch;

    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);
    const authenticatedUserId = 'usr_empty_902';

    const result = await migrateGuestDataToUser(db, authenticatedUserId, {
      publisher,
      clearSnapshotsFn,
    });

    expect(result.userId).toBe(authenticatedUserId);
    expect(result.accountEpoch).toBe(initialEpoch + 1);
    expect(result.sourceRevision).toBe(result.publishedRevision);

    const metaAfter = await getWidgetSnapshotMetadata(db);
    expect(metaAfter.user_id).toBe(authenticatedUserId);
    expect(metaAfter.account_epoch).toBe(initialEpoch + 1);
    expect(metaAfter.source_revision).toBe(metaAfter.published_revision);
    expect(publisher).toHaveBeenCalledTimes(1);
  });

  it('Migrate fails mid-transaction (inject failure) -> guest data intact, epoch unchanged', async () => {
    // Seed 2 guest tasks
    const t1 = await createTask(db, { userId: 'guest', title: 'Safe Task 1' });
    const t2 = await createTask(db, { userId: 'guest', title: 'Safe Task 2' });

    const metaBefore = await getWidgetSnapshotMetadata(db);
    const initialEpoch = metaBefore.account_epoch;
    const initialRev = metaBefore.source_revision;

    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);

    // Intercept runAsync to simulate mid-transaction failure
    const originalRunAsync = db.runAsync.bind(db);
    let failureInjected = false;
    vi.spyOn(db, 'runAsync').mockImplementation(async (sql, ...params) => {
      if (typeof sql === 'string' && sql.includes('UPDATE mood_entries') && !failureInjected) {
        failureInjected = true;
        throw new Error('Simulated SQLite disk I/O error mid-migration');
      }
      return originalRunAsync(sql, ...params);
    });

    // Attempt migration - must fail
    await expect(
      migrateGuestDataToUser(db, 'usr_fail_903', {
        publisher,
        clearSnapshotsFn,
      })
    ).rejects.toThrow('Simulated SQLite disk I/O error mid-migration');

    // Restore runAsync
    vi.restoreAllMocks();

    // Verify guest data is 100% intact
    const guestTasks = await db.getAllAsync(`SELECT id FROM tasks WHERE user_id = 'guest';`);
    expect(guestTasks).toHaveLength(2);
    const task1 = await getTaskById(db, t1.id);
    const task2 = await getTaskById(db, t2.id);
    expect(task1?.userId).toBe('guest');
    expect(task2?.userId).toBe('guest');

    // Verify metadata was rolled back: user_id is still guest, epoch unchanged
    const metaAfter = await getWidgetSnapshotMetadata(db);
    expect(metaAfter.user_id).toBe('guest');
    expect(metaAfter.account_epoch).toBe(initialEpoch);
    expect(metaAfter.source_revision).toBe(initialRev);

    // Cleanup and publish must NOT have been called
    expect(clearSnapshotsFn).not.toHaveBeenCalled();
    expect(publisher).not.toHaveBeenCalled();
  });

  it('Migrate twice with same newUserId -> second is no-op, no duplicates, no data loss', async () => {
    await createTask(db, { userId: 'guest', title: 'Idempotent Task 1' });
    await createTask(db, { userId: 'guest', title: 'Idempotent Task 2' });

    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);
    const userId = 'usr_double_904';

    // First migration -> applies
    const firstResult = await migrateGuestDataToUser(db, userId, {
      publisher,
      clearSnapshotsFn,
    });
    expect(firstResult.isNoOp).toBe(false);
    expect(firstResult.userId).toBe(userId);
    const epochAfterFirst = firstResult.accountEpoch;

    const tasksAfterFirst = await db.getAllAsync(`SELECT id FROM tasks WHERE user_id = ?;`, userId);
    expect(tasksAfterFirst).toHaveLength(2);

    publisher.mockClear();
    clearSnapshotsFn.mockClear();

    // Second migration with exact same user -> idempotent no-op
    const secondResult = await migrateGuestDataToUser(db, userId, {
      publisher,
      clearSnapshotsFn,
    });

    expect(secondResult.isNoOp).toBe(true);
    expect(secondResult.accountEpoch).toBe(epochAfterFirst);

    // No duplicates created
    const tasksAfterSecond = await db.getAllAsync(`SELECT id FROM tasks WHERE user_id = ?;`, userId);
    expect(tasksAfterSecond).toHaveLength(2);

    // Publisher not called on no-op
    expect(publisher).not.toHaveBeenCalled();
    expect(clearSnapshotsFn).not.toHaveBeenCalled();
  });

  it('Conflict: newUserId already has task with same id as guest task -> newUserId row kept, guest duplicate discarded, no duplicate ids', async () => {
    const targetUserId = 'usr_conflict_905';

    // 1. Existing task for authenticated user (e.g. from cloud sync)
    const authTask = await createTask(db, {
      userId: targetUserId,
      title: 'Authenticated Cloud Task Title',
    });

    // 2. Existing guest tasks
    const guestTask = await createTask(db, {
      userId: 'guest',
      title: 'Guest Task Title',
    });

    // 3. Conflicting check-in occurrence: both authenticated user and guest have morning check-in for 2026-11-08
    await db.runAsync(
      `INSERT INTO conversations (id, user_id, title, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'));`,
      'conv_auth_1',
      targetUserId,
      'Auth Conv'
    );
    await db.runAsync(
      `INSERT INTO checkin_occurrences (id, user_id, checkin_type, local_date, conversation_id, created_at, updated_at)
       VALUES (?, ?, 'morning', '2026-11-08', 'conv_auth_1', datetime('now'), datetime('now'));`,
      'chk_auth_1',
      targetUserId
    );
    await db.runAsync(
      `INSERT INTO checkin_occurrences (id, user_id, checkin_type, local_date, conversation_id, created_at, updated_at)
       VALUES (?, 'guest', 'morning', '2026-11-08', 'conv_auth_1', datetime('now'), datetime('now'));`,
      'chk_guest_colliding'
    );

    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);

    // 4. Execute migration
    await migrateGuestDataToUser(db, targetUserId, {
      publisher,
      clearSnapshotsFn,
    });

    // 5. Verify merge: existing authenticated task preserved without deletion/overwrite
    const authRow = await getTaskById(db, authTask.id);
    expect(authRow).not.toBeNull();
    expect(authRow?.userId).toBe(targetUserId);
    expect(authRow?.title).toBe('Authenticated Cloud Task Title');

    // 6. Verify guest task was migrated to targetUserId
    const guestRow = await getTaskById(db, guestTask.id);
    expect(guestRow).not.toBeNull();
    expect(guestRow?.userId).toBe(targetUserId);
    expect(guestRow?.title).toBe('Guest Task Title');

    // 7. Verify colliding check-in occurrence: authenticated row kept, guest duplicate discarded, no duplicate error
    const occurrences = await db.getAllAsync<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM checkin_occurrences WHERE user_id = ? AND checkin_type = 'morning' AND local_date = '2026-11-08';`,
      targetUserId
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].id).toBe('chk_auth_1');

    // 8. Verify zero tasks or checkins remain under guest
    const remainingGuestTasks = await db.getAllAsync(`SELECT id FROM tasks WHERE user_id = 'guest';`);
    expect(remainingGuestTasks).toHaveLength(0);
    const remainingGuestCheckins = await db.getAllAsync(`SELECT id FROM checkin_occurrences WHERE user_id = 'guest';`);
    expect(remainingGuestCheckins).toHaveLength(0);
  });
});
