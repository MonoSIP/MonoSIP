ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "extension_number" varchar(16);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "flows_extension_number_unique" ON "flows" ("extension_number") WHERE "extension_number" IS NOT NULL;
