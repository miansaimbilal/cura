import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').max(255),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(100),
    displayName: z.string().max(100).optional(),
    timezone: z.string().max(50).default('UTC'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').max(255),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const migrateBatchSchema = z.object({
  body: z.object({
    batchId: z.string().min(1, 'batchId is required').max(100),
    clientMutationIds: z.array(z.string().min(1)).default([]),
    entities: z.object({
      tasks: z
        .array(
          z.object({
            id: z.string().uuid(),
            title: z.string().min(1).max(255),
            description: z.string().nullable().optional(),
            dueDate: z.string().nullable().optional(),
            dueTime: z.string().nullable().optional(),
            isTimed: z.boolean().default(false),
            status: z.enum(['pending', 'completed', 'postponed', 'cancelled']).default('pending'),
            completedAt: z.string().datetime({ offset: true }).nullable().optional(),
            postponedAt: z.string().datetime({ offset: true }).nullable().optional(),
            createdAt: z.string().datetime({ offset: true }).optional(),
          })
        )
        .default([]),
      moodEntries: z
        .array(
          z.object({
            id: z.string().uuid(),
            moodType: z.enum([
              'happy',
              'excited',
              'calm',
              'okay',
              'tired',
              'stressed',
              'sad',
              'anxious',
              'angry',
            ]),
            note: z.string().nullable().optional(),
            tags: z.array(z.string()).default([]),
            loggedAt: z.string().datetime({ offset: true }),
            createdAt: z.string().datetime({ offset: true }).optional(),
          })
        )
        .default([]),
      userPreferences: z
        .object({
          themeMode: z.enum(['dark', 'light', 'system']).optional(),
          selectedChatProvider: z.string().max(50).optional(),
          selectedChatModel: z.string().max(50).optional(),
          selectedCountry: z.string().max(10).optional(),
          morningCheckinTime: z.string().optional(),
          eveningCheckinTime: z.string().optional(),
          eodReminderTime: z.string().optional(),
        })
        .optional(),
    }),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type RefreshInput = z.infer<typeof refreshSchema>['body'];
export type MigrateBatchInput = z.infer<typeof migrateBatchSchema>['body'];
