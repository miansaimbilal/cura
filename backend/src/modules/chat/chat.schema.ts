import { z } from 'zod';

export const createConversationSchema = z.object({
  body: z.object({
    title: z.string().trim().max(255).optional(),
    conversationType: z.string().trim().max(30).default('general'),
  }),
});

export const conversationIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid conversation UUID'),
  }),
});

export const updateConversationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid conversation UUID'),
  }),
  body: z.object({
    title: z.string().trim().min(1, 'Title cannot be empty').max(255),
  }),
});

export const listConversationsQuerySchema = z.object({
  query: z.object({
    limit: z.coerce.number().min(1).max(100).default(30),
    offset: z.coerce.number().min(0).default(0),
  }).default({}),
});

export const listMessagesQuerySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid conversation UUID'),
  }),
  query: z.object({
    limit: z.coerce.number().min(1).max(100).default(50),
    before: z.string().datetime().optional(),
  }).default({}),
});

export const sendMessageSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid conversation UUID'),
  }),
  body: z.object({
    content: z.string().trim().min(1, 'Message content cannot be empty').max(10000, 'Message exceeds 10000 character limit'),
    clientMessageId: z.string().trim().max(100).optional(),
    provider: z.enum(['groq', 'openrouter'], {
      errorMap: () => ({ message: 'Interactive chat is restricted to "groq" or "openrouter".' }),
    }).optional(),
    model: z.string().trim().max(100).optional(),
  }),
});

export const updateChatPreferencesSchema = z.object({
  body: z.object({
    selectedChatProvider: z.enum(['groq', 'openrouter'], {
      errorMap: () => ({ message: 'Interactive chat provider must be "groq" or "openrouter".' }),
    }).optional(),
    selectedChatModel: z.string().trim().max(100).optional(),
    aiIncludeTasks: z.boolean().optional(),
    aiIncludeMoods: z.boolean().optional(),
  }),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>['body'];
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>['body'];
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>['query'];
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>['query'];
export type SendMessageInput = z.infer<typeof sendMessageSchema>['body'];
export type UpdateChatPreferencesInput = z.infer<typeof updateChatPreferencesSchema>['body'];
