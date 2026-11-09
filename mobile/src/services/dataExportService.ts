import { Share } from 'react-native';
import { IDatabase } from '../db/types';
import { clearStoredTokens } from './auth/authContext';
import { transitionAccountEpoch } from './auth/sessionService';

export interface DatabaseStorageStats {
  tasksCount: number;
  moodsCount: number;
  conversationsCount: number;
  messagesCount: number;
  checkinsCount: number;
  estimatedDbSizeBytes: number;
}

/**
 * Helper to escape CSV values according to RFC 4180.
 */
function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds array of CSV rows from records.
 */
function toCsvSection<T extends Record<string, any>>(title: string, records: T[], columns: (keyof T)[]): string {
  if (records.length === 0) {
    return `=== ${title} ===\n(No records)\n`;
  }
  const header = columns.join(',');
  const rows = records.map((r) => columns.map((col) => escapeCsvValue(r[col])).join(','));
  return `=== ${title} ===\n${header}\n${rows.join('\n')}\n`;
}

/**
 * Queries all user-authored records and returns a structured JSON string.
 */
export async function exportUserDataJson(db: IDatabase, userId: string): Promise<string> {
  const tasks = await db.getAllAsync<any>(
    `SELECT id, user_id, title, description, due_date, due_time, is_timed, status, completed_at, postponed_at, created_at, updated_at
     FROM tasks WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at ASC;`,
    userId
  );

  const moods = await db.getAllAsync<any>(
    `SELECT id, user_id, mood_type, note, tags, logged_at, created_at
     FROM mood_entries WHERE user_id = ? ORDER BY logged_at ASC;`,
    userId
  );

  const conversations = await db.getAllAsync<any>(
    `SELECT id, user_id, title, created_at, updated_at
     FROM conversations WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at ASC;`,
    userId
  );

  const messages = await db.getAllAsync<any>(
    `SELECT id, conversation_id, sender, content, client_message_id, status, created_at
     FROM messages
     WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)
     ORDER BY created_at ASC;`,
    userId
  );

  const checkins = await db.getAllAsync<any>(
    `SELECT id, user_id, checkin_type, local_date, conversation_id, created_at
     FROM checkin_occurrences WHERE user_id = ? ORDER BY created_at ASC;`,
    userId
  );

  const exportPayload = {
    exportVersion: '1.0',
    exportDate: new Date().toISOString(),
    userId,
    summary: {
      tasksCount: tasks.length,
      moodEntriesCount: moods.length,
      conversationsCount: conversations.length,
      messagesCount: messages.length,
      checkinsCount: checkins.length,
    },
    data: {
      tasks,
      moodEntries: moods,
      conversations,
      messages,
      checkins,
    },
  };

  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Generates an RFC 4180-compliant multi-section CSV string of user-authored data.
 */
export async function exportUserDataCsv(db: IDatabase, userId: string): Promise<string> {
  const tasks = await db.getAllAsync<any>(
    `SELECT id, title, description, due_date, due_time, is_timed, status, completed_at, created_at
     FROM tasks WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at ASC;`,
    userId
  );

  const moods = await db.getAllAsync<any>(
    `SELECT id, mood_type, note, tags, logged_at, created_at
     FROM mood_entries WHERE user_id = ? ORDER BY logged_at ASC;`,
    userId
  );

  const conversations = await db.getAllAsync<any>(
    `SELECT id, title, created_at, updated_at
     FROM conversations WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at ASC;`,
    userId
  );

  const checkins = await db.getAllAsync<any>(
    `SELECT id, checkin_type, local_date, conversation_id, created_at
     FROM checkin_occurrences WHERE user_id = ? ORDER BY created_at ASC;`,
    userId
  );

  const banner = `# CURA DATA PORTABILITY EXPORT\n# User: ${userId}\n# ExportedAt: ${new Date().toISOString()}\n\n`;
  const tasksSection = toCsvSection(
    'TASKS',
    tasks,
    ['id', 'title', 'description', 'due_date', 'due_time', 'is_timed', 'status', 'completed_at', 'created_at']
  );
  const moodsSection = toCsvSection(
    'MOOD_ENTRIES',
    moods,
    ['id', 'mood_type', 'note', 'tags', 'logged_at', 'created_at']
  );
  const convsSection = toCsvSection(
    'CONVERSATIONS',
    conversations,
    ['id', 'title', 'created_at', 'updated_at']
  );
  const checkinsSection = toCsvSection(
    'CHECKINS',
    checkins,
    ['id', 'checkin_type', 'local_date', 'conversation_id', 'created_at']
  );

  return `${banner}${tasksSection}\n${moodsSection}\n${convsSection}\n${checkinsSection}`;
}

/**
 * Triggers native system share dialog for export text.
 */
export async function shareExportedData(content: string, filename: string): Promise<void> {
  try {
    await Share.share({
      title: filename,
      message: content,
    });
  } catch (err) {
    console.warn('[dataExportService] Share dismissed or failed:', err);
  }
}

/**
 * Calculates live database record statistics and page allocation size.
 */
export async function getDatabaseStorageStats(db: IDatabase, userId: string): Promise<DatabaseStorageStats> {
  const tasksCount =
    (await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND is_deleted = 0;`,
      userId
    ))?.c ?? 0;

  const moodsCount =
    (await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM mood_entries WHERE user_id = ?;`,
      userId
    ))?.c ?? 0;

  const conversationsCount =
    (await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM conversations WHERE user_id = ? AND is_deleted = 0;`,
      userId
    ))?.c ?? 0;

  const messagesCount =
    (await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?);`,
      userId
    ))?.c ?? 0;

  const checkinsCount =
    (await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM checkin_occurrences WHERE user_id = ?;`,
      userId
    ))?.c ?? 0;

  // Retrieve SQLite page sizing for physical size estimate
  let estimatedDbSizeBytes = 0;
  try {
    const pageCount = (await db.getFirstAsync<{ page_count: number }>('PRAGMA page_count;'))?.page_count ?? 0;
    const pageSize = (await db.getFirstAsync<{ page_size: number }>('PRAGMA page_size;'))?.page_size ?? 4096;
    estimatedDbSizeBytes = pageCount * pageSize;
  } catch {
    estimatedDbSizeBytes = (tasksCount + moodsCount + messagesCount) * 512;
  }

  return {
    tasksCount,
    moodsCount,
    conversationsCount,
    messagesCount,
    checkinsCount,
    estimatedDbSizeBytes,
  };
}

/**
 * Reclaims fragmented pages and defragments the SQLite database file.
 */
export async function vacuumDatabase(db: IDatabase): Promise<void> {
  try {
    await db.execAsync('VACUUM;');
  } catch (err) {
    console.warn('[dataExportService] Database vacuum warning:', err);
  }
}

/**
 * "Delete My Data" flow.
 * - Atomically deletes all local records for the given user from SQLite.
 * - Clears stored tokens in SecureStore.
 * - Transitions account epoch to guest (clears widget snapshots and publishes clean guest widget).
 * If any step in the SQLite deletion throws, the transaction rolls back, leaving no half-deleted state.
 */
export async function deleteMyData(
  db: IDatabase,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.withTransactionAsync(async () => {
      // 1. Delete messages
      await db.runAsync(
        `DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?);`,
        userId
      );

      // 2. Delete conversations
      await db.runAsync(`DELETE FROM conversations WHERE user_id = ?;`, userId);

      // 3. Delete tasks and orphaned task history
      await db.runAsync(`DELETE FROM tasks WHERE user_id = ?;`, userId);
      await db.runAsync(`DELETE FROM task_history WHERE task_id NOT IN (SELECT id FROM tasks);`);

      // 4. Delete mood entries
      await db.runAsync(`DELETE FROM mood_entries WHERE user_id = ?;`, userId);

      // 5. Delete checkin occurrences
      await db.runAsync(`DELETE FROM checkin_occurrences WHERE user_id = ?;`, userId);

      // 6. Delete sync outbox
      await db.runAsync(`DELETE FROM sync_outbox WHERE user_id = ?;`, userId);
    });

    // 7. Clear tokens
    await clearStoredTokens();

    // 8. Transition epoch to guest, purges snapshots
    await transitionAccountEpoch(db, 'guest');

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete user data' };
  }
}
