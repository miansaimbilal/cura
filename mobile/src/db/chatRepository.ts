import { generateUUID } from '../utils/uuid';
import { IDatabase } from './types';
import {
  Conversation,
  Message,
  ConversationSummary,
  CreateConversationInput,
  CreateMessageInput,
  MessageSender,
  MessageStatus,
} from '../types/chat';

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  conversation_type: string;
  server_revision: number;
  server_updated_at: string | null;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender: string;
  content: string;
  status: string;
  provider_used: string | null;
  model_used: string | null;
  client_message_id: string | null;
  created_at: string;
}

export interface ConversationSummaryRow {
  id: string;
  conversation_id: string;
  summary_text: string;
  key_topics: string;
  last_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export function mapRowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    conversationType: row.conversation_type,
    serverRevision: row.server_revision,
    serverUpdatedAt: row.server_updated_at || null,
    isDeleted: row.is_deleted === 1,
    deletedAt: row.deleted_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: row.sender as MessageSender,
    content: row.content,
    status: (row.status as MessageStatus) || 'completed',
    providerUsed: row.provider_used || null,
    modelUsed: row.model_used || null,
    clientMessageId: row.client_message_id || null,
    createdAt: row.created_at,
  };
}

/**
 * Creates a new conversation in local SQLite.
 */
export async function createConversation(
  db: IDatabase,
  input: CreateConversationInput
): Promise<Conversation> {
  const id = generateUUID();
  const now = new Date().toISOString();
  const userId = input.userId || 'guest';
  const title = input.title?.trim() || null;
  const conversationType = input.conversationType || 'general';

  await db.runAsync(
    `INSERT INTO conversations (
      id, user_id, title, conversation_type, server_revision, server_updated_at,
      is_deleted, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    id,
    userId,
    title,
    conversationType,
    0,
    null,
    0,
    null,
    now,
    now
  );

  const row = await db.getFirstAsync<ConversationRow>(
    `SELECT * FROM conversations WHERE id = ?;`,
    id
  );

  if (!row) {
    throw new Error(`Failed to retrieve newly created conversation with id: ${id}`);
  }

  return mapRowToConversation(row);
}

/**
 * Retrieves active conversations for the given user, ordered by most recently updated.
 */
export async function getAllConversations(
  db: IDatabase,
  userId = 'guest'
): Promise<Conversation[]> {
  const rows = await db.getAllAsync<ConversationRow>(
    `SELECT * FROM conversations
     WHERE user_id = ? AND is_deleted = 0
     ORDER BY updated_at DESC;`,
    userId
  );

  const conversations = rows.map(mapRowToConversation);

  // Attach last message preview to each conversation
  for (const conv of conversations) {
    const lastMsgRow = await db.getFirstAsync<MessageRow>(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT 1;`,
      conv.id
    );
    if (lastMsgRow) {
      conv.lastMessage = mapRowToMessage(lastMsgRow);
    }
  }

  return conversations;
}

/**
 * Retrieves a single conversation by ID.
 */
export async function getConversationById(
  db: IDatabase,
  id: string
): Promise<Conversation | null> {
  const row = await db.getFirstAsync<ConversationRow>(
    `SELECT * FROM conversations WHERE id = ? AND is_deleted = 0;`,
    id
  );

  if (!row) return null;
  return mapRowToConversation(row);
}

/**
 * Updates conversation title and timestamp.
 */
export async function updateConversationTitle(
  db: IDatabase,
  id: string,
  title: string
): Promise<Conversation> {
  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?;`,
    title.trim(),
    now,
    id
  );

  const updated = await getConversationById(db, id);
  if (!updated) {
    throw new Error(`Conversation not found after update: ${id}`);
  }
  return updated;
}

/**
 * Soft-deletes a conversation.
 */
export async function deleteConversation(
  db: IDatabase,
  id: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE conversations SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?;`,
    now,
    now,
    id
  );
}

/**
 * Retrieves messages for a conversation in chronological order.
 */
