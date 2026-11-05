import { eq, and, desc, lt } from 'drizzle-orm';
import { db } from '../../db/index';
import { conversations, Conversation } from '../../db/schema/conversations';
import { messages, Message } from '../../db/schema/messages';
import { userPreferences } from '../../db/schema/userPreferences';
import { AppError } from '../../middleware/errorHandler';
import { AIWorkloadRouter } from '../ai/router';
import { AIProviderError } from '../ai/errors';
import { ChatContextBuilder } from './chat.context';
import { ChatSummaryService } from './chat.summary';
import type {
  CreateConversationInput,
  UpdateConversationInput,
  ListConversationsQuery,
  ListMessagesQuery,
  SendMessageInput,
  UpdateChatPreferencesInput,
} from './chat.schema';
import type { AIMessage, AITextRequest } from '../ai/types';

export class ChatService {
  private readonly router: AIWorkloadRouter;
  private readonly contextBuilder: ChatContextBuilder;
  private readonly summaryService: ChatSummaryService;

  constructor(
    router?: AIWorkloadRouter,
    contextBuilder?: ChatContextBuilder,
    summaryService?: ChatSummaryService
  ) {
    this.router = router ?? new AIWorkloadRouter();
    this.contextBuilder = contextBuilder ?? new ChatContextBuilder();
    this.summaryService = summaryService ?? new ChatSummaryService(this.router);
  }

  /**
   * Creates a new conversation for an authenticated user.
   */
  public async createConversation(
    userId: string,
    input: CreateConversationInput
  ): Promise<Conversation> {
    const formattedDate = new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const title = input.title?.trim() || `Reflection · ${formattedDate}`;

    const [conversation] = await db
      .insert(conversations)
      .values({
        userId,
        title,
        conversationType: input.conversationType || 'general',
      })
      .returning();

    return conversation;
  }

