import { IDatabase } from '../../db/types';
import { getFilteredTasks, getTodaySummary } from '../../db/taskRepository';
import { getLocalDateString } from '../../utils/date';
import { MoodType } from '../../types/mood';
import {
  WidgetSnapshot,
  WidgetSnapshotMetadata,
  WidgetTaskItem,
} from './types';
import { getRotatingQuote } from './quotes';

/**
 * Reads the current widget_snapshot_metadata singleton row.
 */
export async function getWidgetSnapshotMetadata(
  db: IDatabase
): Promise<WidgetSnapshotMetadata> {
  const row = await db.getFirstAsync<WidgetSnapshotMetadata>(
    `SELECT id, source_revision, published_revision, account_epoch, user_id, updated_at
     FROM widget_snapshot_metadata
     WHERE id = 1;`
  );

  if (!row) {
    return {
      id: 1,
      source_revision: 0,
      published_revision: 0,
      account_epoch: 0,
      user_id: null,
      updated_at: new Date().toISOString(),
    };
  }

  return row;
}

export interface BuildSnapshotOptions {
  userId?: string;
  currentDate?: string;
  nowMs?: number;
  maxTaskItems?: number;
}

/**
 * Pure snapshot builder / formatter.
 * Deterministically constructs the authoritative snapshot JSON representation
 * from the current database state without mutating any tables.
 */
export async function buildWidgetSnapshot(
  db: IDatabase,
  options: BuildSnapshotOptions = {}
): Promise<WidgetSnapshot> {
  const metadata = await getWidgetSnapshotMetadata(db);
  const userId = options.userId || metadata.user_id || 'guest';
  const currentDate = options.currentDate || getLocalDateString();
  const maxItems = options.maxTaskItems ?? 10;

  // 1. Task summary & items (reusing existing taskRepository functions)
  const taskSummary = await getTodaySummary(db, currentDate, userId);
  const todayTasks = await getFilteredTasks(db, 'today', { userId, currentDate });

  const items: WidgetTaskItem[] = todayTasks.slice(0, maxItems).map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate ?? null,
    dueTime: t.dueTime ?? null,
    isTimed: Boolean(t.isTimed),
    status: t.status,
    completedAt: t.completedAt ?? null,
  }));

  // 2. Latest active mood entry
  const moodRow = await db.getFirstAsync<{ mood_type: string; logged_at: string }>(
    `SELECT mood_type, logged_at FROM mood_entries
     WHERE user_id = ? AND is_deleted = 0
     ORDER BY logged_at DESC LIMIT 1;`,
    userId
  );

  // 3. Rotating mindful quote
  const quote = getRotatingQuote(options.nowMs);

  return {
    schemaVersion: 1,
    revision: metadata.published_revision,
    sourceRevision: metadata.source_revision,
    userId,
    accountEpoch: metadata.account_epoch,
    generatedAt: new Date().toISOString(),
    tasks: {
      todayTotal: taskSummary.total,
      todayCompleted: taskSummary.completed,
      todayRemaining: taskSummary.remaining,
      overdueCount: taskSummary.overdue,
      items,
    },
    mood: {
      latestMoodType: (moodRow?.mood_type as MoodType) ?? null,
      latestLoggedAt: moodRow?.logged_at ?? null,
    },
    quote,
  };
}
