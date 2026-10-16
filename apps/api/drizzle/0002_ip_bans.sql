CREATE TABLE IF NOT EXISTS "ip_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" varchar(64) NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"reason" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ip_bans_ip_idx" ON "ip_bans" USING btree ("ip");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ip_bans_active_idx" ON "ip_bans" USING btree ("active");
