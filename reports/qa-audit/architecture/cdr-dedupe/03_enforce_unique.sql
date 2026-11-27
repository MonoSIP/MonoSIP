-- Hard enforce UNIQUE(call_id) after SQL A + SQL B leave zero duplicate groups.
-- Prefer this for the production maintenance window (clear failure if dups remain).
-- Equivalent outcome to a clean-DB apply of apps/api/drizzle/0019_cdr_call_id_unique.sql.
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
      'cdr has % duplicate call_id group(s); resolve with SQL A/B before UNIQUE(call_id)',
      dup_groups;
  END IF;
END $$;

DROP INDEX IF EXISTS "cdr_call_id_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "cdr_call_id_uidx" ON "cdr" ("call_id");
