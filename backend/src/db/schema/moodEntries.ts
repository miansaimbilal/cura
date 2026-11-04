import { pgTable, uuid, varchar, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { users } from './users';

export const moodEntries = pgTable('mood_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  moodType: varchar('mood_type', { length: 30 }).notNull(),
  note: text('note'),
  tags: text('tags').array().default([]).notNull(),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
  serverRevision: integer('server_revision').default(1).notNull(),
  serverUpdatedAt: timestamp('server_updated_at', { withTimezone: true }).defaultNow().notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type MoodEntry = typeof moodEntries.$inferSelect;
export type NewMoodEntry = typeof moodEntries.$inferInsert;
