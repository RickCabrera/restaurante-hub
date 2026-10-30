ALTER TABLE "requisition" ADD COLUMN "merged_request_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "requisition" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "pos_ticket_item" ADD COLUMN "discount_type" text;--> statement-breakpoint
ALTER TABLE "pos_ticket_item" ADD COLUMN "discount_value" integer;--> statement-breakpoint
ALTER TABLE "pos_ticket_item" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "pos_ticket_item" ADD COLUMN "cancelled_by_id" text;--> statement-breakpoint
ALTER TABLE "pos_ticket" ADD COLUMN "discount_type" text;--> statement-breakpoint
ALTER TABLE "pos_ticket" ADD COLUMN "discount_value" integer;--> statement-breakpoint
ALTER TABLE "pos_ticket" ADD COLUMN "tip_percent" integer;--> statement-breakpoint
ALTER TABLE "pos_ticket" ADD COLUMN "tip_fixed_cents" integer;--> statement-breakpoint
ALTER TABLE "pos_ticket" ADD COLUMN "cancelled_by_id" text;--> statement-breakpoint
ALTER TABLE "pos_ticket" ADD COLUMN "merged_into_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_area_owner_uq" ON "conversation" USING btree ("business_id","area_id") WHERE type = 'AREA_OWNER';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_general_uq" ON "conversation" USING btree ("business_id") WHERE type = 'GENERAL';