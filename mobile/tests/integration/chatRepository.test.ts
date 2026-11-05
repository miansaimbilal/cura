import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import {
  createConversation,
  getAllConversations,
  updateConversationTitle,
  deleteConversation,
  getMessages,
  createMessage,
  updateMessage,
  getConversationSummary,
  upsertConversationSummary,
} from '../../src/db/chatRepository';

describe('Real SQLite Database & Chat Repository (Integration Tests)', () => {
  let db: NodeSQLiteAdapter;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);
  });

  describe('1. Migration 0004 & Database Schema', () => {
    it('sets PRAGMA user_version = 4 upon completing migration 0004', async () => {
      const versionResult = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      expect(versionResult?.user_version).toBe(4);
    });

    it('creates conversations, messages, and conversation_summaries tables', async () => {
      const tables = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('conversations', 'messages', 'conversation_summaries');`
      );
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('conversations');
      expect(tableNames).toContain('messages');
      expect(tableNames).toContain('conversation_summaries');
    });

    it('creates performance indexes for conversation and message queries', async () => {
      const indexes = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_conversations_%' OR name LIKE 'idx_messages_%';`
      );
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_conversations_user_updated');
      expect(indexNames).toContain('idx_messages_conversation_created');
      expect(indexNames).toContain('idx_messages_client_id');
    });
  });

  describe('2. Conversation CRUD Operations', () => {
    it('creates a new conversation with default attributes and returns domain model', async () => {
      const conv = await createConversation(db, { title: 'Evening Reflection' });
      expect(conv.id).toBeDefined();
      expect(conv.userId).toBe('guest');
      expect(conv.title).toBe('Evening Reflection');
      expect(conv.conversationType).toBe('general');
      expect(conv.isDeleted).toBe(false);
      expect(conv.serverRevision).toBe(0);
      expect(conv.serverUpdatedAt).toBeNull();
    });

    it('retrieves active conversations in descending updated_at order', async () => {
      const c1 = await createConversation(db, { title: 'First Conversation' });
      await new Promise((r) => setTimeout(r, 5));
      const c2 = await createConversation(db, { title: 'Second Conversation' });
      await new Promise((r) => setTimeout(r, 5));

      // Update c1 to make it more recent
      await updateConversationTitle(db, c1.id, 'First Conversation Updated');

      const list = await getAllConversations(db, 'guest');
      expect(list.length).toBe(2);
      expect(list[0].id).toBe(c1.id);
      expect(list[1].id).toBe(c2.id);
    });

    it('attaches last message preview to retrieved conversations', async () => {
      const conv = await createConversation(db, { title: 'Chat Preview Test' });
      await createMessage(db, {
        conversationId: conv.id,
        sender: 'user',
        content: 'Hello Cura!',
      });
      await createMessage(db, {
        conversationId: conv.id,
        sender: 'assistant',
        content: 'Hello Friend, I am here.',
      });

      const list = await getAllConversations(db, 'guest');
      const found = list.find((c) => c.id === conv.id);
      expect(found).toBeDefined();
      expect(found?.lastMessage?.content).toBe('Hello Friend, I am here.');
      expect(found?.lastMessage?.sender).toBe('assistant');
    });

    it('soft deletes a conversation with tombstone timestamp and hides it from list', async () => {
      const conv = await createConversation(db, { title: 'To Delete' });
      await deleteConversation(db, conv.id);

      const list = await getAllConversations(db, 'guest');
      expect(list.find((c) => c.id === conv.id)).toBeUndefined();

      const raw = await db.getFirstAsync<{ is_deleted: number; deleted_at: string }>(
        `SELECT is_deleted, deleted_at FROM conversations WHERE id = ?;`,
        conv.id
      );
      expect(raw?.is_deleted).toBe(1);
      expect(raw?.deleted_at).toBeDefined();
    });
  });

  describe('3. Message Persistence & Ordering', () => {
    it('creates user and assistant messages with status and provider metadata', async () => {
      const conv = await createConversation(db, { title: 'Message Test' });

      const userMsg = await createMessage(db, {
        conversationId: conv.id,
        sender: 'user',
        content: 'Can you help me focus?',
        clientMessageId: 'client-uuid-1',
        status: 'completed',
      });

      expect(userMsg.id).toBeDefined();
      expect(userMsg.sender).toBe('user');
      expect(userMsg.clientMessageId).toBe('client-uuid-1');

      const assistantMsg = await createMessage(db, {
        conversationId: conv.id,
        sender: 'assistant',
        content: 'Of course. Let us take it one step at a time.',
        providerUsed: 'groq',
        modelUsed: 'llama-3.3-70b-versatile',
        status: 'completed',
      });

      expect(assistantMsg.sender).toBe('assistant');
      expect(assistantMsg.providerUsed).toBe('groq');
      expect(assistantMsg.modelUsed).toBe('llama-3.3-70b-versatile');
    });

    it('retrieves messages strictly in chronological ascending order', async () => {
      const conv = await createConversation(db, { title: 'Chronological Test' });

      const m1 = await createMessage(db, {
        conversationId: conv.id,
        sender: 'user',
        content: 'First message',
        createdAt: '2026-11-05T10:00:00.000Z',
      });
      const m2 = await createMessage(db, {
        conversationId: conv.id,
        sender: 'assistant',
        content: 'Second message',
        createdAt: '2026-11-05T10:01:00.000Z',
      });
      const m3 = await createMessage(db, {
        conversationId: conv.id,
        sender: 'user',
        content: 'Third message',
        createdAt: '2026-11-05T10:02:00.000Z',
      });

      const messages = await getMessages(db, conv.id);
      expect(messages.length).toBe(3);
      expect(messages[0].id).toBe(m1.id);
      expect(messages[1].id).toBe(m2.id);
      expect(messages[2].id).toBe(m3.id);
    });

    it('updates message status and content (e.g. from sending to completed or interrupted)', async () => {
      const conv = await createConversation(db, { title: 'Update Test' });
      const msg = await createMessage(db, {
        conversationId: conv.id,
        sender: 'assistant',
        content: 'Starting stream...',
        status: 'sending',
      });

      const updated = await updateMessage(db, msg.id, {
        content: 'Completed streamed response content.',
        status: 'completed',
        providerUsed: 'openrouter',
        modelUsed: 'meta-llama/llama-3.3-70b-instruct',
      });

      expect(updated.status).toBe('completed');
      expect(updated.content).toBe('Completed streamed response content.');
      expect(updated.providerUsed).toBe('openrouter');
    });
  });

  describe('4. Conversation Summary Upsert & Retrieval', () => {
    it('creates and updates rolling conversation summaries independently of messages', async () => {
      const conv = await createConversation(db, { title: 'Summary Test' });

      await upsertConversationSummary(
        db,
        conv.id,
        'User discussed completing their chemistry homework and feeling calm.',
        ['chemistry', 'homework', 'calm']
      );

      const summary = await getConversationSummary(db, conv.id);
      expect(summary).toBeDefined();
      expect(summary?.summaryText).toContain('chemistry homework');
      expect(summary?.keyTopics).toEqual(['chemistry', 'homework', 'calm']);

      // Update existing summary
      await upsertConversationSummary(
        db,
        conv.id,
        'User finished homework and planned a restful evening.',
        ['rest', 'evening']
      );

      const updatedSummary = await getConversationSummary(db, conv.id);
      expect(updatedSummary?.summaryText).toBe('User finished homework and planned a restful evening.');
      expect(updatedSummary?.keyTopics).toEqual(['rest', 'evening']);
    });
  });
});
