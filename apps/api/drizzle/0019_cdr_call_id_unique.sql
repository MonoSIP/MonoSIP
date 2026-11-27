-- Idempotent CDR: one row per Asterisk UNIQUEID / ARI channel id.
-- Does NOT delete or merge duplicates — fails if any exist so ops can inspect.
DO $$
DECLARE
  dup_groups integer;
BEGIN
  SELECT count(*)::int INTO dup_groups
  FROM (
    SELECT call_id FROM cdr GROUP BY call_id HAVING count(*) > 1
  ) d;
  IF dup_groups > 0 THEN
    RAISE EXCEPTION
      'cdr has % duplicate call_id group(s); resolve manually before UNIQUE(call_id)',
      dup_groups;
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "cdr_call_id_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cdr_call_id_uidx" ON "cdr" ("call_id");
