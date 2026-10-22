ALTER TABLE "missed_calls" ADD COLUMN IF NOT EXISTS "seen" boolean DEFAULT false NOT NULL;
