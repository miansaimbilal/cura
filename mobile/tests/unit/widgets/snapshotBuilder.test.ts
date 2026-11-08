import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSQLiteAdapter } from '../../helpers/sqliteAdapter';
import { runMigrations } from '../../../src/db/migrations';
import { createTask, updateTask, softDeleteTask } from '../../../src/db/taskRepository';
import { createMoodEntry } from '../../../src/db/moodRepository';
import { getLocalDateString } from '../../../src/utils/date';
import {
  buildWidgetSnapshot,
  getWidgetSnapshotMetadata,
} from '../../../src/services/widgets/snapshotBuilder';

function getOffsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

describe('Widget Snapshot Builder Unit Tests', () => {
  let db: NodeSQLiteAdapter;
  const userId = 'usr_test';
  const today = getLocalDateString();
  const yesterday = getOffsetDate(-1);
  const tomorrow = getOffsetDate(1);

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);

    // Seed active user in metadata singleton
    await db.runAsync(
      `UPDATE widget_snapshot_metadata SET user_id = ? WHERE id = 1;`,
      userId
    );
  });

  it('Empty DB -> tasks.todayTotal = 0, todayCompleted = 0, todayRemaining = 0, overdueCount = 0, items = [], mood.latestMoodType = null', async () => {
    const snapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });

    expect(snapshot.tasks.todayTotal).toBe(0);
    expect(snapshot.tasks.todayCompleted).toBe(0);
    expect(snapshot.tasks.todayRemaining).toBe(0);
    expect(snapshot.tasks.overdueCount).toBe(0);
    expect(snapshot.tasks.items).toEqual([]);
    expect(snapshot.mood.latestMoodType).toBeNull();
    expect(snapshot.mood.latestLoggedAt).toBeNull();
  });

  it('Create 3 tasks for today: 1 completed, 2 pending -> todayTotal = 3, todayCompleted = 1, todayRemaining = 2', async () => {
    const t1 = await createTask(db, { userId, title: 'Task 1', dueDate: today });
    await createTask(db, { userId, title: 'Task 2', dueDate: today });
    await createTask(db, { userId, title: 'Task 3', dueDate: today });

    await updateTask(db, t1.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    const snapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });
    expect(snapshot.tasks.todayTotal).toBe(3);
    expect(snapshot.tasks.todayCompleted).toBe(1);
    expect(snapshot.tasks.todayRemaining).toBe(2);
  });

  it('Create 1 overdue pending task (due_date = yesterday) -> overdueCount = 1 and it appears in todayTotal', async () => {
    await createTask(db, { userId, title: 'Overdue Task', dueDate: yesterday });

    const snapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });
    expect(snapshot.tasks.overdueCount).toBe(1);
    expect(snapshot.tasks.todayTotal).toBe(1);
    expect(snapshot.tasks.todayRemaining).toBe(1);
    expect(snapshot.tasks.items).toHaveLength(1);
    expect(snapshot.tasks.items[0].title).toBe('Overdue Task');
  });

  it('Create 1 future task (due_date = tomorrow) -> does NOT appear in todayTotal', async () => {
    await createTask(db, { userId, title: 'Future Task', dueDate: tomorrow });

    const snapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });
    expect(snapshot.tasks.todayTotal).toBe(0);
    expect(snapshot.tasks.todayRemaining).toBe(0);
    expect(snapshot.tasks.items).toHaveLength(0);
  });

  it('Create 1 soft-deleted task -> does NOT appear', async () => {
    const task = await createTask(db, { userId, title: 'Deleted Task', dueDate: today });
    await softDeleteTask(db, task.id);

    const snapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });
    expect(snapshot.tasks.todayTotal).toBe(0);
    expect(snapshot.tasks.items).toHaveLength(0);
  });

  it('Create 12 tasks for today -> items.length == 10 - proves limit 10', async () => {
    for (let i = 1; i <= 12; i++) {
      await createTask(db, { userId, title: `Task ${i}`, dueDate: today });
    }

    const snapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });
    expect(snapshot.tasks.items).toHaveLength(10);
  });

  it('items ordering: status ASC, due_time ASC, created_at ASC - completed last, earliest due_time first', async () => {
    const tCompleted = await createTask(db, {
      userId,
      title: 'Completed Task',
      dueDate: today,
      dueTime: '08:00',
    });
    await updateTask(db, tCompleted.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    const tLatePending = await createTask(db, {
      userId,
      title: 'Late Pending',
      dueDate: today,
      dueTime: '17:00',
    });

    const tEarlyPending = await createTask(db, {
      userId,
      title: 'Early Pending',
      dueDate: today,
      dueTime: '09:00',
    });

    const snapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });
    const itemTitles = snapshot.tasks.items.map((i) => i.title);

    // Pending earliest due_time first, completed last
    expect(itemTitles[0]).toBe('Early Pending');
    expect(itemTitles[1]).toBe('Late Pending');
    expect(itemTitles[2]).toBe('Completed Task');
  });

  it('Create 2 moods, older then newer -> mood.latestMoodType = newer, latestLoggedAt = newer timestamp', async () => {
    await createMoodEntry(db, {
      userId,
      moodType: 'sad',
      loggedAt: '2026-11-08T08:00:00.000Z',
    });

    await createMoodEntry(db, {
      userId,
      moodType: 'happy',
      loggedAt: '2026-11-08T12:00:00.000Z',
    });

    const snapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });
    expect(snapshot.mood.latestMoodType).toBe('happy');
    expect(snapshot.mood.latestLoggedAt).toBe('2026-11-08T12:00:00.000Z');
  });

  it('Snapshot has schemaVersion = 1, revision == sourceRevision, userId == usr_test, accountEpoch matches metadata, quote is non-null', async () => {
    const metaBefore = await getWidgetSnapshotMetadata(db);
    const snapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.revision).toBe(metaBefore.published_revision);
    expect(snapshot.sourceRevision).toBe(metaBefore.source_revision);
    expect(snapshot.userId).toBe('usr_test');
    expect(snapshot.accountEpoch).toBe(metaBefore.account_epoch);
    expect(snapshot.quote).not.toBeNull();
    expect(typeof snapshot.quote.text).toBe('string');
    expect(typeof snapshot.quote.author).toBe('string');
  });

  it('buildWidgetSnapshot does NOT change source_revision or published_revision - pure read', async () => {
    const metaBefore = await getWidgetSnapshotMetadata(db);
    await buildWidgetSnapshot(db, { userId, currentDate: today });
    const metaAfter = await getWidgetSnapshotMetadata(db);

    expect(metaAfter.source_revision).toBe(metaBefore.source_revision);
    expect(metaAfter.published_revision).toBe(metaBefore.published_revision);
  });
});