  /**
   * Retrieves all active (non-deleted) conversations for a user with pagination.
   */
  public async listConversations(
    userId: string,
    query: ListConversationsQuery
  ): Promise<{ conversations: (Conversation & { lastMessage?: Message | null })[]; total: number }> {
    const items = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userId, userId), eq(conversations.isDeleted, false)))
      .orderBy(desc(conversations.updatedAt))
      .limit(query.limit)
      .offset(query.offset);

    // Fetch last message preview for each conversation
    const conversationsWithLastMessage = await Promise.all(
      items.map(async (conv) => {
        const [lastMsg] = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conv.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        return {
          ...conv,
          lastMessage: lastMsg ?? null,
        };
      })
    );

    return {
      conversations: conversationsWithLastMessage,
      total: items.length,
    };
  }

  /**
   * Retrieves a single conversation by ID with ownership verification.
   */
  public async getConversation(userId: string, conversationId: string): Promise<Conversation> {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
          eq(conversations.isDeleted, false)
        )
      )
      .limit(1);

    if (!conv) {
      throw new AppError(404, 'NOT_FOUND', 'Conversation not found or access denied.');
    }

    return conv;
  }

  /**
   * Updates conversation metadata (e.g. title) with ownership check.
   */
  public async updateConversation(
    userId: string,
    conversationId: string,
    input: UpdateConversationInput
  ): Promise<Conversation> {
    await this.getConversation(userId, conversationId);

    const [updated] = await db
      .update(conversations)
      .set({
        title: input.title.trim(),
        updatedAt: new Date(),
      })
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
      .returning();

    return updated;
  }

  /**
   * Soft deletes a conversation and its messages.
   */
  public async deleteConversation(userId: string, conversationId: string): Promise<void> {
    await this.getConversation(userId, conversationId);

    await db
      .update(conversations)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  }

  /**
   * Retrieves paginated messages for a conversation in chronological order.
   */
  public async listMessages(
    userId: string,
    conversationId: string,
    query: ListMessagesQuery
  ): Promise<Message[]> {
    await this.getConversation(userId, conversationId);

    const conditions = [eq(messages.conversationId, conversationId)];
    if (query.before) {
      conditions.push(lt(messages.createdAt, new Date(query.before)));
    }

    const fetched = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(query.limit);

    // Return in chronological ascending order
    return fetched.reverse();
  }

  /**
   * Streams an AI response over Server-Sent Events, persisting both user and assistant messages.
   */
  public async streamMessage(
    userId: string,
    conversationId: string,
    input: SendMessageInput,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<{ userMessage: Message; assistantMessage: Message }> {
    // 1. Verify ownership
    await this.getConversation(userId, conversationId);

    // 2. Idempotency Check: if clientMessageId provided, prevent duplicate creation
    if (input.clientMessageId) {
      const [existingUserMsg] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.clientMessageId, input.clientMessageId)
          )
        )
        .limit(1);

      if (existingUserMsg) {
        throw new AppError(
          409,
          'DUPLICATE_MESSAGE',
          'A message with this client ID has already been submitted to this conversation.'
        );
      }
    }

    // 3. Persist User Message Immediately
    const [userMessage] = await db
      .insert(messages)
      .values({
        conversationId,
        sender: 'user',
        content: input.content.trim(),
        clientMessageId: input.clientMessageId,
        status: 'completed',
      })
      .returning();

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    // 4. Resolve Interactive Provider & Model
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    const targetProvider = input.provider || (prefs?.selectedChatProvider as 'groq' | 'openrouter') || 'groq';
    const targetModel = input.model || prefs?.selectedChatModel || undefined;

    // Strict validation: interactive chat only permitted on groq & openrouter
    if (targetProvider !== 'groq' && targetProvider !== 'openrouter') {
      throw new AppError(
        400,
        'INVALID_REQUEST',
        `Interactive chat is restricted to "groq" or "openrouter". Provider "${targetProvider}" is not permitted.`
      );
    }

    // 5. Build Bounded Context Package
    const systemContext = await this.contextBuilder.buildSystemContext({ userId, conversationId });

    // Fetch up to 10 recent messages for conversational continuity
    const history = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.status, 'completed')))
      .orderBy(desc(messages.createdAt))
      .limit(10);

    const orderedHistory = history.reverse();

    const requestMessages: AIMessage[] = [
      systemContext,
      ...orderedHistory.map((m) => ({
        role: m.sender as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      {
        role: 'user',
        content: input.content.trim(),
      },
    ];

    const aiRequest: AITextRequest = {
      messages: requestMessages,
      model: targetModel,
      options: {
        temperature: 0.7,
        maxTokens: 1024,
      },
    };

    let fullAssistantText = '';

    try {
      const response = await this.router.executeChatStream(
        aiRequest,
        (chunk) => {
          fullAssistantText += chunk;
          onChunk(chunk);
        },
        {
          provider: targetProvider,
          model: targetModel,
        },
        signal
      );

      // 6. Persist Completed Assistant Message
      const [assistantMessage] = await db
        .insert(messages)
        .values({
          conversationId,
          sender: 'assistant',
          content: response.text.trim(),
          providerUsed: targetProvider,
          modelUsed: response.model,
          status: 'completed',
        })
        .returning();

      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      // Asynchronously trigger rolling summary update
      this.summaryService.maybeUpdateSummary(userId, conversationId).catch(() => {});

      return { userMessage, assistantMessage };
    } catch (err: unknown) {
      // If partial generation occurred before abort or error, persist as interrupted
      if (fullAssistantText.trim().length > 0) {
        await db.insert(messages).values({
          conversationId,
          sender: 'assistant',
          content: fullAssistantText.trim(),
          providerUsed: targetProvider,
          modelUsed: targetModel || 'unknown',
          status: 'interrupted',
        });
      }

      if (err instanceof AIProviderError) {
        throw new AppError(
          err.statusCode || 502,
          err.category,
          err.message,
          { retryable: err.isRetryable, retryAfterSeconds: err.retryAfterSeconds }
        );
      }

      throw err;
    }
  }

  /**
   * Non-streaming message generation (for clients or automated integration tests).
   */
  public async sendMessage(
    userId: string,
    conversationId: string,
    input: SendMessageInput
  ): Promise<{ userMessage: Message; assistantMessage: Message }> {
    return this.streamMessage(
      userId,
      conversationId,
      input,
      () => {}
    );
  }

  /**
   * Retrieves the user's chat preferences.
   */
  public async getPreferences(userId: string) {
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    return {
      selectedChatProvider: prefs?.selectedChatProvider ?? 'groq',
      selectedChatModel: prefs?.selectedChatModel ?? null,
      aiIncludeTasks: prefs?.aiIncludeTasks ?? true,
      aiIncludeMoods: prefs?.aiIncludeMoods ?? true,
    };
  }

  /**
   * Updates the user's chat preferences with validation.
   */
  public async updatePreferences(userId: string, input: UpdateChatPreferencesInput) {
    if (input.selectedChatProvider) {
      if (input.selectedChatProvider !== 'groq' && input.selectedChatProvider !== 'openrouter') {
        throw new AppError(
          400,
          'INVALID_REQUEST',
          'Interactive chat provider must be strictly "groq" or "openrouter".'
        );
      }
    }

    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(userPreferences)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();

      return {
        selectedChatProvider: updated.selectedChatProvider,
        selectedChatModel: updated.selectedChatModel,
        aiIncludeTasks: updated.aiIncludeTasks,
        aiIncludeMoods: updated.aiIncludeMoods,
      };
    } else {
      const [created] = await db
        .insert(userPreferences)
        .values({
          userId,
          selectedChatProvider: input.selectedChatProvider ?? 'groq',
          selectedChatModel: input.selectedChatModel,
          aiIncludeTasks: input.aiIncludeTasks ?? true,
          aiIncludeMoods: input.aiIncludeMoods ?? true,
        })
        .returning();

      return {
        selectedChatProvider: created.selectedChatProvider,
        selectedChatModel: created.selectedChatModel,
        aiIncludeTasks: created.aiIncludeTasks,
        aiIncludeMoods: created.aiIncludeMoods,
      };
    }
  }
}
