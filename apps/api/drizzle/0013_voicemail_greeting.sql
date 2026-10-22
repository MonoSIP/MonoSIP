ALTER TABLE "extensions" ADD COLUMN IF NOT EXISTS "voicemail_greeting" text;
ALTER TABLE "extensions" ADD COLUMN IF NOT EXISTS "voicemail_greeting_voice" varchar(40) DEFAULT 'female' NOT NULL;
ALTER TABLE "extensions" ADD COLUMN IF NOT EXISTS "voicemail_greeting_lang" varchar(8) DEFAULT 'tr' NOT NULL;
