import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import {
  createTask,
  toggleTaskComplete,
  cancelTask,
  softDeleteTask,
} from '../../src/db/taskRepository';
import { createMoodEntry } from '../../src/db/moodRepository';
import { calculateDailySummary, buildSingleDayRange } from '../../src/services/dailySummaryService';
import { MOODS } from '../../src/constants';
import { MoodType } from '../../src/types/mood';
import { getLocalDateString } from '../../src/utils/date';

describe('Step 2.4: On-Demand Daily Summary (Integration Tests)', () => {
  let db: NodeSQLiteAdapter;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await runMigrations(db);
  });

  describe('1. Architectural Safety: Pure On-Demand Calculation', () => {
    it('does NOT create a daily_summaries or cache table in SQLite', async () => {
      const tables = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = 'daily_summaries';`
      );
      expect(tables.length).toBe(0);
    });

    it('builds a strict local single-day range without UTC shifts', () => {
      const range = buildSingleDayRange('2026-11-06');
      expect(range.startDate).toBe('2026-11-06');
      expect(range.endDate).toBe('2026-11-06');
      expect(range.startISO.length).toBeGreaterThan(0);
      expect(range.endISO.length).toBeGreaterThan(0);
    });

    it('throws when requested date is not a valid YYYY-MM-DD calendar date', () => {
      expect(() => buildSingleDayRange('not-a-date')).toThrow();
      expect(() => buildSingleDayRange('2026-02-31')).toThrow();
      expect(() => buildSingleDayRange('2026-99-99')).toThrow();
    });
  });

  describe('2. Task Throughput Calculation (Single Source: task_history)', () => {
    it('counts completed tasks on the requested local date', async () => {
      const t1 = await createTask(db, {
        title: 'Task 1',
        dueDate: '2026-11-06',
      });
      const t2 = await createTask(db, {
        title: 'Task 2',
        dueDate: '2026-11-06',
      });

      // Complete both tasks
      await toggleTaskComplete(db, t1.id);
      await toggleTaskComplete(db, t2.id);

      const summary = await calculateDailySummary(db, '2026-11-06');
      expect(summary.throughput.completedCount).toBe(2);
    });

    it('uses latest transition and tie-breaks by rowid DESC when task is toggled back and forth', async () => {
      const t = await createTask(db, {
        title: 'Flipping Task',
        dueDate: '2026-11-06',
      });

      // Toggle to completed
      await toggleTaskComplete(db, t.id);
      // Toggle back to pending (action = 'uncompleted')
      await toggleTaskComplete(db, t.id);

      const summaryAfterUncomplete = await calculateDailySummary(db, '2026-11-06');
      // Latest transition is 'uncompleted' -> not counted in throughput!
      expect(summaryAfterUncomplete.throughput.completedCount).toBe(0);

      // Toggle back to completed
      await toggleTaskComplete(db, t.id);
      const summaryAfterRecomplete = await calculateDailySummary(db, '2026-11-06');
      expect(summaryAfterRecomplete.throughput.completedCount).toBe(1);
    });

    it('does not count tasks completed on other local calendar days', async () => {
      const tPast = await createTask(db, {
        title: 'Past Task',
        dueDate: '2026-11-05',
      });

      // Insert past history completion manually on 2026-11-05
      await db.runAsync(
        `INSERT INTO task_history (id, task_id, action, timestamp)
         VALUES ('hist-past', ?, 'completed', '2026-11-05T14:00:00.000Z');`,
        tPast.id
      );

      const summaryToday = await calculateDailySummary(db, '2026-11-06');
      expect(summaryToday.throughput.completedCount).toBe(0);

      const summaryPast = await calculateDailySummary(db, '2026-11-05');
      expect(summaryPast.throughput.completedCount).toBe(1);
    });
  });

  describe('3. Task Cohort Completion Metric', () => {
    it('returns null percentage when the cohort has zero tasks', async () => {
      const summary = await calculateDailySummary(db, '2026-11-06');
      expect(summary.cohort.total).toBe(0);
      expect(summary.cohort.completed).toBe(0);
      expect(summary.cohort.percentage).toBeNull();
    });

    it('evaluates scheduled cohort tasks for the requested date', async () => {
      const t1 = await createTask(db, { title: 'T1', dueDate: '2026-11-06' });
      await createTask(db, { title: 'T2', dueDate: '2026-11-06' });
      await createTask(db, { title: 'T3 Tomorrow', dueDate: '2026-11-07' });

      await toggleTaskComplete(db, t1.id);

      const summary = await calculateDailySummary(db, '2026-11-06');
      expect(summary.cohort.total).toBe(2);
      expect(summary.cohort.completed).toBe(1);
      expect(summary.cohort.percentage).toBe(50);
    });

    it('assigns untimed tasks (no due_date) to their creation local date cohort', async () => {
      // Create untimed task (dueDate is null)
      const untimed = await createTask(db, { title: 'Untimed' });
      expect(untimed.dueDate).toBeNull();

      const todayStr = getLocalDateString();
      const summary = await calculateDailySummary(db, todayStr);
      expect(summary.cohort.total).toBeGreaterThanOrEqual(1);
    });

    it('strictly excludes cancelled and soft-deleted tasks from the cohort', async () => {
      const tNormal = await createTask(db, { title: 'Active', dueDate: '2026-11-06' });
      const tCancelled = await createTask(db, { title: 'To Cancel', dueDate: '2026-11-06' });
      const tDeleted = await createTask(db, { title: 'To Delete', dueDate: '2026-11-06' });

      await cancelTask(db, tCancelled.id);
      await softDeleteTask(db, tDeleted.id);
      await toggleTaskComplete(db, tNormal.id);

      const summary = await calculateDailySummary(db, '2026-11-06');
      // Cancelled and deleted are excluded from total
      expect(summary.cohort.total).toBe(1);
      expect(summary.cohort.completed).toBe(1);
      expect(summary.cohort.percentage).toBe(100);
    });
  });

  describe('4. Mood Distribution Metric', () => {
    it('returns empty distribution when no moods are logged (never neutral)', async () => {
      const summary = await calculateDailySummary(db, '2026-11-06');
      expect(summary.mood.total).toBe(0);
      expect(summary.mood.items).toEqual([]);
      expect(summary.mood.mostFrequentMood).toBeNull();
    });

    it('supports and calculates distribution across categorical moods on that day', async () => {
      // Insert entries on 2026-11-06
      await createMoodEntry(db, {
        moodType: 'calm',
        loggedAt: '2026-11-06T09:00:00.000Z',
      });
      await createMoodEntry(db, {
        moodType: 'calm',
        loggedAt: '2026-11-06T14:00:00.000Z',
      });
      await createMoodEntry(db, {
        moodType: 'happy',
        loggedAt: '2026-11-06T18:00:00.000Z',
      });

      const summary = await calculateDailySummary(db, '2026-11-06');
      expect(summary.mood.total).toBe(3);
      expect(summary.mood.mostFrequentMood).toBe('calm');

      const calmItem = summary.mood.items.find((i) => i.moodType === 'calm');
      expect(calmItem).toBeDefined();
      expect(calmItem?.count).toBe(2);
      expect(calmItem?.percentage).toBe(67);

      const happyItem = summary.mood.items.find((i) => i.moodType === 'happy');
      expect(happyItem).toBeDefined();
      expect(happyItem?.count).toBe(1);
      expect(happyItem?.percentage).toBe(33);
    });

    it('verifies all nine categorical mood categories are supported', async () => {
      const allMoodTypes: MoodType[] = [
        'happy',
        'calm',
        'excited',
        'okay',
        'tired',
        'stressed',
        'sad',
        'anxious',
        'angry',
      ];

      expect(MOODS.length).toBe(9);
      for (const m of allMoodTypes) {
        expect(MOODS.some((def) => def.id === m)).toBe(true);
      }
    });
  });
});
