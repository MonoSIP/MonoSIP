ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "allowed_ips" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "prefixes" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "calls_per_minute" integer;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "max_concurrent" integer;

CREATE TABLE IF NOT EXISTS "announce_calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "api_key_id" uuid NOT NULL REFERENCES "api_keys"("id") ON DELETE CASCADE,
  "number" varchar(32) NOT NULL,
  "text" text NOT NULL,
  "language" varchar(8) NOT NULL,
  "voice" varchar(16) NOT NULL,
  "result_mode" varchar(16) NOT NULL,
  "caller_id" varchar(32),
  "webhook_url" text,
  "status" varchar(16) DEFAULT 'ringing' NOT NULL,
  "outcome" varchar(16) DEFAULT 'pending' NOT NULL,
  "reason" varchar(32),
  "digits" varchar(32),
  "channel_id" varchar(80),
  "recording_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "finished_at" timestamptz
);
