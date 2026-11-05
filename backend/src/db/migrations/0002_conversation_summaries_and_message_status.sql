ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "client_message_id" varchar(100);--> statement-breakpoint
ALTER TABLE "user_preferences" ALTER COLUMN "selected_chat_provider" SET DEFAULT 'groq';--> statement-breakpoint
ALTER TABLE "user_preferences" ALTER COLUMN "selected_chat_model" DROP NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"summary_text" text NOT NULL,
	"key_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
