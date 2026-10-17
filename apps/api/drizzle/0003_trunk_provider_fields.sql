ALTER TABLE "trunks" ADD COLUMN IF NOT EXISTS "from_domain" varchar(255);
--> statement-breakpoint
ALTER TABLE "trunks" ADD COLUMN IF NOT EXISTS "outbound_proxy" varchar(255);
--> statement-breakpoint
ALTER TABLE "trunks" ADD COLUMN IF NOT EXISTS "register" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "trunks" ADD COLUMN IF NOT EXISTS "notes" text;
