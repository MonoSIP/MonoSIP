CREATE TABLE IF NOT EXISTS "tts_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cache_key" varchar(40) NOT NULL,
  "text" text NOT NULL,
  "language" varchar(8) DEFAULT 'en' NOT NULL,
  "voice" varchar(40) DEFAULT 'female' NOT NULL,
  "length_scale" varchar(16) DEFAULT '1.05' NOT NULL,
  "file_path" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "tts_cache_cache_key_unique" UNIQUE("cache_key")
);
