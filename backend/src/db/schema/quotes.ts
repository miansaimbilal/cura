import { pgTable, uuid, text, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const quotePool = pgTable('quote_pool', {
  id: uuid('id').primaryKey().defaultRandom(),
  quoteText: text('quote_text').notNull(),
  author: varchar('author', { length: 150 }).notNull(),
  category: varchar('category', { length: 50 }).default('general').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userActiveQuote = pgTable('user_active_quote', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotePool.id, { onDelete: 'cascade' }),
  displayedAt: timestamp('displayed_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Quote = typeof quotePool.$inferSelect;
export type UserActiveQuote = typeof userActiveQuote.$inferSelect;
