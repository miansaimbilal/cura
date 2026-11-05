import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import {
  createMoodEntry,
  getMoodEntryById,
  getAllMoodEntries,
  getMoodEntriesByDateRange,
  updateMoodEntry,
  deleteMoodEntry,
  getMoodDistribution,
} from '../../src/db/moodRepository';

describe('Real SQLite Database & Mood Repository (Integration Tests)', () => {
  let db: NodeSQLiteAdapter;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);
  });

  describe('1. Migration 0003 & Database Initialization', () => {
    it('sets PRAGMA user_version = 3 upon completing migration 0003', async () => {
      const versionResult = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(versionResult?.user_version).toBeGreaterThanOrEqual(3);
    });

    it('creates mood_entries table and performance indexes in SQLite', async () => {
      const tables = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = 'mood_entries';`
      );
      expect(tables.map((t) => t.name)).toContain('mood_entries');

      const indexes = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_mood_entries_%';`
      );
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_mood_entries_user_deleted');
      expect(indexNames).toContain('idx_mood_entries_logged_at');
      expect(indexNames).toContain('idx_mood_entries_mood_type');
      expect(indexNames).toContain('idx_mood_entries_updated_at');
    });
  });

  describe('2. Mood Entry Creation & Sync Contract', () => {
    it('creates a new mood entry with server_revision = 0 and server_updated_at = NULL', async () => {
      const entry = await createMoodEntry(db, {
        moodType: 'calm',
        note: 'Peaceful afternoon walk',
        tags: ['walk', 'nature'],
      });

      expect(entry.id).toBeDefined();
      expect(entry.moodType).toBe('calm');
      expect(entry.note).toBe('Peaceful afternoon walk');
      expect(entry.tags).toEqual(['walk', 'nature']);
      expect(entry.serverRevision).toBe(0);
      expect(entry.serverUpdatedAt).toBeNull();
      expect(entry.isDeleted).toBe(false);

      // Verify sync_outbox contains an INSERT mutation with base_server_revision = 0
      const outbox = await db.getFirstAsync<{
        action: string;
        base_server_revision: number;
        payload: string;
      }>(
        `SELECT action, base_server_revision, payload FROM sync_outbox WHERE entity_id = ?;`,
        entry.id
      );
      expect(outbox?.action).toBe('INSERT');
      expect(outbox?.base_server_revision).toBe(0);

      const payload = JSON.parse(outbox?.payload || '{}');
      expect(payload.id).toBe(entry.id);
      expect(payload.moodType).toBe('calm');
      // Must not supply authoritative server_updated_at in payload
      expect(payload.serverUpdatedAt).toBeUndefined();
    });

    it('supports logging multiple mood entries on the same day', async () => {
      const morningTime = '2026-11-05T09:00:00.000Z';
      const afternoonTime = '2026-11-05T14:30:00.000Z';
      const eveningTime = '2026-11-05T20:00:00.000Z';

      await createMoodEntry(db, { moodType: 'tired', loggedAt: morningTime });
      await createMoodEntry(db, { moodType: 'calm', loggedAt: afternoonTime });
      await createMoodEntry(db, { moodType: 'happy', loggedAt: eveningTime });

      const all = await getAllMoodEntries(db);
      expect(all.length).toBe(3);
      // Chronological descending order
      expect(all[0].moodType).toBe('happy');
      expect(all[1].moodType).toBe('calm');
      expect(all[2].moodType).toBe('tired');
    });

    it('validates moodType and rejects unknown categories', async () => {
      await expect(
        createMoodEntry(db, { moodType: 'ecstatic' as any })
      ).rejects.toThrow('Invalid mood type');
    });

    it('validates reflection note length (max 1000 characters)', async () => {
      const hugeNote = 'a'.repeat(1001);
      await expect(
        createMoodEntry(db, { moodType: 'okay', note: hugeNote })
      ).rejects.toThrow('cannot exceed 1000 characters');
    });
  });

  describe('3. Mood Entry Updating & Outbox Coalescing', () => {
    it('coalesces edits on an unsynced entry (serverRevision = 0) into the pending INSERT outbox mutation', async () => {
      const entry = await createMoodEntry(db, {
        moodType: 'stressed',
        note: 'Busy morning',
        tags: ['work'],
      });

      // Update before first sync
      const updated = await updateMoodEntry(db, entry.id, {
        moodType: 'calm',
        note: 'Took a break and felt better',
        tags: ['work', 'break'],
      });

      expect(updated.moodType).toBe('calm');
      expect(updated.note).toBe('Took a break and felt better');
      expect(updated.tags).toEqual(['work', 'break']);

      // Outbox must contain exactly ONE mutation (INSERT coalesced), not an extra UPDATE!
      const mutations = await db.getAllAsync<{ action: string; payload: string }>(
        `SELECT action, payload FROM sync_outbox WHERE entity_id = ?;`,
        entry.id
      );
      expect(mutations.length).toBe(1);
      expect(mutations[0].action).toBe('INSERT');

      const coalescedPayload = JSON.parse(mutations[0].payload);
      expect(coalescedPayload.moodType).toBe('calm');
      expect(coalescedPayload.note).toBe('Took a break and felt better');
      expect(coalescedPayload.tags).toEqual(['work', 'break']);
    });

    it('creates an UPDATE outbox mutation when editing a previously synced entry (serverRevision > 0)', async () => {
      const entry = await createMoodEntry(db, { moodType: 'okay' });

      // Simulate successful server sync: server assigns revision 1 and server_updated_at
      await db.runAsync(
        `UPDATE mood_entries SET server_revision = 1, server_updated_at = '2026-11-05T12:00:00Z' WHERE id = ?;`,
        entry.id
      );

      // Now update the synced entry
      await updateMoodEntry(db, entry.id, { moodType: 'happy', note: 'Feeling great' });

      const updateMutation = await db.getFirstAsync<{ action: string; base_server_revision: number }>(
        `SELECT action, base_server_revision FROM sync_outbox WHERE entity_id = ? AND action = 'UPDATE';`,
        entry.id
      );
      expect(updateMutation?.action).toBe('UPDATE');
      expect(updateMutation?.base_server_revision).toBe(1);
    });
  });

  describe('4. Deletion & Outbox Cleanup', () => {
    it('removes pending INSERT from outbox when deleting an unsynced entry (serverRevision = 0)', async () => {
      const entry = await createMoodEntry(db, { moodType: 'tired' });

      // Delete before sync
      const success = await deleteMoodEntry(db, entry.id);
      expect(success).toBe(true);

      const deleted = await getMoodEntryById(db, entry.id);
      expect(deleted?.isDeleted).toBe(true);

      // Outbox must have removed the pending INSERT and NOT create an unnecessary DELETE mutation
      const outboxRows = await db.getAllAsync(
        `SELECT * FROM sync_outbox WHERE entity_id = ?;`,
        entry.id
      );
      expect(outboxRows.length).toBe(0);
    });

    it('records a DELETE tombstone mutation when deleting a previously synced entry (serverRevision > 0)', async () => {
      const entry = await createMoodEntry(db, { moodType: 'calm' });

      // Simulate server sync
      await db.runAsync(
        `UPDATE mood_entries SET server_revision = 2, server_updated_at = '2026-11-05T12:00:00Z' WHERE id = ?;`,
        entry.id
      );

      await deleteMoodEntry(db, entry.id);

      const deleteMutation = await db.getFirstAsync<{ action: string; base_server_revision: number }>(
        `SELECT action, base_server_revision FROM sync_outbox WHERE entity_id = ? AND action = 'DELETE';`,
        entry.id
      );
      expect(deleteMutation?.action).toBe('DELETE');
      expect(deleteMutation?.base_server_revision).toBe(2);
    });
  });

  describe('5. Date Range Filtering & Mood Distribution', () => {
    it('retrieves entries within inclusive start and exclusive end ISO range', async () => {
      await createMoodEntry(db, { moodType: 'happy', loggedAt: '2026-11-05T10:00:00Z' });
      await createMoodEntry(db, { moodType: 'calm', loggedAt: '2026-11-05T18:00:00Z' });
      await createMoodEntry(db, { moodType: 'tired', loggedAt: '2026-11-06T09:00:00Z' });

      const rangeEntries = await getMoodEntriesByDateRange(
        db,
        '2026-11-05T00:00:00Z',
        '2026-11-06T00:00:00Z'
      );
      expect(rangeEntries.length).toBe(2);
      expect(rangeEntries.map((e) => e.moodType)).toEqual(['calm', 'happy']);
    });

    it('calculates deterministic mood distribution counts and percentages', async () => {
      await createMoodEntry(db, { moodType: 'happy', loggedAt: '2026-11-05T10:00:00Z' });
      await createMoodEntry(db, { moodType: 'happy', loggedAt: '2026-11-05T12:00:00Z' });
      await createMoodEntry(db, { moodType: 'calm', loggedAt: '2026-11-05T14:00:00Z' });
      await createMoodEntry(db, { moodType: 'tired', loggedAt: '2026-11-05T16:00:00Z' });

      const dist = await getMoodDistribution(
        db,
        '2026-11-05T00:00:00Z',
        '2026-11-06T00:00:00Z'
      );

      expect(dist.total).toBe(4);
      expect(dist.mostFrequentMood).toBe('happy');

      const happyItem = dist.items.find((i) => i.moodType === 'happy');
      expect(happyItem?.count).toBe(2);
      expect(happyItem?.percentage).toBe(50);

      const calmItem = dist.items.find((i) => i.moodType === 'calm');
      expect(calmItem?.count).toBe(1);
      expect(calmItem?.percentage).toBe(25);
    });

    it('handles empty date range cleanly without fabricating statistics', async () => {
      const dist = await getMoodDistribution(
        db,
        '2026-11-01T00:00:00Z',
        '2026-11-02T00:00:00Z'
      );
      expect(dist.total).toBe(0);
      expect(dist.items.length).toBe(0);
      expect(dist.mostFrequentMood).toBeNull();
    });
  });

  describe('6. Persistence Across Reopening', () => {
    it('persists mood entries and preserves data integrity across database closure', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cura-mood-test-'));
      const dbFile = path.join(tempDir, 'persist.db');

      const diskDb = new NodeSQLiteAdapter(dbFile);
      await runMigrations(diskDb);

      const created = await createMoodEntry(diskDb, {
        moodType: 'excited',
        note: 'Project milestone reached!',
        tags: ['cura', 'progress'],
      });

      await diskDb.closeAsync();

      // Reopen database from disk
      const reopenedDb = new NodeSQLiteAdapter(dbFile);
      const retrieved = await getMoodEntryById(reopenedDb, created.id);

      expect(retrieved?.moodType).toBe('excited');
      expect(retrieved?.note).toBe('Project milestone reached!');
      expect(retrieved?.tags).toEqual(['cura', 'progress']);
      expect(retrieved?.serverRevision).toBe(0);
      expect(retrieved?.serverUpdatedAt).toBeNull();

      await reopenedDb.closeAsync();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });
});
