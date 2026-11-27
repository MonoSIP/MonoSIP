-- Rollback for 0019_cdr_call_id_unique (manual ops only).
-- Restores the previous non-unique lookup index.
DROP INDEX IF EXISTS "cdr_call_id_uidx";
CREATE INDEX IF NOT EXISTS "cdr_call_id_idx" ON "cdr" ("call_id");
