-- =============================================================================
-- MonoSIP CDR G8 definite remediation — call_id 1793233454.37
-- Keeper: b28b0280-4f16-4c7c-a4b1-2777bb0c03de (channel birth; answeredAt >= startedAt)
-- Discard: 68da5aff-65d2-4773-aab3-2db95a417ca6 (late re-insert; answeredAt < startedAt;
--           party fields conflict; billsec painted by shared UPDATE-by-call_id)
-- Logical billsec once = 20. SUM drops 40 → 20.
-- Independent of SQL A. Separate archive_batch. Re-run safe no-op.
-- DO NOT RUN ON PRODUCTION without explicit written approval for G8.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cdr_dup_archive (
  LIKE cdr INCLUDING DEFAULTS
);
ALTER TABLE cdr_dup_archive ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE cdr_dup_archive ADD COLUMN IF NOT EXISTS archive_batch text NOT NULL DEFAULT 'g8-manual';

CREATE TEMP TABLE _cdr_g8_plan ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM cdr WHERE call_id = '1793233454.37') AS n,
  (SELECT count(*) FROM cdr WHERE id = 'b28b0280-4f16-4c7c-a4b1-2777bb0c03de'
      AND call_id = '1793233454.37'
      AND billsec = 20
      AND answered_at IS NOT NULL
      AND answered_at >= started_at) AS keeper_ok,
  (SELECT count(*) FROM cdr WHERE id = '68da5aff-65d2-4773-aab3-2db95a417ca6'
      AND call_id = '1793233454.37'
      AND billsec = 20) AS discard_ok,
  (SELECT coalesce(sum(billsec),0) FROM cdr WHERE call_id = '1793233454.37') AS sum_bill,
  (SELECT count(*) FROM cdr_dup_archive WHERE archive_batch = 'g8-manual') AS already_archived;

DO $$
DECLARE p record;
BEGIN
  SELECT * INTO p FROM _cdr_g8_plan;

  IF p.n = 1 AND p.keeper_ok = 1 THEN
    RAISE NOTICE 'G8 already deduped — no-op';
    CREATE TEMP TABLE _cdr_g8_action ON COMMIT DROP AS SELECT 'noop'::text AS action;
    RETURN;
  END IF;

  IF p.n <> 2 THEN
    RAISE EXCEPTION 'G8 expected 2 rows, found % — ROLLBACK', p.n;
  END IF;
  IF p.keeper_ok <> 1 THEN
    RAISE EXCEPTION 'G8 keeper missing or evidence mismatch (answeredAt/billsec)';
  END IF;
  IF p.discard_ok <> 1 THEN
    RAISE EXCEPTION 'G8 discard missing or billsec mismatch';
  END IF;
  IF p.sum_bill <> 40 THEN
    RAISE EXCEPTION 'G8 expected SUM(billsec)=40 before dedupe, found % — ROLLBACK', p.sum_bill;
  END IF;
  IF p.already_archived > 0 THEN
    RAISE EXCEPTION 'archive_batch g8-manual already has % rows — abort', p.already_archived;
  END IF;

  CREATE TEMP TABLE _cdr_g8_action ON COMMIT DROP AS SELECT 'run'::text AS action;
END $$;

INSERT INTO cdr_dup_archive
SELECT c.*, now(), 'g8-manual'
FROM cdr c
WHERE (SELECT action FROM _cdr_g8_action) = 'run'
  AND c.id = '68da5aff-65d2-4773-aab3-2db95a417ca6';

DO $$
DECLARE n int; act text;
BEGIN
  SELECT action INTO act FROM _cdr_g8_action;
  IF act = 'run' THEN
    SELECT count(*) INTO n FROM cdr_dup_archive WHERE archive_batch = 'g8-manual';
    IF n <> 1 THEN
      RAISE EXCEPTION 'G8 archived %, expected 1 — ROLLBACK', n;
    END IF;
  END IF;
END $$;

DELETE FROM cdr
WHERE (SELECT action FROM _cdr_g8_action) = 'run'
  AND id = '68da5aff-65d2-4773-aab3-2db95a417ca6';

DO $$
DECLARE n int; bill int; sum_b int;
BEGIN
  SELECT count(*) INTO n FROM cdr WHERE call_id = '1793233454.37';
  IF n <> 1 THEN
    RAISE EXCEPTION 'G8 after delete expected 1 row, found %', n;
  END IF;
  SELECT billsec INTO bill FROM cdr
  WHERE id = 'b28b0280-4f16-4c7c-a4b1-2777bb0c03de';
  IF bill IS DISTINCT FROM 20 THEN
    RAISE EXCEPTION 'G8 keeper billsec changed unexpectedly: %', bill;
  END IF;
  SELECT coalesce(sum(billsec),0) INTO sum_b FROM cdr WHERE call_id = '1793233454.37';
  IF sum_b <> 20 THEN
    RAISE EXCEPTION 'G8 logical SUM(billsec) expected 20, found %', sum_b;
  END IF;
END $$;

COMMIT;