export async function getMessages(
  db: IDatabase,
  conversationId: string,
  limit = 100
): Promise<Message[]> {
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT * FROM messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC
     LIMIT ?;`,
    conversationId,
    limit
  );

  return rows.map(mapRowToMessage);
}

/**
 * Persists a message to SQLite.
 */
export async function createMessage(
  db: IDatabase,
  input: CreateMessageInput
): Promise<Message> {
  const id = generateUUID();
  const now = input.createdAt || new Date().toISOString();
  const status = input.status || 'completed';

  await db.runAsync(
    `INSERT INTO messages (
      id, conversation_id, sender, content, status, provider_used, model_used, client_message_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    id,
    input.conversationId,
    input.sender,
    input.content,
    status,
    input.providerUsed || null,
    input.modelUsed || null,
    input.clientMessageId || null,
    now
  );

  // Touch conversation updated_at
  await db.runAsync(
    `UPDATE conversations SET updated_at = ? WHERE id = ?;`,
    now,
    input.conversationId
  );

  const row = await db.getFirstAsync<MessageRow>(
    `SELECT * FROM messages WHERE id = ?;`,
    id
  );

  if (!row) {
    throw new Error(`Failed to retrieve newly created message with id: ${id}`);
  }

  return mapRowToMessage(row);
}

/**
 * Updates an existing message (e.g. updating status from 'sending' to 'completed' or 'interrupted').
 */
export async function updateMessage(
  db: IDatabase,
  id: string,
  updates: Partial<Message>
): Promise<Message> {
  const existingRow = await db.getFirstAsync<MessageRow>(
    `SELECT * FROM messages WHERE id = ?;`,
    id
  );

  if (!existingRow) {
    throw new Error(`Message not found: ${id}`);
  }

  const newContent = updates.content !== undefined ? updates.content : existingRow.content;
  const newStatus = updates.status !== undefined ? updates.status : existingRow.status;
  const newProvider = updates.providerUsed !== undefined ? updates.providerUsed : existingRow.provider_used;
  const newModel = updates.modelUsed !== undefined ? updates.modelUsed : existingRow.model_used;

  await db.runAsync(
    `UPDATE messages
     SET content = ?, status = ?, provider_used = ?, model_used = ?
     WHERE id = ?;`,
    newContent,
    newStatus,
    newProvider,
    newModel,
    id
  );

  const updatedRow = await db.getFirstAsync<MessageRow>(
    `SELECT * FROM messages WHERE id = ?;`,
    id
  );

  if (!updatedRow) {
    throw new Error(`Failed to retrieve message after update: ${id}`);
  }

  return mapRowToMessage(updatedRow);
}

/**
 * Retrieves summary for a conversation.
 */
export async function getConversationSummary(
  db: IDatabase,
  conversationId: string
): Promise<ConversationSummary | null> {
  const row = await db.getFirstAsync<ConversationSummaryRow>(
    `SELECT * FROM conversation_summaries WHERE conversation_id = ?;`,
    conversationId
  );

  if (!row) return null;

  let topics: string[] = [];
  try {
    topics = JSON.parse(row.key_topics || '[]');
  } catch {
    topics = [];
  }

  return {
    id: row.id,
    conversationId: row.conversation_id,
    summaryText: row.summary_text,
    keyTopics: Array.isArray(topics) ? topics : [],
    lastMessageId: row.last_message_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Upserts a conversation summary in SQLite.
 */
export async function upsertConversationSummary(
  db: IDatabase,
  conversationId: string,
  summaryText: string,
  keyTopics: string[] = []
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getConversationSummary(db, conversationId);

  if (existing) {
    await db.runAsync(
      `UPDATE conversation_summaries
       SET summary_text = ?, key_topics = ?, updated_at = ?
       WHERE conversation_id = ?;`,
      summaryText,
      JSON.stringify(keyTopics),
      now,
      conversationId
    );
  } else {
    const id = generateUUID();
    await db.runAsync(
      `INSERT INTO conversation_summaries (
        id, conversation_id, summary_text, key_topics, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?);`,
      id,
      conversationId,
      summaryText,
      JSON.stringify(keyTopics),
      now,
      now
    );
  }
}
