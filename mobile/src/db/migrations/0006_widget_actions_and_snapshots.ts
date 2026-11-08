import { IDatabase } from '../types';
import type { Migration } from './index';

export const migration0006: Migration = {
  version: 6,
  name: '0006_widget_actions_and_snapshots',
  up: async (db: IDatabase): Promise<void> => {
    await db.execAsync(`
      -- 1. Create processed_actions receipt table
      CREATE TABLE IF NOT EXISTS processed_actions (
        action_id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        action_type TEXT NOT NULL CHECK (action_type IN ('task_toggle', 'mood_log')),
        target_id TEXT NOT NULL,
        requested_state TEXT NOT NULL,
        applied_state TEXT,
        status TEXT NOT NULL CHECK (status IN ('applied', 'no_op', 'rejected')),
        rejection_reason TEXT,
        payload_hash TEXT NOT NULL,
        client_action_time TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT check_rejection_reason_consistency CHECK (
          (status = 'rejected' AND rejection_reason IS NOT NULL) OR
          (status != 'rejected' AND rejection_reason IS NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_processed_actions_target_time 
      ON processed_actions (target_id, client_action_time DESC);

      CREATE INDEX IF NOT EXISTS idx_processed_actions_created_at 
      ON processed_actions (created_at DESC);

      -- 2. Enforce SQL-level immutability on processed_actions
      CREATE TRIGGER IF NOT EXISTS trg_processed_actions_no_update
      BEFORE UPDATE ON processed_actions
      BEGIN
        SELECT RAISE(ABORT, 'processed_actions rows are immutable and cannot be updated');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_processed_actions_no_delete
      BEFORE DELETE ON processed_actions
      BEGIN
        SELECT RAISE(ABORT, 'processed_actions rows are append-only and cannot be deleted');
      END;

      -- 3. Create widget_snapshot_metadata singleton table
      CREATE TABLE IF NOT EXISTS widget_snapshot_metadata (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        source_revision INTEGER NOT NULL DEFAULT 0 CHECK (source_revision >= 0),
        published_revision INTEGER NOT NULL DEFAULT 0 CHECK (published_revision >= 0),
        account_epoch INTEGER NOT NULL DEFAULT 0 CHECK (account_epoch >= 0),
        user_id TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT check_published_le_source CHECK (published_revision <= source_revision)
      );

      -- Seed metadata singleton
      INSERT OR IGNORE INTO widget_snapshot_metadata (
        id, source_revision, published_revision, account_epoch, user_id, updated_at
      ) VALUES (1, 0, 0, 0, NULL, datetime('now'));

      -- 4. Triggers on tasks to advance source_revision atomically
      CREATE TRIGGER IF NOT EXISTS trg_tasks_snapshot_source_rev_insert
      AFTER INSERT ON tasks
      BEGIN
        UPDATE widget_snapshot_metadata
        SET source_revision = source_revision + 1,
            updated_at = datetime('now')
        WHERE id = 1;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_tasks_snapshot_source_rev_update
      AFTER UPDATE OF title, due_date, due_time, is_timed, status, completed_at, is_deleted, user_id ON tasks
      BEGIN
        UPDATE widget_snapshot_metadata
        SET source_revision = source_revision + 1,
            updated_at = datetime('now')
        WHERE id = 1;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_tasks_snapshot_source_rev_delete
      AFTER DELETE ON tasks
      BEGIN
        UPDATE widget_snapshot_metadata
        SET source_revision = source_revision + 1,
            updated_at = datetime('now')
        WHERE id = 1;
      END;

      -- 5. Triggers on mood_entries to advance source_revision atomically
      CREATE TRIGGER IF NOT EXISTS trg_mood_snapshot_source_rev_insert
      AFTER INSERT ON mood_entries
      BEGIN
        UPDATE widget_snapshot_metadata
        SET source_revision = source_revision + 1,
            updated_at = datetime('now')
        WHERE id = 1;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_mood_snapshot_source_rev_update
      AFTER UPDATE OF mood_type, logged_at, is_deleted, user_id ON mood_entries
      BEGIN
        UPDATE widget_snapshot_metadata
        SET source_revision = source_revision + 1,
            updated_at = datetime('now')
        WHERE id = 1;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_mood_snapshot_source_rev_delete
      AFTER DELETE ON mood_entries
      BEGIN
        UPDATE widget_snapshot_metadata
        SET source_revision = source_revision + 1,
            updated_at = datetime('now')
        WHERE id = 1;
      END;
    `);
  },
};
