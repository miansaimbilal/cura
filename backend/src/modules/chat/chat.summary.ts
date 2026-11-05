import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../../db/index';
import { messages } from '../../db/schema/messages';
import { conversationSummaries } from '../../db/schema/conversationSummaries';
import { AIWorkloadRouter } from '../ai/router';

export class ChatSummaryService {
  private readonly router: AIWorkloadRouter;

  constructor(router?: AIWorkloadRouter) {
    this.router = router ?? new AIWorkloadRouter();
  }

  /**
   * Checks whether the conversation needs a summary update and updates it asynchronously.
   * Runs safely in the background: if summary generation encounters any provider error,
   * it logs the error without interrupting user chat interactions.
   */
  public async maybeUpdateSummary(userId: string, conversationId: string): Promise<void> {
    try {
      // 1. Count messages in conversation
      const [msgCountResult] = await db
        .select({ value: count() })
        .from(messages)
        .where(eq(messages.conversationId, conversationId));

      const totalMessages = msgCountResult?.value ?? 0;
      if (totalMessages < 6) {
        return; // Too short for a meaningful rolling summary
      }

      // 2. Fetch existing summary
      const [existingSummary] = await db
        .select()
        .from(conversationSummaries)
        .where(
          and(
            eq(conversationSummaries.conversationId, conversationId),
            eq(conversationSummaries.userId, userId)
          )
        )
        .limit(1);

      // 3. Fetch recent messages
      const recentMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(12);

      const orderedMessages = recentMessages.reverse();
      const lastMessage = orderedMessages[orderedMessages.length - 1];

      // If summary already incorporates this last message, skip
      if (existingSummary?.lastMessageId === lastMessage?.id) {
        return;
      }

      const promptMessages = [
        {
          role: 'system' as const,
          content: `You are an analytical assistant creating a concise, factual context summary for a companion conversation.
Rules:
- Capture explicit user goals, stated concerns, and unresolved topics in 2-3 brief sentences.
- Do NOT make psychological diagnoses, clinical interpretations, or assumptions.
- Only include facts explicitly mentioned by the user.`,
        },
        {
          role: 'user' as const,
          content: `Summarize the key topics and explicit user goals from this conversation:
${orderedMessages.map((m) => `${m.sender.toUpperCase()}: ${m.content}`).join('\n')}`,
        },
      ];

      // Execute background summary generation via analytics workload router
      const result = await this.router.executeAnalytics({
        messages: promptMessages,
        options: {
          maxTokens: 150,
          temperature: 0.3,
        },
      });

      const summaryText = result.text.trim();
      if (!summaryText) return;

      if (existingSummary) {
        await db
          .update(conversationSummaries)
          .set({
            summaryText,
            lastMessageId: lastMessage.id,
            updatedAt: new Date(),
          })
          .where(eq(conversationSummaries.id, existingSummary.id));
      } else {
        await db.insert(conversationSummaries).values({
          conversationId,
          userId,
          summaryText,
          lastMessageId: lastMessage.id,
          keyTopics: [],
        });
      }
    } catch (err: unknown) {
      // Safe fallback: non-blocking summary failure
      console.warn(`[ChatSummaryService] Background summary generation failed for conversation ${conversationId}:`, err);
    }
  }
}
