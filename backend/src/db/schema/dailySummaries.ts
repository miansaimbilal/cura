import { pgTable, uuid, text, date, integer, jsonb, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const dailySummaries = pgTable('daily_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  summaryText: text('summary_text').notNull(),
  tasksCompletedCount: integer('tasks_completed_count').default(0).notNull(),
  tasksTotalCount: integer('tasks_total_count').default(0).notNull(),
  moodDistribution: jsonb('mood_distribution').default({}).notNull(),
  providerUsed: varchar('provider_used', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type DailySummary = typeof dailySummaries.$inferSelect;
export type NewDailySummary = typeof dailySummaries.$inferInsert;
