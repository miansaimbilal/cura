import { pgTable, uuid, varchar, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const migrationBatches = pgTable(
  'migration_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    batchId: varchar('batch_id', { length: 100 }).notNull(),
    clientMutationIds: jsonb('client_mutation_ids').notNull(),
    entityCounts: jsonb('entity_counts').notNull(),
    status: varchar('status', { length: 20 }).default('completed').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('migration_batches_user_batch_unique').on(table.userId, table.batchId),
  ]
);

export type MigrationBatch = typeof migrationBatches.$inferSelect;
export type NewMigrationBatch = typeof migrationBatches.$inferInsert;
