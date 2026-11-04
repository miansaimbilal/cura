ALTER TABLE "migration_batches" DROP CONSTRAINT "migration_batches_batch_id_unique";--> statement-breakpoint
ALTER TABLE "mutation_idempotency" DROP CONSTRAINT "mutation_idempotency_client_mutation_id_unique";--> statement-breakpoint
ALTER TABLE "migration_batches" ADD CONSTRAINT "migration_batches_user_batch_unique" UNIQUE("user_id","batch_id");--> statement-breakpoint
ALTER TABLE "mutation_idempotency" ADD CONSTRAINT "mutation_idempotency_user_mutation_unique" UNIQUE("user_id","client_mutation_id");