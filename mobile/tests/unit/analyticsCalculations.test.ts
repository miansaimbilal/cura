import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import {
  getTaskCompletionForPeriod,
  getTaskActivityForPeriod,
} from '../../src/utils/analytics';
import { getCalendarWeekRange, getLocalDayRange } from '../../src/utils/date';
import { generateUUID } from '../../src/utils/uuid';

describe('Analytics Calculations & Transition Rules (Unit / SQLite Tests)', () => {
  let db: NodeSQLiteAdapter;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);
  });

  describe('1. Task Completion Rate (Cohort Semantics)', () => {
    it('returns null percentage when 0 eligible tasks exist in period', async () => {
      const dayRange = getLocalDayRange(new Date(2026, 10, 5));
      const metric = await getTaskCompletionForPeriod(db, dayRange);
      expect(metric.total).toBe(0);
      expect(metric.completed).toBe(0);
      expect(metric.percentage).toBeNull();
    });

    it('calculates completion percentage for tasks due in period', async () => {
      const now = new Date(2026, 10, 5, 10, 0, 0).toISOString();
      // Insert 2 tasks due on 2026-11-05 (1 completed, 1 pending)
      await db.runAsync(
        `INSERT INTO tasks (id, user_id, title, due_date, status, server_revision, server_updated_at, is_deleted, created_at, updated_at)
         VALUES ('t1', 'guest', 'Task 1', '2026-11-05', 'completed', 0, ?, 0, ?, ?);`,
        now,
        now,
        now
      );
      await db.runAsync(
        `INSERT INTO tasks (id, user_id, title, due_date, status, server_revision, server_updated_at, is_deleted, created_at, updated_at)
         VALUES ('t2', 'guest', 'Task 2', '2026-11-05', 'pending', 0, ?, 0, ?, ?);`,
        now,
        now,
        now
      );

      const dayRange = getLocalDayRange(new Date(2026, 10, 5));
      const metric = await getTaskCompletionForPeriod(db, dayRange);
      expect(metric.total).toBe(2);
      expect(metric.completed).toBe(1);
      expect(metric.percentage).toBe(50);
    });

    it('excludes cancelled and soft-deleted tasks from denominator and numerator', async () => {
      const now = new Date(2026, 10, 5, 10, 0, 0).toISOString();
      // Active completed task
      await db.runAsync(
        `INSERT INTO tasks (id, user_id, title, due_date, status, server_revision, server_updated_at, is_deleted, created_at, updated_at)
         VALUES ('t-active', 'guest', 'Active', '2026-11-05', 'completed', 0, ?, 0, ?, ?);`,
        now,
        now,
        now
      );
      // Cancelled task
      await db.runAsync(
        `INSERT INTO tasks (id, user_id, title, due_date, status, server_revision, server_updated_at, is_deleted, created_at, updated_at)
         VALUES ('t-cancel', 'guest', 'Cancelled', '2026-11-05', 'cancelled', 0, ?, 0, ?, ?);`,
        now,
        now,
        now
      );
      // Soft-deleted task
      await db.runAsync(
        `INSERT INTO tasks (id, user_id, title, due_date, status, server_revision, server_updated_at, is_deleted, created_at, updated_at)
         VALUES ('t-del', 'guest', 'Deleted', '2026-11-05', 'completed', 0, ?, 1, ?, ?);`,
        now,
        now,
        now
      );

      const dayRange = getLocalDayRange(new Date(2026, 10, 5));
      const metric = await getTaskCompletionForPeriod(db, dayRange);
      expect(metric.total).toBe(1);
      expect(metric.completed).toBe(1);
      expect(metric.percentage).toBe(100);
    });

    it('moves postponed task into its new cohort date', async () => {
      const now = new Date(2026, 10, 5, 10, 0, 0).toISOString();
      // Postponed task originally created Nov 5, now due Nov 12
      await db.runAsync(
        `INSERT INTO tasks (id, user_id, title, due_date, status, server_revision, server_updated_at, is_deleted, created_at, updated_at)
         VALUES ('t-postponed', 'guest', 'Postponed', '2026-11-12', 'pending', 0, ?, 0, ?, ?);`,
        now,
        now,
        now
      );

      const nov5Range = getLocalDayRange(new Date(2026, 10, 5));
      const nov5Metric = await getTaskCompletionForPeriod(db, nov5Range);
      expect(nov5Metric.total).toBe(0); // Exited Nov 5 cohort

      const nov12Range = getLocalDayRange(new Date(2026, 10, 12));
      const nov12Metric = await getTaskCompletionForPeriod(db, nov12Range);
      expect(nov12Metric.total).toBe(1); // Entered Nov 12 cohort
    });
  });

  describe('2. Task Activity Calculation & Insertion Tie-Breaking', () => {
    it('evaluates rapid identical-timestamp transitions in their actual insertion order via rowid', async () => {
      const identicalTimestamp = new Date(2026, 10, 5, 14, 0, 0).toISOString();
      const weekRange = getCalendarWeekRange(new Date(2026, 10, 5));

      // 1. Task completed
      await db.runAsync(
        `INSERT INTO task_history (id, task_id, action, timestamp)
         VALUES (?, 'task-rapid', 'completed', ?);`,
        generateUUID(),
        identicalTimestamp
      );
      // 2. Task rapidly uncompleted with the EXACT SAME TIMESTAMP string
      await db.runAsync(
        `INSERT INTO task_history (id, task_id, action, timestamp)
         VALUES (?, 'task-rapid', 'uncompleted', ?);`,
        generateUUID(),
        identicalTimestamp
      );

      const days = await getTaskActivityForPeriod(db, weekRange);
      const nov5 = days.find((d) => d.date === '2026-11-05');
      // Because uncompleted was inserted after completed (higher rowid),
      // the latest state is 'uncompleted' -> activity count must be 0!
      expect(nov5?.completedCount).toBe(0);
    });

    it('evaluates check -> uncheck -> check with identical timestamps as 1 completed count (no double count)', async () => {
      const identicalTimestamp = new Date(2026, 10, 5, 14, 0, 0).toISOString();
      const weekRange = getCalendarWeekRange(new Date(2026, 10, 5));

      // 1. Completed
      await db.runAsync(
        `INSERT INTO task_history (id, task_id, action, timestamp)
         VALUES (?, 'task-recheck', 'completed', ?);`,
        generateUUID(),
        identicalTimestamp
      );
      // 2. Uncompleted
      await db.runAsync(
        `INSERT INTO task_history (id, task_id, action, timestamp)
         VALUES (?, 'task-recheck', 'uncompleted', ?);`,
        generateUUID(),
        identicalTimestamp
      );
      // 3. Completed again (final state)
      await db.runAsync(
        `INSERT INTO task_history (id, task_id, action, timestamp)
         VALUES (?, 'task-recheck', 'completed', ?);`,
        generateUUID(),
        identicalTimestamp
      );

      const days = await getTaskActivityForPeriod(db, weekRange);
      const nov5 = days.find((d) => d.date === '2026-11-05');
      expect(nov5?.completedCount).toBe(1);
    });

    it('preserves historical completion activity when uncompleted on a later day', async () => {
      const mondayTimestamp = new Date(2026, 10, 2, 10, 0, 0).toISOString(); // Nov 2
      const tuesdayTimestamp = new Date(2026, 10, 3, 11, 0, 0).toISOString(); // Nov 3
      const weekRange = getCalendarWeekRange(new Date(2026, 10, 5));

      // Completed on Monday
      await db.runAsync(
        `INSERT INTO task_history (id, task_id, action, timestamp)
         VALUES (?, 'task-monday', 'completed', ?);`,
        generateUUID(),
        mondayTimestamp
      );
      // Uncompleted on Tuesday
      await db.runAsync(
        `INSERT INTO task_history (id, task_id, action, timestamp)
         VALUES (?, 'task-monday', 'uncompleted', ?);`,
        generateUUID(),
        tuesdayTimestamp
      );

      const days = await getTaskActivityForPeriod(db, weekRange);
      const monday = days.find((d) => d.date === '2026-11-02');
      const tuesday = days.find((d) => d.date === '2026-11-03');

      // Monday's historical completion is retained!
      expect(monday?.completedCount).toBe(1);
      // Tuesday uncomplete does not award activity
      expect(tuesday?.completedCount).toBe(0);
    });

    it('ignores non-completion lifecycle actions (edited, postponed, deleted)', async () => {
      const now = new Date(2026, 10, 5, 12, 0, 0).toISOString();
      const weekRange = getCalendarWeekRange(new Date(2026, 10, 5));

      // Completed
      await db.runAsync(
        `INSERT INTO task_history (id, task_id, action, timestamp)
         VALUES (?, 'task-mixed', 'completed', ?);`,
        generateUUID(),
        now
      );
      // Edited later on the same day
      await db.runAsync(
        `INSERT INTO task_history (id, task_id, action, timestamp)
         VALUES (?, 'task-mixed', 'edited', ?);`,
        generateUUID(),
        now
      );

      const days = await getTaskActivityForPeriod(db, weekRange);
      const nov5 = days.find((d) => d.date === '2026-11-05');
      // The 'edited' action must NOT override the completion state!
      expect(nov5?.completedCount).toBe(1);
    });
  });
});
