import { generateUUID } from '../utils/uuid';
import { IDatabase } from './types';
import {
  MoodEntry,
  MoodEntryRow,
  CreateMoodInput,
  UpdateMoodInput,
  MoodType,
  MoodDistribution,
  MoodDistributionItem,
} from '../types/mood';
import { MOODS } from '../constants';
import { darkColors } from '../theme/colors';

const VALID_MOOD_TYPES = new Set<MoodType>([
  'happy',
  'calm',
  'excited',
  'okay',
  'tired',
  'stressed',
  'sad',
  'anxious',
  'angry',
]);

/**
 * Maps a SQLite database row to a strongly typed MoodEntry domain model.
 */
export function mapRowToMoodEntry(row: MoodEntryRow): MoodEntry {
  let parsedTags: string[] = [];
  try {
    parsedTags = JSON.parse(row.tags || '[]');
  } catch {
    parsedTags = [];
  }

  return {
    id: row.id,
    userId: row.user_id,
    moodType: row.mood_type as MoodType,
    note: row.note,
    tags: Array.isArray(parsedTags) ? parsedTags : [],
    loggedAt: row.logged_at,
    serverRevision: row.server_revision,
    serverUpdatedAt: row.server_updated_at || null,
    isDeleted: row.is_deleted === 1,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Sanitizes and validates optional tags.
 */
function sanitizeTags(rawTags?: string[]): string[] {
  if (!rawTags || !Array.isArray(rawTags)) return [];
  const cleaned: string[] = [];
  for (const tag of rawTags) {
    if (typeof tag === 'string') {
      const trimmed = tag.trim().replace(/^#+/, '');
      if (trimmed.length > 0 && trimmed.length <= 30 && !cleaned.includes(trimmed)) {
        cleaned.push(trimmed);
      }
    }
  }
  return cleaned.slice(0, 10);
}

/**
 * Creates a new mood entry with monotonic offline sync outbox tracking.
 */
export async function createMoodEntry(
  db: IDatabase,
  input: CreateMoodInput
): Promise<MoodEntry> {
  if (!VALID_MOOD_TYPES.has(input.moodType)) {
    throw new Error(`Invalid mood type: ${input.moodType}`);
  }

  const trimmedNote = input.note ? input.note.trim() : null;
  if (trimmedNote && trimmedNote.length > 1000) {
    throw new Error('Reflection note cannot exceed 1000 characters');
  }

  const id = generateUUID();
  const userId = input.userId || 'guest';
  const now = new Date().toISOString();
  const loggedAt = input.loggedAt || now;
  const tags = sanitizeTags(input.tags);
  const tagsJson = JSON.stringify(tags);
  const mutationId = generateUUID();

  let createdEntry: MoodEntry | null = null;

  await db.withTransactionAsync(async () => {
    // 1. Insert into mood_entries table
    // server_revision starts at 0, server_updated_at starts as NULL
    await db.runAsync(
      `INSERT INTO mood_entries (
        id, user_id, mood_type, note, tags, logged_at,
        server_revision, server_updated_at, is_deleted, deleted_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      id,
      userId,
      input.moodType,
      trimmedNote,
      tagsJson,
      loggedAt,
      0,
      null,
      0,
      null,
      now,
      now
    );

    // 2. Append INSERT mutation to sync_outbox (base_server_revision = 0)
    // server_updated_at is omitted / null; authoritative value will come from server
    const payload = JSON.stringify({
      id,
      userId,
      moodType: input.moodType,
      note: trimmedNote,
      tags,
      loggedAt,
    });

    await db.runAsync(
      `INSERT INTO sync_outbox (
        mutation_id, user_id, entity_type, entity_id, action, base_server_revision, payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      mutationId,
      userId,
      'mood_entry',
      id,
      'INSERT',
      0,
      payload,
      now
    );

    createdEntry = await getMoodEntryById(db, id);
    if (!createdEntry) {
      throw new Error('Failed to retrieve newly created mood entry');
    }
  });

  return createdEntry!;
}

/**
 * Retrieves a single mood entry by its stable UUID.
 */
export async function getMoodEntryById(
  db: IDatabase,
  id: string
): Promise<MoodEntry | null> {
  const row = await db.getFirstAsync<MoodEntryRow>(
    `SELECT * FROM mood_entries WHERE id = ?;`,
    id
  );
  return row ? mapRowToMoodEntry(row) : null;
}

/**
 * Retrieves all mood entries for a user, ordered chronologically (newest first).
 */
export async function getAllMoodEntries(
  db: IDatabase,
  options: { userId?: string; includeDeleted?: boolean } = {}
): Promise<MoodEntry[]> {
  const userId = options.userId || 'guest';
  const includeDeleted = options.includeDeleted ?? false;

  const query = includeDeleted
    ? `SELECT * FROM mood_entries WHERE user_id = ? ORDER BY logged_at DESC;`
    : `SELECT * FROM mood_entries WHERE user_id = ? AND is_deleted = 0 ORDER BY logged_at DESC;`;

  const rows = await db.getAllAsync<MoodEntryRow>(query, userId);
  return rows.map(mapRowToMoodEntry);
}

/**
 * Retrieves mood entries within an inclusive start / exclusive end ISO timestamp range.
 */
export async function getMoodEntriesByDateRange(
  db: IDatabase,
  startISO: string,
  endISO: string,
  options: { userId?: string } = {}
): Promise<MoodEntry[]> {
  const userId = options.userId || 'guest';

  const rows = await db.getAllAsync<MoodEntryRow>(
    `SELECT * FROM mood_entries
     WHERE user_id = ? AND is_deleted = 0
       AND logged_at >= ? AND logged_at < ?
     ORDER BY logged_at DESC;`,
    userId,
    startISO,
    endISO
  );

  return rows.map(mapRowToMoodEntry);
}

/**
 * Updates an existing mood entry and records or coalesces sync mutations.
 */
export async function updateMoodEntry(
  db: IDatabase,
  id: string,
  input: UpdateMoodInput
): Promise<MoodEntry> {
  const existing = await getMoodEntryById(db, id);
  if (!existing || existing.isDeleted) {
    throw new Error(`Mood entry with id ${id} not found or has been deleted`);
  }

  if (input.moodType !== undefined && !VALID_MOOD_TYPES.has(input.moodType)) {
    throw new Error(`Invalid mood type: ${input.moodType}`);
  }

  const newMoodType = input.moodType !== undefined ? input.moodType : existing.moodType;
  let newNote = existing.note;
  if (input.note !== undefined) {
    const trimmed = input.note ? input.note.trim() : null;
    if (trimmed && trimmed.length > 1000) {
      throw new Error('Reflection note cannot exceed 1000 characters');
    }
    newNote = trimmed;
  }

  const newTags = input.tags !== undefined ? sanitizeTags(input.tags) : existing.tags;
  const newLoggedAt = input.loggedAt !== undefined ? input.loggedAt : existing.loggedAt;
  const now = new Date().toISOString();
  const tagsJson = JSON.stringify(newTags);

  let updatedEntry: MoodEntry | null = null;

  await db.withTransactionAsync(async () => {
    // 1. Update the row in SQLite
    await db.runAsync(
      `UPDATE mood_entries SET
        mood_type = ?,
        note = ?,
        tags = ?,
        logged_at = ?,
        updated_at = ?
      WHERE id = ?;`,
      newMoodType,
      newNote,
      tagsJson,
      newLoggedAt,
      now,
      id
    );

    // 2. Monotonic outbox sequencing with pre-sync coalescing
    if (existing.serverRevision === 0) {
      // Record has never been synced to server: coalesce into pending INSERT
      const existingInsert = await db.getFirstAsync<{ mutation_id: string }>(
        `SELECT mutation_id FROM sync_outbox
         WHERE entity_id = ? AND entity_type = 'mood_entry' AND action = 'INSERT';`,
        id
      );

      const coalescedPayload = JSON.stringify({
        id,
        userId: existing.userId,
        moodType: newMoodType,
        note: newNote,
        tags: newTags,
        loggedAt: newLoggedAt,
      });

      if (existingInsert) {
        await db.runAsync(
          `UPDATE sync_outbox SET
            payload = ?,
            created_at = ?
          WHERE mutation_id = ?;`,
          coalescedPayload,
          now,
          existingInsert.mutation_id
        );
      } else {
        await db.runAsync(
          `INSERT INTO sync_outbox (
            mutation_id, user_id, entity_type, entity_id, action, base_server_revision, payload, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          generateUUID(),
          existing.userId,
          'mood_entry',
          id,
          'INSERT',
          0,
          coalescedPayload,
          now
        );
      }
    } else {
      // Record was previously synced to server: append UPDATE mutation
      const updatePayload = JSON.stringify({
        id,
        moodType: newMoodType,
        note: newNote,
        tags: newTags,
        loggedAt: newLoggedAt,
      });

      await db.runAsync(
        `INSERT INTO sync_outbox (
          mutation_id, user_id, entity_type, entity_id, action, base_server_revision, payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        generateUUID(),
        existing.userId,
        'mood_entry',
        id,
        'UPDATE',
        existing.serverRevision,
        updatePayload,
        now
      );
    }

    updatedEntry = await getMoodEntryById(db, id);
    if (!updatedEntry) {
      throw new Error('Failed to retrieve updated mood entry');
    }
  });

  return updatedEntry!;
}

/**
 * Deletes a mood entry.
 * If never synchronized (serverRevision === 0): removes pending INSERT from outbox and soft-deletes.
 * If already synchronized (serverRevision > 0): soft-deletes and appends DELETE mutation to outbox.
 */
export async function deleteMoodEntry(db: IDatabase, id: string): Promise<boolean> {
  const existing = await getMoodEntryById(db, id);
  if (!existing) {
    return false;
  }

  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    // 1. Soft-delete row locally
    await db.runAsync(
      `UPDATE mood_entries SET
        is_deleted = 1,
        deleted_at = ?,
        updated_at = ?
      WHERE id = ?;`,
      now,
      now,
      id
    );

    // 2. Outbox cleanup or mutation
    if (existing.serverRevision === 0) {
      // Never synced: delete un-synced mutation from outbox (do not produce server DELETE)
      await db.runAsync(
        `DELETE FROM sync_outbox WHERE entity_id = ? AND entity_type = 'mood_entry';`,
        id
      );
    } else {
      // Already synced: record DELETE tombstone mutation
      const deletePayload = JSON.stringify({
        id,
        isDeleted: true,
        deletedAt: now,
      });

      await db.runAsync(
        `INSERT INTO sync_outbox (
          mutation_id, user_id, entity_type, entity_id, action, base_server_revision, payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        generateUUID(),
        existing.userId,
        'mood_entry',
        id,
        'DELETE',
        existing.serverRevision,
        deletePayload,
        now
      );
    }
  });

  return true;
}

/**
 * Computes deterministic categorical mood distribution for a date range.
 */
export async function getMoodDistribution(
  db: IDatabase,
  startISO: string,
  endISO: string,
  userId: string = 'guest'
): Promise<MoodDistribution> {
  const entries = await getMoodEntriesByDateRange(db, startISO, endISO, { userId });
  const total = entries.length;

  if (total === 0) {
    return {
      total: 0,
      items: [],
      mostFrequentMood: null,
    };
  }

  // Count per mood type
  const counts = new Map<MoodType, number>();
  for (const entry of entries) {
    counts.set(entry.moodType, (counts.get(entry.moodType) || 0) + 1);
  }

  let mostFrequentMood: MoodType | null = null;
  let maxCount = 0;

  const items: MoodDistributionItem[] = [];

  for (const moodDef of MOODS) {
    const type = moodDef.id as MoodType;
    const count = counts.get(type) || 0;
    if (count > 0) {
      const percentage = Math.round((count / total) * 100);
      const color = darkColors.moods[moodDef.colorKey] || '#94A3B8';

      items.push({
        moodType: type,
        label: moodDef.label,
        count,
        percentage,
        color,
      });

      if (count > maxCount) {
        maxCount = count;
        mostFrequentMood = type;
      }
    }
  }

  // Sort items by count descending
  items.sort((a, b) => b.count - a.count);

  return {
    total,
    items,
    mostFrequentMood,
  };
}
