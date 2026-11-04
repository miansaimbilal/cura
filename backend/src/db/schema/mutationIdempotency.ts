import { pgTable, uuid, varchar, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const mutationIdempotency = pgTable(
  'mutation_idempotency',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientMutationId: varchar('client_mutation_id', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('mutation_idempotency_user_mutation_unique').on(
      table.userId,
      table.clientMutationId
    ),
  ]
);

export type MutationIdempotency = typeof mutationIdempotency.$inferSelect;
export type NewMutationIdempotency = typeof mutationIdempotency.$inferInsert;
