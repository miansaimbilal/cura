import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations, migrations } from '../../src/db/migrations';
import {
  createTask,
  getTaskById,
  getAllTasks,
  getFilteredTasks,
  updateTask,
  toggleTaskComplete,
  postponeTask,
  cancelTask,
  softDeleteTask,
  getTodaySummary,
  getTaskHistory,
} from '../../src/db/taskRepository';

describe('Real SQLite Database & Task Repository (Integration Tests)', () => {
  let db: NodeSQLiteAdapter;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);
  });

  describe('1. Schema Migrations & Database Initialization', () => {
    it('sets PRAGMA user_version matching migrations length upon completing all migrations', async () => {
      const versionResult = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(versionResult?.user_version).toBe(migrations.length);
    });

    it('creates tasks, sync_outbox, and task_history tables with required indexes in SQLite', async () => {
      const tables = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tasks', 'sync_outbox', 'task_history');`
      );
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('tasks');
      expect(tableNames).toContain('sync_outbox');
      expect(tableNames).toContain('task_history');

      const indexes = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='index' AND (name LIKE 'idx_tasks_%' OR name LIKE 'idx_sync_%' OR name LIKE 'idx_task_history_%');`
      );
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_tasks_user_status');
      expect(indexNames).toContain('idx_tasks_due_date');
      expect(indexNames).toContain('idx_tasks_is_deleted');
      expect(indexNames).toContain('idx_tasks_updated_at');
      expect(indexNames).toContain('idx_sync_outbox_seq');
      expect(indexNames).toContain('idx_task_history_task_id');
      expect(indexNames).toContain('idx_task_history_action');
      expect(indexNames).toContain('idx_task_history_timestamp');
    });

    it('is idempotent: re-running migrations does not alter version or duplicate tables', async () => {
      await runMigrations(db);
      const versionResult = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(versionResult?.user_version).toBe(migrations.length);
    });

    it('backfills created and completed history entries for tasks existing before migration 0002', async () => {
      // 1. Create a separate in-memory database at version 1
      const v1Db = new NodeSQLiteAdapter(':memory:');
      const migration1 = migrations.find((m) => m.version === 1)!;
      await migration1.up(v1Db);
      await v1Db.execAsync('PRAGMA user_version = 1;');

      // 2. Insert pre-existing tasks into tasks table directly
      const now = new Date().toISOString();
      await v1Db.runAsync(
        `INSERT INTO tasks (id, user_id, title, description, due_date, due_time, is_timed, status, completed_at, postponed_at, server_revision, server_updated_at, is_deleted, deleted_at, created_at, updated_at)
         VALUES ('pre-task-1', 'guest', 'Pre-existing Task 1', NULL, '2026-11-04', NULL, 0, 'pending', NULL, NULL, 1, ?, 0, NULL, ?, ?);`,
        now,
        now,
        now
      );
      await v1Db.runAsync(
        `INSERT INTO tasks (id, user_id, title, description, due_date, due_time, is_timed, status, completed_at, postponed_at, server_revision, server_updated_at, is_deleted, deleted_at, created_at, updated_at)
         VALUES ('pre-task-2', 'guest', 'Pre-existing Task 2', NULL, '2026-11-04', NULL, 0, 'completed', ?, NULL, 1, ?, 0, NULL, ?, ?);`,
        now,
        now,
        now,
        now
      );

      // 3. Now run runMigrations(v1Db) to apply migrations 0002 and 0003
      await runMigrations(v1Db);
      const versionResult = await v1Db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(versionResult?.user_version).toBe(migrations.length);

      // 4. Verify backfilled history entries for pre-task-1
      const history1 = await getTaskHistory(v1Db, 'pre-task-1');
      expect(history1.length).toBe(1);
      expect(history1[0].action).toBe('created');
      expect(history1[0].taskId).toBe('pre-task-1');
      expect(history1[0].toDueDate).toBe('2026-11-04');
      expect(history1[0].details).toContain('migration backfill');

      // 5. Verify backfilled history entries for pre-task-2 (created + completed)
      const history2 = await getTaskHistory(v1Db, 'pre-task-2');
      expect(history2.length).toBe(2);
      expect(history2[0].action).toBe('created');
      expect(history2[1].action).toBe('completed');

      // 6. Verify idempotency: re-running runMigrations does NOT duplicate backfilled history
      await runMigrations(v1Db);
      const history1After = await getTaskHistory(v1Db, 'pre-task-1');
      expect(history1After.length).toBe(1);
    });
  });

  describe('2. Unsynced Revision Handling & Outbox Coalescing (Sync Contract Alignment)', () => {
    it('creates new unsynced local task with server_revision = 0 and outbox base_server_revision = 0', async () => {
      const task = await createTask(db, {
        title: 'Morning Yoga',
        description: '20 minutes of gentle stretching',
        dueDate: '2026-11-05',
        dueTime: '08:00',
        isTimed: true,
      });

      expect(task.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(task.title).toBe('Morning Yoga');
      expect(task.status).toBe('pending');
      expect(task.isDeleted).toBe(false);

      // Unsynced draft MUST have server_revision = 0
      expect(task.serverRevision).toBe(0);
      expect(task.userId).toBe('guest');

      // Verify sync_outbox row was created with base_server_revision = 0
      const outboxRows = await db.getAllAsync<{
        mutation_id: string;
        action: string;
        entity_id: string;
        base_server_revision: number;
      }>('SELECT mutation_id, action, entity_id, base_server_revision FROM sync_outbox WHERE entity_id = ?;', task.id);

      expect(outboxRows.length).toBe(1);
      expect(outboxRows[0].action).toBe('INSERT');
      expect(outboxRows[0].entity_id).toBe(task.id);
      expect(outboxRows[0].base_server_revision).toBe(0);
    });

    it('coalesces multiple sequential edits into the pending INSERT mutation prior to first sync', async () => {
      const task = await createTask(db, { title: 'Unsynced draft' });
      expect(task.serverRevision).toBe(0);

      // First edit prior to sync
      await updateTask(db, task.id, {
        title: 'Unsynced draft (edited once)',
        dueTime: '14:00',
      });

      // Second edit prior to sync
      const updated = await updateTask(db, task.id, {
        title: 'Unsynced draft (edited twice)',
        description: 'Coalesced description',
        dueTime: '16:00',
      });

      expect(updated.serverRevision).toBe(0);

      // Outbox MUST contain only 1 coalesced INSERT mutation, NOT multiple redundant INSERT/UPDATE mutations
      const outboxRows = await db.getAllAsync<{
        action: string;
        base_server_revision: number;
        payload: string;
      }>('SELECT action, base_server_revision, payload FROM sync_outbox WHERE entity_id = ? ORDER BY client_sequence ASC;', task.id);

      expect(outboxRows.length).toBe(1);
      expect(outboxRows[0].action).toBe('INSERT');
      expect(outboxRows[0].base_server_revision).toBe(0);

      const parsedPayload = JSON.parse(outboxRows[0].payload);
      expect(parsedPayload.title).toBe('Unsynced draft (edited twice)');
      expect(parsedPayload.description).toBe('Coalesced description');
      expect(parsedPayload.dueTime).toBe('16:00');

      // But task_history STILL retains all transitions (created + edited + edited)
      const history = await getTaskHistory(db, task.id);
      expect(history.length).toBe(3);
      expect(history[0].action).toBe('created');
      expect(history[1].action).toBe('edited');
      expect(history[2].action).toBe('edited');
    });

    it('records an UPDATE mutation with base_server_revision for already-synced tasks', async () => {
      // Create a task and simulate that it has synced to the server (serverRevision = 1)
      const task = await createTask(db, { title: 'Synced task' });
      await db.runAsync('UPDATE tasks SET server_revision = 1 WHERE id = ?;', task.id);
      // Simulate server ack: outbox cleared for the initial INSERT
      await db.runAsync('DELETE FROM sync_outbox WHERE entity_id = ?;', task.id);

      // Now edit the synced task offline
      await updateTask(db, task.id, { title: 'Synced task (edited offline)' });

      const outboxRows = await db.getAllAsync<{
        action: string;
        base_server_revision: number;
        payload: string;
      }>('SELECT action, base_server_revision, payload FROM sync_outbox WHERE entity_id = ?;', task.id);

      expect(outboxRows.length).toBe(1);
      expect(outboxRows[0].action).toBe('UPDATE');
      expect(outboxRows[0].base_server_revision).toBe(1);
      const parsed = JSON.parse(outboxRows[0].payload);
      expect(parsed.title).toBe('Synced task (edited offline)');
    });
  });

  describe('3. Task Transition History (SPEC 6.4, 6.5 & 13)', () => {
    it('records task creation in task_history table', async () => {
      const task = await createTask(db, {
        title: 'History initial task',
        dueDate: '2026-11-05',
      });

      const history = await getTaskHistory(db, task.id);
      expect(history.length).toBe(1);
      expect(history[0].action).toBe('created');
      expect(history[0].toStatus).toBe('pending');
      expect(history[0].toDueDate).toBe('2026-11-05');
      expect(history[0].timestamp).toBeDefined();
    });

    it('reconstructs repeated completion and uncompletion transitions', async () => {
      const task = await createTask(db, { title: 'Toggle task' });

      // 1. Mark complete
      await toggleTaskComplete(db, task.id);
      // 2. Undo completion (mark incomplete)
      await toggleTaskComplete(db, task.id);
      // 3. Mark complete again
      await toggleTaskComplete(db, task.id);

      const history = await getTaskHistory(db, task.id);
      expect(history.length).toBe(4); // created, completed, uncompleted, completed

      expect(history[0].action).toBe('created');
      expect(history[0].toStatus).toBe('pending');

      expect(history[1].action).toBe('completed');
      expect(history[1].fromStatus).toBe('pending');
      expect(history[1].toStatus).toBe('completed');

      expect(history[2].action).toBe('uncompleted');
      expect(history[2].fromStatus).toBe('completed');
      expect(history[2].toStatus).toBe('pending');

      expect(history[3].action).toBe('completed');
      expect(history[3].fromStatus).toBe('pending');
      expect(history[3].toStatus).toBe('completed');
    });

    it('preserves each postponement with previous and new due dates', async () => {
      const task = await createTask(db, {
        title: 'Postponement task',
        dueDate: '2026-11-05',
        dueTime: '10:00',
      });

      // 1. First postponement: to tomorrow (2026-11-06)
      await postponeTask(db, task.id, '2026-11-06', '14:00');

      // 2. Second postponement: to next week (2026-11-13)
      await postponeTask(db, task.id, '2026-11-13', '09:00');

      const history = await getTaskHistory(db, task.id);
      const postponeEvents = history.filter((h) => h.action === 'postponed');

      expect(postponeEvents.length).toBe(2);

      // Verify first postponement retained original due date (2026-11-05) and new due date (2026-11-06)
      expect(postponeEvents[0].fromDueDate).toBe('2026-11-05');
      expect(postponeEvents[0].toDueDate).toBe('2026-11-06');

      // Verify second postponement retained prior due date (2026-11-06) and new due date (2026-11-13)
      expect(postponeEvents[1].fromDueDate).toBe('2026-11-06');
      expect(postponeEvents[1].toDueDate).toBe('2026-11-13');
    });

    it('retains complete transition history even after task is soft-deleted', async () => {
      const task = await createTask(db, { title: 'Lifecycle task', dueDate: '2026-11-05' });
      await updateTask(db, task.id, { title: 'Lifecycle task (renamed)' });
      await toggleTaskComplete(db, task.id);
      await cancelTask(db, task.id);
      await softDeleteTask(db, task.id);

      const history = await getTaskHistory(db, task.id);
      const actions = history.map((h) => h.action);

      // Verify all lifecycle transitions are permanently preserved
      expect(actions).toEqual(['created', 'edited', 'completed', 'cancelled', 'deleted']);

      // Deleting the task from active view does NOT wipe its history
      const activeTasks = await getAllTasks(db);
      expect(activeTasks.find((t) => t.id === task.id)).toBeUndefined();

      // History remains intact for historical analytics
      const preservedHistory = await getTaskHistory(db, task.id);
      expect(preservedHistory.length).toBe(5);
    });
  });

  describe('4. User Isolation & Multi-Tenancy', () => {
    it('isolates tasks between guest and authenticated users', async () => {
      await createTask(db, { title: 'Guest task', userId: 'guest' });
      await createTask(db, { title: 'Auth user task', userId: 'user-auth-uuid-1' });

      const guestTasks = await getAllTasks(db, { userId: 'guest' });
      const authTasks = await getAllTasks(db, { userId: 'user-auth-uuid-1' });

      expect(guestTasks.length).toBe(1);
      expect(guestTasks[0].title).toBe('Guest task');

      expect(authTasks.length).toBe(1);
      expect(authTasks[0].title).toBe('Auth user task');
    });
  });

  describe('5. Task Editing & Status Transitions', () => {
    it('edits a task preserving original createdAt while updating updatedAt', async () => {
      const task = await createTask(db, {
        title: 'Draft plan',
        description: 'First version',
      });

      const updated = await updateTask(db, task.id, {
        title: 'Draft plan v2',
        description: 'Updated with team feedback',
        dueTime: '15:30',
        isTimed: true,
      });

      expect(updated.title).toBe('Draft plan v2');
      expect(updated.description).toBe('Updated with team feedback');
      expect(updated.dueTime).toBe('15:30');
      expect(updated.isTimed).toBe(true);
      expect(updated.createdAt).toBe(task.createdAt);
      expect(updated.id).toBe(task.id);
    });

    it('marks a task as completed and updates completedAt', async () => {
      const task = await createTask(db, { title: 'Drink water' });
      expect(task.status).toBe('pending');
      expect(task.completedAt).toBeNull();

      const completed = await toggleTaskComplete(db, task.id);
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).not.toBeNull();

      // Undo completion
      const pendingAgain = await toggleTaskComplete(db, task.id);
      expect(pendingAgain.status).toBe('pending');
      expect(pendingAgain.completedAt).toBeNull();
    });

    it('cancels a task without deleting it', async () => {
      const task = await createTask(db, { title: 'Optional meetup' });
      const cancelled = await cancelTask(db, task.id);

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.isDeleted).toBe(false);
    });
  });

  describe('6. Soft Deletion & Tombstone Guarantees', () => {
    it('soft deletes via tombstone (is_deleted = 1) and excludes from active views', async () => {
      const task = await createTask(db, { title: 'Temporary reminder' });

      const deleted = await softDeleteTask(db, task.id);
      expect(deleted).toBe(true);

      // Active tasks must NOT include deleted item
      const activeTasks = await getAllTasks(db);
      expect(activeTasks.find((t) => t.id === task.id)).toBeUndefined();

      // But tombstone remains in database for cloud sync replication
      const allWithDeleted = await getAllTasks(db, { includeDeleted: true });
      const tombstone = allWithDeleted.find((t) => t.id === task.id);
      expect(tombstone).toBeDefined();
      expect(tombstone?.isDeleted).toBe(true);
      expect(tombstone?.deletedAt).not.toBeNull();

      // Verify DELETE outbox entry
      const outbox = await db.getAllAsync<{ action: string }>(
        "SELECT action FROM sync_outbox WHERE entity_id = ? AND action = 'DELETE';",
        task.id
      );
      expect(outbox.length).toBe(1);
    });
  });

  describe('7. Task Filtering & Today Summary', () => {
    it('filters today, upcoming, completed, and all tasks correctly', async () => {
      const today = '2026-11-05';

      // 1. Task due today (pending)
      await createTask(db, { title: 'Today Task 1', dueDate: today });
      // 2. Task due today (completed)
      const task2 = await createTask(db, { title: 'Today Task 2', dueDate: today });
      await toggleTaskComplete(db, task2.id);
      // 3. Overdue incomplete task from yesterday
      await createTask(db, { title: 'Overdue Task', dueDate: '2026-11-04' });
      // 4. Future upcoming task
      await createTask(db, { title: 'Upcoming Task', dueDate: '2026-11-10' });

      // Today filter: includes today's tasks + overdue incomplete tasks
      const todayTasks = await getFilteredTasks(db, 'today', { currentDate: today });
      expect(todayTasks.map((t) => t.title)).toContain('Today Task 1');
      expect(todayTasks.map((t) => t.title)).toContain('Today Task 2');
      expect(todayTasks.map((t) => t.title)).toContain('Overdue Task');
      expect(todayTasks.map((t) => t.title)).not.toContain('Upcoming Task');

      // Upcoming filter: future dates only
      const upcomingTasks = await getFilteredTasks(db, 'upcoming', { currentDate: today });
      expect(upcomingTasks.length).toBe(1);
      expect(upcomingTasks[0].title).toBe('Upcoming Task');

      // Completed filter: completed only
      const completedTasks = await getFilteredTasks(db, 'completed');
      expect(completedTasks.length).toBe(1);
      expect(completedTasks[0].title).toBe('Today Task 2');

      // Today summary counts
      const summary = await getTodaySummary(db, today);
      expect(summary.total).toBe(3); // Today Task 1, Today Task 2, Overdue Task
      expect(summary.completed).toBe(1);
      expect(summary.remaining).toBe(2);
      expect(summary.overdue).toBe(1);
    });
  });

  describe('8. Transaction Atomicity & Rollback', () => {
    it('rolls back completely if an error occurs within a transaction', async () => {
      const countBefore = (await getAllTasks(db)).length;

      try {
        await db.withTransactionAsync(async () => {
          await db.runAsync(
            `INSERT INTO tasks (id, user_id, title, server_revision, server_updated_at, created_at, updated_at)
             VALUES ('test-rollback-id', 'guest', 'Will be rolled back', 0, 'now', 'now', 'now');`
          );
          throw new Error('Simulated transaction failure');
        });
      } catch {
        // Expected error
      }

      const countAfter = (await getAllTasks(db)).length;
      expect(countAfter).toBe(countBefore);

      const rolledBackTask = await getTaskById(db, 'test-rollback-id');
      expect(rolledBackTask).toBeNull();
    });
  });

  describe('9. Database Persistence Across App Restart', () => {
    it('persists tasks on disk across closing and reopening the SQLite database', async () => {
      const tempDbPath = path.join(os.tmpdir(), `cura-test-${Date.now()}.db`);

      try {
        // 1. First app session: initialize and insert task
        const dbSession1 = new NodeSQLiteAdapter(tempDbPath);
        await runMigrations(dbSession1);
        const created = await createTask(dbSession1, {
          title: 'Persistent task across restart',
          dueDate: '2026-11-05',
          dueTime: '11:00',
        });
        await dbSession1.closeAsync();

        // 2. Second app session: simulate app restart
        const dbSession2 = new NodeSQLiteAdapter(tempDbPath);
        await runMigrations(dbSession2);

        const retrieved = await getTaskById(dbSession2, created.id);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.title).toBe('Persistent task across restart');
        expect(retrieved?.dueDate).toBe('2026-11-05');
        expect(retrieved?.dueTime).toBe('11:00');
        expect(retrieved?.serverRevision).toBe(0);

        await dbSession2.closeAsync();
      } finally {
        if (fs.existsSync(tempDbPath)) {
          fs.unlinkSync(tempDbPath);
        }
      }
    });
  });
});
