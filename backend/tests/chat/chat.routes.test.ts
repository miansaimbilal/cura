import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { ChatService } from '../../src/modules/chat/chat.service';

vi.mock('../../src/db/index', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  pool: { connect: vi.fn(), query: vi.fn() },
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
}));

describe('Chat API Routes (/api/chat/*)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  let validToken: string;

  beforeEach(() => {
    vi.clearAllMocks();
    validToken = jwt.sign(
      { userId, email: 'tester@cura.app', type: 'access' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );
  });

  describe('Authentication Enforcement', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/chat/conversations');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Conversation Endpoints', () => {
    it('POST /api/chat/conversations creates a new conversation', async () => {
      const mockConv = {
        id: '22222222-2222-2222-2222-222222222222',
        userId,
        title: 'Daily Reflection',
        conversationType: 'general',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(ChatService.prototype, 'createConversation').mockResolvedValueOnce(mockConv as any);

      const res = await request(app)
        .post('/api/chat/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ title: 'Daily Reflection' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(mockConv.id);
      expect(res.body.data.title).toBe('Daily Reflection');
    });

    it('GET /api/chat/conversations lists conversations for authenticated user', async () => {
      vi.spyOn(ChatService.prototype, 'listConversations').mockResolvedValueOnce({
        conversations: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            userId,
            title: 'Daily Reflection',
            conversationType: 'general',
            serverRevision: 1,
            serverUpdatedAt: new Date(),
            isDeleted: false,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastMessage: null,
          },
        ],
        total: 1,
      });

      const res = await request(app)
        .get('/api/chat/conversations')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
    });

    it('GET /api/chat/conversations/:id retrieves a single conversation', async () => {
      const convId = '22222222-2222-2222-2222-222222222222';
      vi.spyOn(ChatService.prototype, 'getConversation').mockResolvedValueOnce({
        id: convId,
        userId,
        title: 'Daily Reflection',
        conversationType: 'general',
        serverRevision: 1,
        serverUpdatedAt: new Date(),
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/chat/conversations/${convId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(convId);
    });

    it('PATCH /api/chat/conversations/:id renames a conversation', async () => {
      const convId = '22222222-2222-2222-2222-222222222222';
      vi.spyOn(ChatService.prototype, 'updateConversation').mockResolvedValueOnce({
        id: convId,
        userId,
        title: 'Updated Title',
        conversationType: 'general',
        serverRevision: 1,
        serverUpdatedAt: new Date(),
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .patch(`/api/chat/conversations/${convId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Title');
    });

    it('DELETE /api/chat/conversations/:id soft deletes a conversation', async () => {
      const convId = '22222222-2222-2222-2222-222222222222';
      vi.spyOn(ChatService.prototype, 'deleteConversation').mockResolvedValueOnce(undefined);

      const res = await request(app)
        .delete(`/api/chat/conversations/${convId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Message Endpoints & Streaming', () => {
    it('GET /api/chat/conversations/:id/messages returns messages in conversation', async () => {
      const convId = '22222222-2222-2222-2222-222222222222';
      vi.spyOn(ChatService.prototype, 'listMessages').mockResolvedValueOnce([
        {
          id: 'msg-1',
          conversationId: convId,
          sender: 'user',
          content: 'Hello Cura',
          status: 'completed',
          providerUsed: null,
          modelUsed: null,
          clientMessageId: null,
          createdAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get(`/api/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].content).toBe('Hello Cura');
    });

    it('POST /api/chat/conversations/:id/messages sends message and returns completed messages', async () => {
      const convId = '22222222-2222-2222-2222-222222222222';
      vi.spyOn(ChatService.prototype, 'sendMessage').mockResolvedValueOnce({
        userMessage: {
          id: 'user-m1',
          conversationId: convId,
          sender: 'user',
          content: 'How can I relax?',
          status: 'completed',
          providerUsed: null,
          modelUsed: null,
          clientMessageId: null,
          createdAt: new Date(),
        },
        assistantMessage: {
          id: 'asst-m1',
          conversationId: convId,
          sender: 'assistant',
          content: 'Take deep, slow breaths.',
          status: 'completed',
          providerUsed: 'groq',
          modelUsed: 'llama-3.3-70b-versatile',
          clientMessageId: null,
          createdAt: new Date(),
        },
      });

      const res = await request(app)
        .post(`/api/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ content: 'How can I relax?' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assistantMessage.content).toBe('Take deep, slow breaths.');
    });

    it('POST /api/chat/conversations/:id/messages/stream streams response chunks over SSE', async () => {
      const convId = '22222222-2222-2222-2222-222222222222';

      vi.spyOn(ChatService.prototype, 'streamMessage').mockImplementationOnce(
        async (_userId, _convId, _input, onChunk) => {
          onChunk('Peace ');
          onChunk('and calm.');
          return {
            userMessage: {
              id: 'u-1',
              conversationId: convId,
              sender: 'user',
              content: 'Help me relax',
              status: 'completed',
              providerUsed: null,
              modelUsed: null,
              clientMessageId: null,
              createdAt: new Date(),
            },
            assistantMessage: {
              id: 'a-1',
              conversationId: convId,
              sender: 'assistant',
              content: 'Peace and calm.',
              status: 'completed',
              providerUsed: 'groq',
              modelUsed: 'llama-3.3-70b-versatile',
              clientMessageId: null,
              createdAt: new Date(),
            },
          };
        }
      );

      const res = await request(app)
        .post(`/api/chat/conversations/${convId}/messages/stream`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ content: 'Help me relax' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('event: chunk');
      expect(res.text).toContain('Peace ');
      expect(res.text).toContain('and calm.');
      expect(res.text).toContain('event: done');
    });
  });

  describe('User Chat Preferences Endpoints', () => {
    it('GET /api/chat/preferences returns user preference settings', async () => {
      vi.spyOn(ChatService.prototype, 'getPreferences').mockResolvedValueOnce({
        selectedChatProvider: 'groq',
        selectedChatModel: 'llama-3.3-70b-versatile',
        aiIncludeTasks: true,
        aiIncludeMoods: true,
      });

      const res = await request(app)
        .get('/api/chat/preferences')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.selectedChatProvider).toBe('groq');
      expect(res.body.data.aiIncludeTasks).toBe(true);
    });

    it('PATCH /api/chat/preferences updates preferences and rejects disallowed providers with 400', async () => {
      // Disallowed provider: gemini (interactive chat is restricted to groq and openrouter)
      const res = await request(app)
        .patch('/api/chat/preferences')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ selectedChatProvider: 'gemini' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('PATCH /api/chat/preferences succeeds for allowed provider (openrouter)', async () => {
      vi.spyOn(ChatService.prototype, 'updatePreferences').mockResolvedValueOnce({
        selectedChatProvider: 'openrouter',
        selectedChatModel: 'meta-llama/llama-3.3-70b-instruct',
        aiIncludeTasks: false,
        aiIncludeMoods: true,
      });

      const res = await request(app)
        .patch('/api/chat/preferences')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          selectedChatProvider: 'openrouter',
          selectedChatModel: 'meta-llama/llama-3.3-70b-instruct',
          aiIncludeTasks: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.selectedChatProvider).toBe('openrouter');
      expect(res.body.data.aiIncludeTasks).toBe(false);
    });
  });
});
