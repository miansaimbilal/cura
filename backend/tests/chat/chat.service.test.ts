import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from '../../src/modules/chat/chat.service';
import { ChatContextBuilder } from '../../src/modules/chat/chat.context';
import { ChatSummaryService } from '../../src/modules/chat/chat.summary';
import { AppError } from '../../src/middleware/errorHandler';
import { AIProviderError } from '../../src/modules/ai/errors';
import { AIWorkloadRouter } from '../../src/modules/ai/router';
import { db } from '../../src/db/index';

vi.mock('../../src/db/index', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('Chat Service & Context Construction (Unit Tests)', () => {
  let chatService: ChatService;
  let mockRouter: any;
  let mockContextBuilder: any;
  let mockSummaryService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRouter = {
      executeChatStream: vi.fn(),
      executeChat: vi.fn(),
      executeAnalytics: vi.fn(),
      registry: {
        getConfig: vi.fn().mockReturnValue({
          workloads: {
            chat: {
              allowedProviders: ['groq', 'openrouter'],
              defaultProvider: 'groq',
              defaultModel: 'llama-3.3-70b-versatile',
            },
          },
        }),
        getProvider: vi.fn().mockReturnValue({
          id: 'groq',
          name: 'Groq',
          getDefaultModel: () => 'llama-3.3-70b-versatile',
          streamText: vi.fn(),
        }),
      },
    };

    mockContextBuilder = {
      buildSystemContext: vi.fn().mockResolvedValue({
        role: 'system',
        content: 'You are Cura, a gentle and thoughtful companion.',
      }),
    };

    mockSummaryService = {
      maybeUpdateSummary: vi.fn().mockResolvedValue(undefined),
    };

    chatService = new ChatService(mockRouter, mockContextBuilder, mockSummaryService);
  });

  describe('Conversation Lifecycle & Ownership', () => {
    it('creates a new conversation and persists to database', async () => {
      const mockConv = {
        id: 'conv-1111',
        userId: 'user-1',
        title: 'Morning Check-in',
        conversationType: 'general',
        serverRevision: 1,
        serverUpdatedAt: new Date(),
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (db.insert as any).mockReturnValueOnce({
        values: vi.fn().mockReturnValueOnce({
          returning: vi.fn().mockResolvedValueOnce([mockConv]),
        }),
      });

      const result = await chatService.createConversation('user-1', {
        title: 'Morning Check-in',
      });

      expect(result.id).toBe('conv-1111');
      expect(result.title).toBe('Morning Check-in');
    });

    it('generates a default formatted title when title is omitted', async () => {
      (db.insert as any).mockReturnValueOnce({
        values: vi.fn().mockImplementationOnce((vals) => {
          expect(vals.title).toContain('Reflection ·');
          return {
            returning: vi.fn().mockResolvedValueOnce([
              {
                id: 'conv-default',
                userId: 'user-1',
                title: vals.title,
                isDeleted: false,
              },
            ]),
          };
        }),
      });

      const result = await chatService.createConversation('user-1', {});
      expect(result.title).toContain('Reflection ·');
    });

    it('enforces conversation ownership and throws 404 if conversation belongs to another user', async () => {
      // Mock db returning empty array (no matching record for this user)
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      await expect(
        chatService.getConversation('user-attack', 'conv-victim')
      ).rejects.toThrow(AppError);
    });

    it('soft deletes a conversation by setting isDeleted = true', async () => {
      // Mock getConversation ownership verification
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              { id: 'conv-del', userId: 'user-1', isDeleted: false },
            ]),
          }),
        }),
      });

      const setMock = vi.fn().mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([]),
      });

      (db.update as any).mockReturnValueOnce({
        set: setMock,
      });

      await chatService.deleteConversation('user-1', 'conv-del');
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: true })
      );
    });
  });

  describe('Message Streaming & Idempotency', () => {
    it('prevents duplicate message processing when clientMessageId already exists in conversation', async () => {
      // 1. Mock getConversation
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              { id: 'conv-1', userId: 'user-1', isDeleted: false },
            ]),
          }),
        }),
      });

      // 2. Mock duplicate clientMessageId check returning an existing message
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              { id: 'msg-exist', clientMessageId: 'client-dup-1' },
            ]),
          }),
        }),
      });

      await expect(
        chatService.streamMessage(
          'user-1',
          'conv-1',
          { content: 'Retry identical text', clientMessageId: 'client-dup-1' },
          vi.fn()
        )
      ).rejects.toThrow(AppError);
    });

    it('rejects unpermitted interactive chat providers (e.g. gemini) with 400', async () => {
      // Mock getConversation
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              { id: 'conv-1', userId: 'user-1', isDeleted: false },
            ]),
          }),
        }),
      });

      // Mock user insert
      (db.insert as any).mockReturnValueOnce({
        values: vi.fn().mockReturnValueOnce({
          returning: vi.fn().mockResolvedValueOnce([{ id: 'msg-user-1' }]),
        }),
      });

      // Mock user preferences
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      (db.update as any).mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      await expect(
        chatService.streamMessage(
          'user-1',
          'conv-1',
          { content: 'Hello', provider: 'gemini' as any },
          vi.fn()
        )
      ).rejects.toThrow(AppError);
    });

    it('persists assistant response with status completed on successful stream execution', async () => {
      // 1. Mock getConversation
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              { id: 'conv-1', userId: 'user-1', isDeleted: false },
            ]),
          }),
        }),
      });

      // 2. Mock clientMessageId check (none found)
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      // 3. Mock user message insert
      (db.insert as any).mockReturnValueOnce({
        values: vi.fn().mockReturnValueOnce({
          returning: vi.fn().mockResolvedValueOnce([
            { id: 'msg-user-1', sender: 'user', content: 'Feeling stressed' },
          ]),
        }),
      });

      // 4. Mock conversation update
      (db.update as any).mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      // 5. Mock user preferences select
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              { selectedChatProvider: 'groq', selectedChatModel: 'llama-3.3-70b-versatile' },
            ]),
          }),
        }),
      });

      // 6. Mock history select
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            orderBy: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([]),
            }),
          }),
        }),
      });

      // 7. Mock stream execution
      mockRouter.executeChatStream.mockImplementationOnce(
        async (_req: any, onChunk: (c: string) => void) => {
          onChunk('I hear you. ');
          onChunk('Take a slow breath.');
          return {
            text: 'I hear you. Take a slow breath.',
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
          };
        }
      );

      // 8. Mock assistant message insert
      (db.insert as any).mockReturnValueOnce({
        values: vi.fn().mockReturnValueOnce({
          returning: vi.fn().mockResolvedValueOnce([
            {
              id: 'msg-asst-1',
              sender: 'assistant',
              content: 'I hear you. Take a slow breath.',
              status: 'completed',
            },
          ]),
        }),
      });

      // 9. Mock conversation update
      (db.update as any).mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      const emittedChunks: string[] = [];
      const result = await chatService.streamMessage(
        'user-1',
        'conv-1',
        { content: 'Feeling stressed', clientMessageId: 'client-m-1' },
        (chunk) => emittedChunks.push(chunk)
      );

      expect(emittedChunks).toEqual(['I hear you. ', 'Take a slow breath.']);
      expect(result.assistantMessage.status).toBe('completed');
      expect(mockSummaryService.maybeUpdateSummary).toHaveBeenCalledWith('user-1', 'conv-1');
    });

    it('persists partial assistant message with status interrupted if stream fails midway', async () => {
      // 1. Mock getConversation
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              { id: 'conv-1', userId: 'user-1', isDeleted: false },
            ]),
          }),
        }),
      });

      // 2. Mock clientMessageId check
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      // 3. Mock user message insert
      (db.insert as any).mockReturnValueOnce({
        values: vi.fn().mockReturnValueOnce({
          returning: vi.fn().mockResolvedValueOnce([
            { id: 'msg-user-1', sender: 'user', content: 'Help me plan' },
          ]),
        }),
      });

      // 4. Mock conversation update
      (db.update as any).mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      // 5. Mock user preferences select
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      // 6. Mock history select
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            orderBy: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([]),
            }),
          }),
        }),
      });

      // 7. Mock stream execution that emits chunks then throws error
      mockRouter.executeChatStream.mockImplementationOnce(
        async (_req: any, onChunk: (c: string) => void) => {
          onChunk('Starting task analysis...');
          throw new AIProviderError({
            category: 'PROVIDER_UNAVAILABLE',
            provider: 'groq',
            message: 'Stream disconnected',
          });
        }
      );

      // 8. Mock interrupted message insert
      const valuesMock = vi.fn().mockResolvedValueOnce([]);
      (db.insert as any).mockReturnValueOnce({
        values: valuesMock,
      });

      await expect(
        chatService.streamMessage(
          'user-1',
          'conv-1',
          { content: 'Help me plan', clientMessageId: 'client-m-2' },
          vi.fn()
        )
      ).rejects.toThrow(AppError);

      expect(valuesMock).toHaveBeenCalled();
    });
  });

  describe('User Preferences Management', () => {
    it('retrieves default preferences when none are stored', async () => {
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      const prefs = await chatService.getPreferences('user-new');
      expect(prefs.selectedChatProvider).toBe('groq');
      expect(prefs.aiIncludeTasks).toBe(true);
      expect(prefs.aiIncludeMoods).toBe(true);
    });

    it('rejects updating chat provider to disallowed providers (e.g. cloudflare) with 400', async () => {
      await expect(
        chatService.updatePreferences('user-1', {
          selectedChatProvider: 'cloudflare' as any,
        })
      ).rejects.toThrow(AppError);
    });
  });
});
