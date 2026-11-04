import { pgTable, uuid, varchar, boolean, time, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  themeMode: varchar('theme_mode', { length: 10 }).default('dark').notNull(),
  selectedChatProvider: varchar('selected_chat_provider', { length: 50 }).default('gemini').notNull(),
  selectedChatModel: varchar('selected_chat_model', { length: 50 }).default('gemini-1.5-flash').notNull(),
  selectedCountry: varchar('selected_country', { length: 10 }).default('US').notNull(),
  aiIncludeTasks: boolean('ai_include_tasks').default(true).notNull(),
  aiIncludeMoods: boolean('ai_include_moods').default(true).notNull(),
  notifyTimedTasks: boolean('notify_timed_tasks').default(true).notNull(),
  notifyEodTasks: boolean('notify_eod_tasks').default(true).notNull(),
  notifyMorningCheckin: boolean('notify_morning_checkin').default(true).notNull(),
  notifyEveningCheckin: boolean('notify_evening_checkin').default(true).notNull(),
  notifyAccomplishments: boolean('notify_accomplishments').default(true).notNull(),
  notifyAiInsights: boolean('notify_ai_insights').default(true).notNull(),
  morningCheckinTime: time('morning_checkin_time').default('08:30:00').notNull(),
  eveningCheckinTime: time('evening_checkin_time').default('20:30:00').notNull(),
  eodReminderTime: time('eod_reminder_time').default('21:00:00').notNull(),
  quietHoursStart: time('quiet_hours_start'),
  quietHoursEnd: time('quiet_hours_end'),
  serverRevision: integer('server_revision').default(1).notNull(),
  serverUpdatedAt: timestamp('server_updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
