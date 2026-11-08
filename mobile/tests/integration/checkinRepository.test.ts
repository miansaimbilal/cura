import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations, migrations } from '../../src/db/migrations';
import {
  getOrCreateCheckinOccurrence,
  getCheckinOccurrence,
  getCheckinOccurrencesByDate,
} from '../../src/db/checkinRepository';
import {
  createConversation,
  deleteConversation,
  getConversationById,
  createMessage,
  getMessages,
} from '../../src/db/chatRepository';
import { createTask, getTaskById } from '../../src/db/taskRepository';
import { getDatabase, setDatabaseInstance } from '../../src/db/client';

describe('Real SQLite Database & Check-in Occurrence Repository (Integration Tests)', () => {
  let db: NodeSQLiteAdapter;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    // Enable foreign keys
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await runMigrations(db);
  });

  describe('1. Migration 0005 & Database Schema', () => {
    it('sets PRAGMA user_version to at least 5', async () => {
      const versionResult = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(versionResult?.user_version).toBeGreaterThanOrEqual(5);
      expect(versionResult?.user_version).toBe(migrations.length);
    });

    it('creates checkin_occurrences table with expected columns and constraints', async () => {
      const tables = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = 'checkin_occurrences';`
      );
      expect(tables.map((t) => t.name)).toContain('checkin_occurrences');

      const columns = await db.getAllAsync<{ name: string; type: string; notnull: number; dflt_value: string | null }>(
        `PRAGMA table_info(checkin_occurrences);`
      );
      const colMap = new Map(columns.map((c) => [c.name, c]));

      expect(colMap.has('id')).toBe(true);
      expect(colMap.get('id')?.notnull).toBe(1);

      expect(colMap.has('user_id')).toBe(true);
      expect(colMap.get('user_id')?.notnull).toBe(1);

      expect(colMap.has('checkin_type')).toBe(true);
      expect(colMap.get('checkin_type')?.notnull).toBe(1);

      expect(colMap.has('local_date')).toBe(true);
      expect(colMap.get('local_date')?.notnull).toBe(1);

      expect(colMap.has('conversation_id')).toBe(true);
      expect(colMap.get('conversation_id')?.notnull).toBe(1);

      expect(colMap.has('created_at')).toBe(true);
      expect(colMap.has('updated_at')).toBe(true);
    });

    it('creates required performance and foreign-key indexes', async () => {
      const indexes = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_checkin_occurrences_%';`
      );
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_checkin_occurrences_conversation_id');
      expect(indexNames).toContain('idx_checkin_occurrences_user_date');
    });

    it('strictly does NOT create daily_summaries or cache tables', async () => {
      const tables = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%summary%' OR name LIKE '%summaries%') AND name != 'conversation_summaries';`
      );
      expect(tables.length).toBe(0);
    });

    it('successfully migrates an existing database from version 4 to version 5 preserving all records', async () => {
      const freshDb = new NodeSQLiteAdapter(':memory:');
      await freshDb.execAsync('PRAGMA foreign_keys = ON;');

      // Run migrations 1 through 4 only
      for (const migration of migrations.filter((m) => m.version <= 4)) {
        await freshDb.withTransactionAsync(async () => {
          await migration.up(freshDb);
          await freshDb.execAsync(`PRAGMA user_version = ${migration.version};`);
        });
      }

      // Verify version is 4
      const v4 = await freshDb.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(v4?.user_version).toBe(4);

      // Create pre-existing task and conversation in v4 schema
      const existingTask = await createTask(freshDb, { title: 'Pre-migration task' });
      const existingConv = await createConversation(freshDb, { title: 'Pre-migration chat' });

      // Run Migration 5 via runMigrations
      await runMigrations(freshDb);

      const v5 = await freshDb.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(v5?.user_version).toBe(migrations.length);

      // Verify pre-existing data remains intact
      const taskAfter = await getTaskById(freshDb, existingTask.id);
      expect(taskAfter).not.toBeNull();
      expect(taskAfter?.title).toBe('Pre-migration task');

      const convAfter = await getConversationById(freshDb, existingConv.id);
      expect(convAfter).not.toBeNull();
      expect(convAfter?.title).toBe('Pre-migration chat');
    });
  });

  describe('2. Idempotent Get-or-Create Check-in Occurrence', () => {
    it('creates a new occurrence and conversation on first call', async () => {
      const result = await getOrCreateCheckinOccurrence(db, {
        userId: 'guest',
        checkinType: 'morning',
        localDate: '2026-11-06',
      });

      expect(result.wasCreated).toBe(true);
      expect(result.wasRecovered).toBe(false);
      expect(result.occurrence.id).toBeDefined();
      expect(result.occurrence.userId).toBe('guest');
      expect(result.occurrence.checkinType).toBe('morning');
      expect(result.occurrence.localDate).toBe('2026-11-06');
      expect(result.occurrence.conversationId).toBe(result.conversation.id);

      expect(result.conversation.id).toBeDefined();
      expect(result.conversation.title).toBe('Morning Check-in');
      expect(result.conversation.conversationType).toBe('morning_checkin');
      expect(result.conversation.isDeleted).toBe(false);
    });

    it('creates distinct evening reflection occurrences on the same date', async () => {
      const morning = await getOrCreateCheckinOccurrence(db, {
        userId: 'guest',
        checkinType: 'morning',
        localDate: '2026-11-06',
      });

      const evening = await getOrCreateCheckinOccurrence(db, {
        userId: 'guest',
        checkinType: 'evening',
        localDate: '2026-11-06',
      });

      expect(morning.occurrence.id).not.toBe(evening.occurrence.id);
      expect(morning.conversation.id).not.toBe(evening.conversation.id);
      expect(evening.conversation.title).toBe('Evening Reflection');
      expect(evening.conversation.conversationType).toBe('evening_reflection');

      const byDate = await getCheckinOccurrencesByDate(db, 'guest', '2026-11-06');
      expect(byDate.length).toBe(2);
    });

    it('returns the existing occurrence and conversation on repeated calls (idempotent)', async () => {
      const first = await getOrCreateCheckinOccurrence(db, {
        userId: 'guest',
        checkinType: 'morning',
        localDate: '2026-11-06',
      });

      const second = await getOrCreateCheckinOccurrence(db, {
        userId: 'guest',
        checkinType: 'morning',
        localDate: '2026-11-06',
      });

      expect(first.wasCreated).toBe(true);
      expect(second.wasCreated).toBe(false);
      expect(second.wasRecovered).toBe(false);
      expect(second.occurrence.id).toBe(first.occurrence.id);
      expect(second.conversation.id).toBe(first.conversation.id);

      // Verify no extra conversation was created
      const allRows = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM conversations WHERE conversation_type = 'morning_checkin';`
      );
      expect(allRows.length).toBe(1);
    });

    it('enforces UNIQUE(user_id, checkin_type, local_date) constraint at database level', async () => {
      await getOrCreateCheckinOccurrence(db, {
        userId: 'guest',
        checkinType: 'morning',
        localDate: '2026-11-06',
      });

      // Direct insert attempting duplicate should fail
      await expect(
        db.runAsync(
          `INSERT INTO checkin_occurrences (id, user_id, checkin_type, local_date, conversation_id, created_at, updated_at)
           VALUES ('dummy-id', 'guest', 'morning', '2026-11-06', 'dummy-conv', '2026-11-06T00:00:00Z', '2026-11-06T00:00:00Z');`
        )
      ).rejects.toThrow();
    });
  });

  describe('3. Soft-Delete Recovery', () => {
    it('restores soft-deleted conversation when check-in occurrence is accessed again', async () => {
      const initial = await getOrCreateCheckinOccurrence(db, {
        userId: 'guest',
        checkinType: 'evening',
        localDate: '2026-11-05',
      });

      // Add a message to this conversation
      await createMessage(db, {
        conversationId: initial.conversation.id,
        sender: 'assistant',
        content: 'How was your evening?',
      });

      // User soft-deletes the conversation
      await deleteConversation(db, initial.conversation.id);

      // Verify it is marked is_deleted = 1
      const deletedConv = await getConversationById(db, initial.conversation.id);
      expect(deletedConv).toBeNull(); // getConversationById excludes is_deleted = 1

      // Now user taps or accesses evening reflection for 2026-11-05 again
      const accessedAgain = await getOrCreateCheckinOccurrence(db, {
        userId: 'guest',
        checkinType: 'evening',
        localDate: '2026-11-05',
      });

      expect(accessedAgain.wasRecovered).toBe(true);
      expect(accessedAgain.conversation.id).toBe(initial.conversation.id);
      expect(accessedAgain.conversation.isDeleted).toBe(false);
      expect(accessedAgain.conversation.deletedAt).toBeNull();

      // Verify messages are preserved
      const messages = await getMessages(db, initial.conversation.id);
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('How was your evening?');

      // Verify getConversationById now returns it normally
      const restored = await getConversationById(db, initial.conversation.id);
      expect(restored).not.toBeNull();
      expect(restored?.id).toBe(initial.conversation.id);
    });
  });

  describe('4. Foreign Key Cascades & Query Functions', () => {
    it('cascades deletion of checkin_occurrence when conversation is hard deleted', async () => {
      const initial = await getOrCreateCheckinOccurrence(db, {
        userId: 'guest',
        checkinType: 'morning',
        localDate: '2026-11-04',
      });

      // Verify occurrence exists
      const before = await getCheckinOccurrence(db, 'guest', 'morning', '2026-11-04');
      expect(before).not.toBeNull();

      // Hard-delete the conversation directly
      await db.runAsync(`DELETE FROM conversations WHERE id = ?;`, initial.conversation.id);

      // Verify checkin occurrence was cascaded
      const after = await getCheckinOccurrence(db, 'guest', 'morning', '2026-11-04');
      expect(after).toBeNull();
    });

    it('returns null when querying non-existent occurrence', async () => {
      const nonExistent = await getCheckinOccurrence(db, 'guest', 'morning', '1999-01-01');
      expect(nonExistent).toBeNull();
    });
  });

  describe('5. Production Database Connection & Actual Foreign Key Enforcement', () => {
    beforeEach(() => {
      setDatabaseInstance(null);
    });

    it('enforces PRAGMA foreign_keys = ON and cascades via production getDatabase() initialization', async () => {
      // Initialize database using the exact production client path
      const prodDb = await getDatabase();

      // 1. Verify foreign keys are enabled on this connection
      const fkCheck = await prodDb.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
      expect(fkCheck?.foreign_keys).toBe(1);

      // 2. Attempt inserting checkin_occurrence with a non-existent conversation_id
      const invalidOccurrenceId = 'invalid-fk-occurrence';
      await expect(
        prodDb.runAsync(
          `INSERT INTO checkin_occurrences (id, user_id, checkin_type, local_date, conversation_id, created_at, updated_at)
           VALUES (?, 'guest', 'morning', '2026-11-06', 'non-existent-conversation-id', '2026-11-06T00:00:00Z', '2026-11-06T00:00:00Z');`,
          invalidOccurrenceId
        )
      ).rejects.toThrow();

      // 3. Insert a valid conversation, link occurrence, and verify CASCADE on conversation delete
      const conv = await createConversation(prodDb, { title: 'Cascade Target' });
      const validOccurrenceId = 'valid-fk-occurrence';
      await prodDb.runAsync(
        `INSERT INTO checkin_occurrences (id, user_id, checkin_type, local_date, conversation_id, created_at, updated_at)
         VALUES (?, 'guest', 'morning', '2026-11-06', ?, '2026-11-06T00:00:00Z', '2026-11-06T00:00:00Z');`,
        validOccurrenceId,
        conv.id
      );

      const occurrenceBefore = await prodDb.getFirstAsync<{ id: string }>(
        `SELECT id FROM checkin_occurrences WHERE id = ?;`,
        validOccurrenceId
      );
      expect(occurrenceBefore).not.toBeNull();

      // Delete parent conversation
      await prodDb.runAsync(`DELETE FROM conversations WHERE id = ?;`, conv.id);

      // Verify child occurrence was automatically removed by SQLite FOREIGN KEY CASCADE
      const occurrenceAfter = await prodDb.getFirstAsync<{ id: string }>(
        `SELECT id FROM checkin_occurrences WHERE id = ?;`,
        validOccurrenceId
      );
      expect(occurrenceAfter).toBeNull();
    });
  });
});
