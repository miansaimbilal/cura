import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';

describe('Migration 0006 Integration Tests', () => {
  let db: NodeSQLiteAdapter;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);
  });

  it('processed_actions table exists with expected schema columns', async () => {
    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = 'processed_actions';`
    );
    expect(tables.map((t) => t.name)).toContain('processed_actions');

    const columns = await db.getAllAsync<{ name: string; type: string; notnull: number }>(
      `PRAGMA table_info(processed_actions);`
    );
    const colNames = columns.map((c) => c.name);

    // Primary key action identifier
    expect(colNames.includes('action_id') || colNames.includes('id')).toBe(true);

    // Ledger contract columns
    expect(colNames).toContain('user_id');
    expect(colNames).toContain('action_type');
    expect(colNames).toContain('target_id');
    expect(colNames).toContain('requested_state');
    expect(colNames).toContain('applied_state');
    expect(colNames).toContain('status');
    expect(colNames).toContain('rejection_reason');
    expect(colNames).toContain('payload_hash');
    expect(colNames).toContain('client_action_time');
    expect(colNames).toContain('created_at');
  });

  it('widget_snapshot_metadata singleton row exists, id = 1, CHECK (published_revision <= source_revision) holds', async () => {
    const meta = await db.getFirstAsync<{
      id: number;
      source_revision: number;
      published_revision: number;
      account_epoch: number;
    }>(`SELECT id, source_revision, published_revision, account_epoch FROM widget_snapshot_metadata WHERE id = 1;`);

    expect(meta).not.toBeNull();
    expect(meta?.id).toBe(1);
    expect(meta?.published_revision).toBeLessThanOrEqual(meta!.source_revision);

    // Valid update: published_revision <= source_revision
    await db.runAsync(
      `UPDATE widget_snapshot_metadata SET source_revision = 5, published_revision = 5 WHERE id = 1;`
    );

    // Invalid update violating CHECK (published_revision <= source_revision) must throw
    await expect(
      db.runAsync(
        `UPDATE widget_snapshot_metadata SET source_revision = 5, published_revision = 10 WHERE id = 1;`
      )
    ).rejects.toThrow();
  });

  it('INSERT INTO tasks -> source_revision +1', async () => {
    const before = await db.getFirstAsync<{ source_revision: number }>(
      `SELECT source_revision FROM widget_snapshot_metadata WHERE id = 1;`
    );

    await db.runAsync(
      `INSERT INTO tasks (id, user_id, title, status, created_at, updated_at, server_updated_at)
       VALUES ('task_trg_1', 'usr_test', 'Trigger Task', 'pending', datetime('now'), datetime('now'), datetime('now'));`
    );

    const after = await db.getFirstAsync<{ source_revision: number }>(
      `SELECT source_revision FROM widget_snapshot_metadata WHERE id = 1;`
    );

    expect(after?.source_revision).toBe(before!.source_revision + 1);
  });

  it('UPDATE tasks SET description = x (unrendered column) -> source_revision does NOT increase - proves column-targeted trigger', async () => {
    await db.runAsync(
      `INSERT INTO tasks (id, user_id, title, description, status, created_at, updated_at, server_updated_at)
       VALUES ('task_trg_2', 'usr_test', 'Trigger Task 2', 'Initial Note', 'pending', datetime('now'), datetime('now'), datetime('now'));`
    );

    const before = await db.getFirstAsync<{ source_revision: number }>(
      `SELECT source_revision FROM widget_snapshot_metadata WHERE id = 1;`
    );

    // Mutate unrendered description column
    await db.runAsync(
      `UPDATE tasks SET description = 'Updated Note Description' WHERE id = 'task_trg_2';`
    );

    const after = await db.getFirstAsync<{ source_revision: number }>(
      `SELECT source_revision FROM widget_snapshot_metadata WHERE id = 1;`
    );

    expect(after?.source_revision).toBe(before?.source_revision);
  });

  it('UPDATE tasks SET status = completed -> source_revision +1', async () => {
    await db.runAsync(
      `INSERT INTO tasks (id, user_id, title, status, created_at, updated_at, server_updated_at)
       VALUES ('task_trg_3', 'usr_test', 'Trigger Task 3', 'pending', datetime('now'), datetime('now'), datetime('now'));`
    );

    const before = await db.getFirstAsync<{ source_revision: number }>(
      `SELECT source_revision FROM widget_snapshot_metadata WHERE id = 1;`
    );

    await db.runAsync(
      `UPDATE tasks SET status = 'completed', completed_at = datetime('now') WHERE id = 'task_trg_3';`
    );

    const after = await db.getFirstAsync<{ source_revision: number }>(
      `SELECT source_revision FROM widget_snapshot_metadata WHERE id = 1;`
    );

    expect(after?.source_revision).toBe(before!.source_revision + 1);
  });

  it('INSERT INTO mood_entries -> source_revision +1', async () => {
    const before = await db.getFirstAsync<{ source_revision: number }>(
      `SELECT source_revision FROM widget_snapshot_metadata WHERE id = 1;`
    );

    await db.runAsync(
      `INSERT INTO mood_entries (id, user_id, mood_type, logged_at, created_at, updated_at)
       VALUES ('mood_trg_1', 'usr_test', 'calm', datetime('now'), datetime('now'), datetime('now'));`
    );

    const after = await db.getFirstAsync<{ source_revision: number }>(
      `SELECT source_revision FROM widget_snapshot_metadata WHERE id = 1;`
    );

    expect(after?.source_revision).toBe(before!.source_revision + 1);
  });

  it('UPDATE mood_entries SET note = x -> source_revision does NOT increase', async () => {
    await db.runAsync(
      `INSERT INTO mood_entries (id, user_id, mood_type, note, logged_at, created_at, updated_at)
       VALUES ('mood_trg_2', 'usr_test', 'calm', 'Initial reflection', datetime('now'), datetime('now'), datetime('now'));`
    );

    const before = await db.getFirstAsync<{ source_revision: number }>(
      `SELECT source_revision FROM widget_snapshot_metadata WHERE id = 1;`
    );

    // Update unrendered note column on mood_entries
    await db.runAsync(
      `UPDATE mood_entries SET note = 'Updated reflection text' WHERE id = 'mood_trg_2';`
    );

    const after = await db.getFirstAsync<{ source_revision: number }>(
      `SELECT source_revision FROM widget_snapshot_metadata WHERE id = 1;`
    );

    expect(after?.source_revision).toBe(before?.source_revision);
  });
});
