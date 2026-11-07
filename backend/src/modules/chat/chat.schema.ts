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

export function isValidCalendarDate(val: string): boolean {
  if (typeof val !== 'string') return false;
  const match = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

export const sendMessageSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid conversation UUID'),
  }),
  body: z.object({
    content: z.string().trim().min(1, 'Message content cannot be empty').max(10000, 'Message exceeds 10000 character limit'),
    clientMessageId: z.string().trim().max(100).optional(),
    clientLocalDate: z.string().trim().refine(isValidCalendarDate, {
      message: 'Invalid clientLocalDate. Must be a valid calendar date in YYYY-MM-DD format.',
    }).optional(),
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
