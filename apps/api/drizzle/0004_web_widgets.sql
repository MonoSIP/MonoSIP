CREATE TABLE IF NOT EXISTS "web_widgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "public_key" varchar(32) NOT NULL,
  "name" varchar(100) NOT NULL,
  "number" varchar(20) NOT NULL,
  "dest_type" varchar(32) NOT NULL,
  "dest_id" text,
  "allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "max_concurrent" integer DEFAULT 5 NOT NULL,
  "max_call_seconds" integer DEFAULT 600 NOT NULL,
  "daily_limit" integer DEFAULT 100 NOT NULL,
  "requests_per_ip_hour" integer DEFAULT 30 NOT NULL,
  "button_text" varchar(64) DEFAULT 'Call us' NOT NULL,
  "button_color" varchar(16) DEFAULT '#0f766e' NOT NULL,
  "position" varchar(24) DEFAULT 'bottom-right' NOT NULL,
  "locale" varchar(8) DEFAULT 'en' NOT NULL,
  "ask_name" boolean DEFAULT false NOT NULL,
  "browser_call_enabled" boolean DEFAULT true NOT NULL,
  "callback_enabled" boolean DEFAULT false NOT NULL,
  "callback_prefixes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "web_widgets_public_key_idx" ON "web_widgets" ("public_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "web_widgets_number_idx" ON "web_widgets" ("number");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "widget_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "widget_id" uuid NOT NULL REFERENCES "web_widgets"("id") ON DELETE cascade,
  "sip_user" varchar(32) NOT NULL,
  "sip_pass_enc" text NOT NULL,
  "caller_name" varchar(100),
  "origin" varchar(255),
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "widget_sessions_sip_user_idx" ON "widget_sessions" ("sip_user");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "widget_daily_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "widget_id" uuid NOT NULL REFERENCES "web_widgets"("id") ON DELETE cascade,
  "day" varchar(10) NOT NULL,
  "calls" integer DEFAULT 0 NOT NULL,
  "callbacks" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "widget_daily_stats_day_idx" ON "widget_daily_stats" ("widget_id","day");
