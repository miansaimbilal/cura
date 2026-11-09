import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import { createTask, getAllTasks, toggleTaskComplete } from '../../src/db/taskRepository';
import { createMoodEntry, getMoodEntriesByDateRange, getMoodDistribution } from '../../src/db/moodRepository';
import { createConversation, createMessage, getMessages } from '../../src/db/chatRepository';
import { getTaskCompletionForPeriod, getTaskActivityForPeriod } from '../../src/utils/analytics';
import { buildWidgetSnapshot } from '../../src/services/widgets/snapshotBuilder';

describe('Phase 10: Performance & Load Benchmarks', () => {
  let db: NodeSQLiteAdapter;
  const userId = 'usr_perf_test';

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);
  });

  it('1. App Cold-Start Benchmark: DB initialization + schema migration + session + snapshot', async () => {
    const start = performance.now();

    // Cold-start simulation: spin up a fresh connection and run all schema migrations
    const coldDb = new NodeSQLiteAdapter(':memory:');
    await runMigrations(coldDb);

    // Initial state query (tasks + initial widget snapshot)
    const today = '2026-11-09';
    await getAllTasks(coldDb, { userId });
    await buildWidgetSnapshot(coldDb, { userId, currentDate: today });

    const duration = performance.now() - start;
    // Cold start with in-memory SQLite and full 6 migrations should execute under 500ms
    expect(duration).toBeLessThan(500);
    console.log(`[PERF BENCHMARK] Cold start initialization: ${duration.toFixed(2)}ms`);
  });

  it('2. List Scroll Benchmark: 100 tasks retrieval and sorting', async () => {
    const today = '2026-11-09';
    // Seed 100 tasks with mixed timed/untimed, statuses, and tags
    for (let i = 0; i < 100; i++) {
      const t = await createTask(db, {
        userId,
        title: `Task performance item #${i + 1}`,
        dueDate: today,
        dueTime: i % 2 === 0 ? `${String(8 + (i % 12)).padStart(2, '0')}:00` : null,
      });
      if (i % 5 === 0) {
        await toggleTaskComplete(db, t.id);
      }
    }

    const start = performance.now();
    // Retrieve and process the 100 items
    const tasks = await getAllTasks(db, { userId });
    const sorted = [...tasks].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'completed' ? 1 : -1;
      if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
      if (a.dueTime) return -1;
      if (b.dueTime) return 1;
      return 0;
    });

    const duration = performance.now() - start;
    expect(sorted.length).toBe(100);
    // 100 tasks query + sorting should take well under 500ms even under heavy CPU contention
    expect(duration).toBeLessThan(500);
    console.log(`[PERF BENCHMARK] 100 tasks query & sort: ${duration.toFixed(2)}ms`);
  });

  it('3. Analytics with 1 Year of Data (365 days of tasks and mood entries)', async () => {
    // Seed 1 year of entries: 365 days
    const seedStart = performance.now();
    const startDate = new Date('2025-11-09T00:00:00.000Z');
    const moodTypes = ['happy', 'calm', 'excited', 'okay', 'tired', 'stressed', 'sad', 'anxious', 'angry'] as const;

    for (let day = 0; day < 365; day++) {
      const d = new Date(startDate.getTime() + day * 86400000);
      const iso = d.toISOString();
      const dateStr = iso.slice(0, 10);
      const mood = moodTypes[day % moodTypes.length];

      await createMoodEntry(db, {
        userId,
        moodType: mood,
        loggedAt: iso,
        note: `Day ${day} note`,
      });

      const task = await createTask(db, {
        userId,
        title: `Yearly task day ${day}`,
        dueDate: dateStr,
      });
      if (day % 2 === 0) {
        await toggleTaskComplete(db, task.id);
      }
    }
    const seedDuration = performance.now() - seedStart;
    console.log(`[PERF BENCHMARK] Seeded 365 days (730 records) in ${seedDuration.toFixed(2)}ms`);

    // Benchmark Analytics Computations over the 1-year date range
    const startRange = '2025-11-09T00:00:00.000Z';
    const endRange = '2026-11-09T23:59:59.999Z';
    const benchStart = performance.now();

    const dateRange = {
      startDate: '2025-11-09',
      endDate: '2026-11-09',
      startISO: startRange,
      endISO: endRange,
      label: '1 Year',
    };

    const [distribution, entries, completion, activity] = await Promise.all([
      getMoodDistribution(db, startRange, endRange, userId),
      getMoodEntriesByDateRange(db, startRange, endRange, { userId }),
      getTaskCompletionForPeriod(db, dateRange, userId),
      getTaskActivityForPeriod(db, dateRange),
    ]);

    const benchDuration = performance.now() - benchStart;
    expect(distribution.total).toBe(365);
    expect(entries.length).toBe(365);
    expect(completion.total).toBe(365);
    expect(activity.length).toBeGreaterThan(0);
    // Computation across 1 year should complete within 500ms
    expect(benchDuration).toBeLessThan(500);
    console.log(`[PERF BENCHMARK] 1-Year Analytics calculation: ${benchDuration.toFixed(2)}ms`);
  });

  it('4. Chat Benchmark: Conversation with 200 messages retrieval & context construction', async () => {
    const convo = await createConversation(db, {
      userId,
      title: 'Benchmark Conversation',
    });

    for (let i = 0; i < 200; i++) {
      await createMessage(db, {
        conversationId: convo.id,
        sender: i % 2 === 0 ? 'user' : 'assistant',
        content: `Benchmark message turn #${i + 1}. Discussion of productivity and mood reflection.`,
      });
    }

    const start = performance.now();
    const messages = await getMessages(db, convo.id, 250);
    // Simulate context slicing (recent 20 turns)
    const recentTurns = messages.slice(-20);
    const contextPrompt = recentTurns.map((m) => `${m.sender}: ${m.content}`).join('\n');

    const duration = performance.now() - start;
    expect(messages.length).toBe(200);
    expect(contextPrompt.length).toBeGreaterThan(500);
    // 200 messages query + prompt slicing under 500ms
    expect(duration).toBeLessThan(500);
    console.log(`[PERF BENCHMARK] 200 messages chat query & context slicing: ${duration.toFixed(2)}ms`);
  });
});
