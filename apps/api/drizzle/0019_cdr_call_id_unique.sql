-- Idempotent CDR: UNIQUE(call_id) when the table is clean.
--
-- Boot / `db:migrate` must NOT take the API down on production storm data.
-- If duplicate call_id groups still exist, this migration succeeds as a no-op
-- (NOTICE only) and leaves the non-unique cdr_call_id_idx in place.
-- After SQL A + SQL B clear duplicates, re-run this file with `psql -f`
-- (or apply once on a clean DB) to create cdr_call_id_uidx.
DO $$
DECLARE
  dup_groups integer;
BEGIN
  SELECT count(*)::int INTO dup_groups
  FROM (
    SELECT call_id FROM cdr GROUP BY call_id HAVING count(*) > 1
  ) d;

  IF dup_groups > 0 THEN
    RAISE NOTICE
      'cdr has % duplicate call_id group(s); deferring UNIQUE(call_id) until SQL A/B — API boot continues',
      dup_groups;
    RETURN;
  END IF;

  EXECUTE 'DROP INDEX IF EXISTS "cdr_call_id_idx"';
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "cdr_call_id_uidx" ON "cdr" ("call_id")';
END $$;
