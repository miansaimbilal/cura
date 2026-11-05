import { IDatabase } from '../types';
import { generateUUID } from '../../utils/uuid';

export interface Migration {
  version: number;
  name: string;
  up: (db: IDatabase) => Promise<void>;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: '0001_initial_tasks_and_outbox',
    up: async (db: IDatabase) => {
      // 1. Create local tasks table matching backend schema contract
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL DEFAULT 'guest',
          title TEXT NOT NULL,
          description TEXT,
          due_date TEXT,
          due_time TEXT,
          is_timed INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending',
          completed_at TEXT,
          postponed_at TEXT,
          server_revision INTEGER NOT NULL DEFAULT 1,
          server_updated_at TEXT NOT NULL,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // 2. Create sync_outbox table for monotonic client mutation sequencing (Decision 0.10)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sync_outbox (
          client_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          mutation_id TEXT UNIQUE NOT NULL,
          user_id TEXT NOT NULL DEFAULT 'guest',
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          base_server_revision INTEGER NOT NULL DEFAULT 1,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

      // 3. Create performance indexes
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
        CREATE INDEX IF NOT EXISTS idx_tasks_is_deleted ON tasks(is_deleted);
        CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_seq ON sync_outbox(client_sequence);
      `);
    },
  },
  {
    version: 2,
    name: '0002_task_history',
    up: async (db: IDatabase) => {
      // 1. Create task_history table for auditing lifecycle transitions and analytics (SPEC 6.5 & 13)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS task_history (
          id TEXT PRIMARY KEY NOT NULL,
          task_id TEXT NOT NULL,
          action TEXT NOT NULL,
          from_status TEXT,
          to_status TEXT,
          from_due_date TEXT,
          to_due_date TEXT,
          details TEXT,
          timestamp TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_history_action ON task_history(action);
        CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp);
      `);

      // 2. Safe, idempotent backfill of 'created' history for pre-existing tasks
      const existingTasks = await db.getAllAsync<{
        id: string;
        status: string;
        due_date: string | null;
        created_at: string;
        completed_at: string | null;
      }>(
        `SELECT id, status, due_date, created_at, completed_at FROM tasks
         WHERE id NOT IN (SELECT task_id FROM task_history WHERE action = 'created');`
      );

      for (const task of existingTasks) {
        await db.runAsync(
          `INSERT INTO task_history (
            id, task_id, action, from_status, to_status, from_due_date, to_due_date, details, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          generateUUID(),
          task.id,
          'created',
          null,
          'pending',
          null,
          task.due_date,
          'Task created (migration backfill)',
          task.created_at
        );

        if (task.status === 'completed' && task.completed_at) {
          await db.runAsync(
            `INSERT INTO task_history (
              id, task_id, action, from_status, to_status, from_due_date, to_due_date, details, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            generateUUID(),
            task.id,
            'completed',
            'pending',
            'completed',
            null,
            null,
            'Task completed (migration backfill)',
            task.completed_at
          );
        }
      }
    },
  },
  {
    version: 3,
    name: '0003_mood_entries',
    up: async (db: IDatabase) => {
      // 1. Create local mood_entries table matching backend PostgreSQL schema contract
      // server_revision defaults to 0 (unsynced local draft)
      // server_updated_at is strictly NULL until synchronized with the backend
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS mood_entries (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL DEFAULT 'guest',
          mood_type TEXT NOT NULL,
          note TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          logged_at TEXT NOT NULL,
          server_revision INTEGER NOT NULL DEFAULT 0,
          server_updated_at TEXT,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_mood_entries_user_deleted ON mood_entries(user_id, is_deleted);
        CREATE INDEX IF NOT EXISTS idx_mood_entries_logged_at ON mood_entries(logged_at);
        CREATE INDEX IF NOT EXISTS idx_mood_entries_mood_type ON mood_entries(mood_type);
        CREATE INDEX IF NOT EXISTS idx_mood_entries_updated_at ON mood_entries(updated_at);
      `);
    },
  },
  {
    version: 4,
    name: '0004_conversations_and_messages',
    up: async (db: IDatabase) => {
      // 1. Create local conversations table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL DEFAULT 'guest',
          title TEXT,
          conversation_type TEXT NOT NULL DEFAULT 'general',
          server_revision INTEGER NOT NULL DEFAULT 0,
          server_updated_at TEXT,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY NOT NULL,
          conversation_id TEXT NOT NULL,
          sender TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'completed',
          provider_used TEXT,
          model_used TEXT,
          client_message_id TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS conversation_summaries (
          id TEXT PRIMARY KEY NOT NULL,
          conversation_id TEXT NOT NULL,
          summary_text TEXT NOT NULL,
          key_topics TEXT NOT NULL DEFAULT '[]',
          last_message_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, is_deleted, updated_at);
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages(client_message_id);
      `);
    },
  },
];

/**
 * Runs pending database migrations in sequence using PRAGMA user_version.
 */
export async function runMigrations(db: IDatabase): Promise<void> {
  // Read current schema version
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = result?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      await db.withTransactionAsync(async () => {
        await migration.up(db);
        await db.execAsync(`PRAGMA user_version = ${migration.version};`);
      });
    }
  }
}
