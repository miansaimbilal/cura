import { generateUUID } from '../utils/uuid';
import { IDatabase } from './types';
import {
  CheckinOccurrence,
  CheckinType,
  GetOrCreateCheckinInput,
} from '../types/checkin';
import { Conversation } from '../types/chat';
import {
  ConversationRow,
  mapRowToConversation,
} from './chatRepository';

export interface CheckinOccurrenceRow {
  id: string;
  user_id: string;
  checkin_type: string;
  local_date: string;
  conversation_id: string;
  created_at: string;
  updated_at: string;
}

export function mapRowToCheckinOccurrence(row: CheckinOccurrenceRow): CheckinOccurrence {
  return {
    id: row.id,
    userId: row.user_id,
    checkinType: row.checkin_type as CheckinType,
    localDate: row.local_date,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface GetOrCreateCheckinResult {
  occurrence: CheckinOccurrence;
  conversation: Conversation;
  wasRecovered: boolean;
  wasCreated: boolean;
}

/**
 * Atomically retrieves or creates a check-in occurrence and its linked conversation.
 * Handles:
 * 1. Returning existing active occurrence and conversation.
 * 2. Soft-delete recovery: if conversation was soft-deleted, restores it (is_deleted = 0).
 * 3. Atomic creation inside transaction if none exists.
 * 4. Idempotent conflict resolution if concurrent execution attempts duplicate insert.
 *
 * NOTE: SQLite withTransactionAsync returns void; outer-scoped variables capture the result.
 */
export async function getOrCreateCheckinOccurrence(
  db: IDatabase,
  input: GetOrCreateCheckinInput
): Promise<GetOrCreateCheckinResult> {
  const userId = input.userId || 'guest';
  const { checkinType, localDate } = input;

  let resultOccurrence: CheckinOccurrence | null = null;
  let resultConversation: Conversation | null = null;
  let wasRecovered = false;
  let wasCreated = false;

  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();

    // 1. Check if occurrence already exists
    const existingOccurrenceRow = await db.getFirstAsync<CheckinOccurrenceRow>(
      `SELECT * FROM checkin_occurrences
       WHERE user_id = ? AND checkin_type = ? AND local_date = ?;`,
      userId,
      checkinType,
      localDate
    );

    if (existingOccurrenceRow) {
      // Check linked conversation status
      const convRow = await db.getFirstAsync<ConversationRow>(
        `SELECT * FROM conversations WHERE id = ?;`,
        existingOccurrenceRow.conversation_id
      );

      if (convRow) {
        if (convRow.is_deleted === 1) {
          // Soft-deleted conversation: recover it transactionally following existing semantics
          await db.runAsync(
            `UPDATE conversations
             SET is_deleted = 0, deleted_at = NULL, updated_at = ?
             WHERE id = ?;`,
            now,
            convRow.id
          );

          await db.runAsync(
            `UPDATE checkin_occurrences
             SET updated_at = ?
             WHERE id = ?;`,
            now,
            existingOccurrenceRow.id
          );

          const recoveredConvRow = await db.getFirstAsync<ConversationRow>(
            `SELECT * FROM conversations WHERE id = ?;`,
            convRow.id
          );

          resultConversation = mapRowToConversation(recoveredConvRow!);
          resultOccurrence = mapRowToCheckinOccurrence({
            ...existingOccurrenceRow,
            updated_at: now,
          });
          wasRecovered = true;
          return;
        } else {
          // Existing active conversation
          resultConversation = mapRowToConversation(convRow);
          resultOccurrence = mapRowToCheckinOccurrence(existingOccurrenceRow);
          return;
        }
      } else {
        // Edge case: conversation was hard deleted. Create a new conversation and re-link.
        const newConvId = generateUUID();
        const convTitle =
          checkinType === 'morning' ? 'Morning Check-in' : 'Evening Reflection';
        const convType =
          checkinType === 'morning' ? 'morning_checkin' : 'evening_reflection';

        await db.runAsync(
          `INSERT INTO conversations (
            id, user_id, title, conversation_type, server_revision, server_updated_at,
            is_deleted, deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          newConvId,
          userId,
          convTitle,
          convType,
          0,
          null,
          0,
          null,
          now,
          now
        );

        await db.runAsync(
          `UPDATE checkin_occurrences
           SET conversation_id = ?, updated_at = ?
           WHERE id = ?;`,
          newConvId,
          now,
          existingOccurrenceRow.id
        );

        const newConvRow = await db.getFirstAsync<ConversationRow>(
          `SELECT * FROM conversations WHERE id = ?;`,
          newConvId
        );

        resultConversation = mapRowToConversation(newConvRow!);
        resultOccurrence = mapRowToCheckinOccurrence({
          ...existingOccurrenceRow,
          conversation_id: newConvId,
          updated_at: now,
        });
        return;
      }
    }

    // 2. Occurrence does not exist yet. Create new conversation and occurrence.
    const newConvId = generateUUID();
    const occurrenceId = generateUUID();
    const convTitle =
      checkinType === 'morning' ? 'Morning Check-in' : 'Evening Reflection';
    const convType =
      checkinType === 'morning' ? 'morning_checkin' : 'evening_reflection';

    await db.runAsync(
      `INSERT INTO conversations (
        id, user_id, title, conversation_type, server_revision, server_updated_at,
        is_deleted, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      newConvId,
      userId,
      convTitle,
      convType,
      0,
      null,
      0,
      null,
      now,
      now
    );

    try {
      await db.runAsync(
        `INSERT INTO checkin_occurrences (
          id, user_id, checkin_type, local_date, conversation_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        occurrenceId,
        userId,
        checkinType,
        localDate,
        newConvId,
        now,
        now
      );

      const convRow = await db.getFirstAsync<ConversationRow>(
        `SELECT * FROM conversations WHERE id = ?;`,
        newConvId
      );
      const occRow = await db.getFirstAsync<CheckinOccurrenceRow>(
        `SELECT * FROM checkin_occurrences WHERE id = ?;`,
        occurrenceId
      );

      resultConversation = mapRowToConversation(convRow!);
      resultOccurrence = mapRowToCheckinOccurrence(occRow!);
      wasCreated = true;
    } catch (insertError: any) {
      // If unique constraint violated by concurrent insert, fetch the winning occurrence
      if (
        insertError?.message?.includes('UNIQUE constraint failed') ||
        insertError?.code === 'SQLITE_CONSTRAINT' ||
        insertError?.message?.includes('checkin_occurrences.user_id, checkin_occurrences.checkin_type, checkin_occurrences.local_date')
      ) {
        const winningOccurrenceRow = await db.getFirstAsync<CheckinOccurrenceRow>(
          `SELECT * FROM checkin_occurrences
           WHERE user_id = ? AND checkin_type = ? AND local_date = ?;`,
          userId,
          checkinType,
          localDate
        );

        if (!winningOccurrenceRow) {
          throw insertError;
        }

        const winningConvRow = await db.getFirstAsync<ConversationRow>(
          `SELECT * FROM conversations WHERE id = ?;`,
          winningOccurrenceRow.conversation_id
        );

        resultConversation = mapRowToConversation(winningConvRow!);
        resultOccurrence = mapRowToCheckinOccurrence(winningOccurrenceRow);
        return;
      }
      throw insertError;
    }
  });

  if (!resultOccurrence || !resultConversation) {
    throw new Error(
      `Failed to resolve check-in occurrence for ${checkinType} on ${localDate}`
    );
  }

  return {
    occurrence: resultOccurrence,
    conversation: resultConversation,
    wasRecovered,
    wasCreated,
  };
}

/**
 * Retrieves a single check-in occurrence if it exists.
 */
export async function getCheckinOccurrence(
  db: IDatabase,
  userId = 'guest',
  checkinType: CheckinType,
  localDate: string
): Promise<CheckinOccurrence | null> {
  const row = await db.getFirstAsync<CheckinOccurrenceRow>(
    `SELECT * FROM checkin_occurrences
     WHERE user_id = ? AND checkin_type = ? AND local_date = ?;`,
    userId,
    checkinType,
    localDate
  );

  if (!row) return null;
  return mapRowToCheckinOccurrence(row);
}

/**
 * Retrieves all check-in occurrences for a given user and local date.
 */
export async function getCheckinOccurrencesByDate(
  db: IDatabase,
  userId = 'guest',
  localDate: string
): Promise<CheckinOccurrence[]> {
  const rows = await db.getAllAsync<CheckinOccurrenceRow>(
    `SELECT * FROM checkin_occurrences
     WHERE user_id = ? AND local_date = ?
     ORDER BY created_at ASC;`,
    userId,
    localDate
  );

  return rows.map(mapRowToCheckinOccurrence);
}
