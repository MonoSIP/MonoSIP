ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "key_id" varchar(64);
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "barrier_hash" text;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_id_idx" ON "api_keys" ("key_id");
UPDATE "api_keys" SET "token" = NULL WHERE "token" IS NOT NULL;
