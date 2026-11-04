import { pgTable, uuid, varchar, text, date, time, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  dueDate: date('due_date'),
  dueTime: time('due_time'),
  isTimed: boolean('is_timed').default(false).notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  postponedAt: timestamp('postponed_at', { withTimezone: true }),
  serverRevision: integer('server_revision').default(1).notNull(),
  serverUpdatedAt: timestamp('server_updated_at', { withTimezone: true }).defaultNow().notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
