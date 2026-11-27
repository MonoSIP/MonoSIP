-- =============================================================================
-- MonoSIP CDR definite-group dedupe (G1–G7 only). G8 EXCLUDED.
-- DO NOT RUN ON PRODUCTION without explicit written approval.
-- Lab-proven; transaction-guarded; archives before delete; re-run safe.
-- Expected archive/delete: 7244 rows. Keepers: 7.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cdr_dup_archive (
  LIKE cdr INCLUDING DEFAULTS
);
ALTER TABLE cdr_dup_archive ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE cdr_dup_archive ADD COLUMN IF NOT EXISTS archive_batch text NOT NULL DEFAULT 'definite-g1-g7';

CREATE TEMP TABLE _cdr_definite_plan ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM cdr WHERE call_id = '1793211608.40') AS g1,
  (SELECT count(*) FROM cdr WHERE call_id = '1793217547.7') AS g2,
  (SELECT count(*) FROM cdr WHERE call_id = '1793211593.39') AS g3,
  (SELECT count(*) FROM cdr WHERE call_id = '1793211552.38') AS g4,
  (SELECT count(*) FROM cdr WHERE call_id = '1793211511.36') AS g5,
  (SELECT count(*) FROM cdr WHERE call_id = '1793215834.0') AS g6,
  (SELECT count(*) FROM cdr WHERE call_id = '1793215885.1') AS g7,
  (SELECT count(*) FROM cdr_dup_archive WHERE archive_batch = 'definite-g1-g7') AS already_archived;

DO $$
DECLARE
  p record;
  action text;
  targets int;
BEGIN
  SELECT * INTO p FROM _cdr_definite_plan;

  IF p.g1 NOT IN (1, 3639) OR p.g2 NOT IN (1, 2748) OR p.g3 NOT IN (1, 402)
     OR p.g4 NOT IN (1, 207) OR p.g5 NOT IN (1, 125) OR p.g6 NOT IN (1, 81)
     OR p.g7 NOT IN (1, 49) THEN
    RAISE EXCEPTION
      'partial/unexpected definite counts g1=% g2=% g3=% g4=% g5=% g6=% g7=% — ROLLBACK',
      p.g1, p.g2, p.g3, p.g4, p.g5, p.g6, p.g7;
  END IF;

  IF p.g1+p.g2+p.g3+p.g4+p.g5+p.g6+p.g7 = 7 THEN
    action := 'noop';
  ELSIF p.g1=3639 AND p.g2=2748 AND p.g3=402 AND p.g4=207
        AND p.g5=125 AND p.g6=81 AND p.g7=49 THEN
    action := 'run';
  ELSE
    RAISE EXCEPTION 'unreachable definite state — ROLLBACK';
  END IF;

  IF action = 'noop' THEN
    RAISE NOTICE 'definite groups already deduped — no-op';
    CREATE TEMP TABLE _cdr_definite_action ON COMMIT DROP AS SELECT 'noop'::text AS action;
    RETURN;
  END IF;

  IF p.already_archived > 0 THEN
    RAISE EXCEPTION 'archive_batch definite-g1-g7 already has % rows — abort', p.already_archived;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cdr WHERE id = 'c80c248f-6b47-4e1f-8029-71add1b3d085') THEN
    RAISE EXCEPTION 'G1 keeper missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cdr WHERE id = '91a91b63-75e2-4e50-9aa1-5e33e6533da7') THEN
    RAISE EXCEPTION 'G2 keeper missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cdr WHERE id = '9476a2c5-d036-4341-8dbd-f103546c8aa4') THEN
    RAISE EXCEPTION 'G3 keeper missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cdr WHERE id = 'b623af1b-b7e2-4b17-8da0-443d4e751203') THEN
    RAISE EXCEPTION 'G4 keeper missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cdr WHERE id = '4ee7b799-8e64-4e4d-b67d-95dc9d661b02') THEN
    RAISE EXCEPTION 'G5 keeper missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cdr WHERE id = 'f33e5eb0-0253-4c2b-88c9-ba8832b06c15') THEN
    RAISE EXCEPTION 'G6 keeper missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cdr WHERE id = 'ab81759e-2d08-4ccc-bb01-0df414a46259') THEN
    RAISE EXCEPTION 'G7 keeper missing';
  END IF;

  SELECT count(*) INTO targets FROM cdr c
  WHERE c.call_id IN (
      '1793211608.40','1793217547.7','1793211593.39','1793211552.38',
      '1793211511.36','1793215834.0','1793215885.1'
    )
    AND c.id NOT IN (
      'c80c248f-6b47-4e1f-8029-71add1b3d085',
      '91a91b63-75e2-4e50-9aa1-5e33e6533da7',
      '9476a2c5-d036-4341-8dbd-f103546c8aa4',
      'b623af1b-b7e2-4b17-8da0-443d4e751203',
      '4ee7b799-8e64-4e4d-b67d-95dc9d661b02',
      'f33e5eb0-0253-4c2b-88c9-ba8832b06c15',
      'ab81759e-2d08-4ccc-bb01-0df414a46259'
    );

  IF targets <> 7244 THEN
    RAISE EXCEPTION 'expected 7244 discard rows, found % — ROLLBACK', targets;
  END IF;

  CREATE TEMP TABLE _cdr_definite_action ON COMMIT DROP AS SELECT 'run'::text AS action;
END $$;

-- Mutating steps are no-ops when action=noop (0-row INSERT/DELETE).
INSERT INTO cdr_dup_archive
SELECT c.*, now(), 'definite-g1-g7'
FROM cdr c
WHERE (SELECT action FROM _cdr_definite_action) = 'run'
  AND c.call_id IN (
    '1793211608.40','1793217547.7','1793211593.39','1793211552.38',
    '1793211511.36','1793215834.0','1793215885.1'
  )
  AND c.id NOT IN (
    'c80c248f-6b47-4e1f-8029-71add1b3d085',
    '91a91b63-75e2-4e50-9aa1-5e33e6533da7',
    '9476a2c5-d036-4341-8dbd-f103546c8aa4',
    'b623af1b-b7e2-4b17-8da0-443d4e751203',
    '4ee7b799-8e64-4e4d-b67d-95dc9d661b02',
    'f33e5eb0-0253-4c2b-88c9-ba8832b06c15',
    'ab81759e-2d08-4ccc-bb01-0df414a46259'
  );

DO $$
DECLARE n int; act text;
BEGIN
  SELECT action INTO act FROM _cdr_definite_action;
  IF act = 'run' THEN
    SELECT count(*) INTO n FROM cdr_dup_archive WHERE archive_batch = 'definite-g1-g7';
    IF n <> 7244 THEN
      RAISE EXCEPTION 'archived % rows, expected 7244 — ROLLBACK', n;
    END IF;
  END IF;
END $$;

DELETE FROM cdr c
WHERE (SELECT action FROM _cdr_definite_action) = 'run'
  AND c.call_id IN (
    '1793211608.40','1793217547.7','1793211593.39','1793211552.38',
    '1793211511.36','1793215834.0','1793215885.1'
  )
  AND c.id NOT IN (
    'c80c248f-6b47-4e1f-8029-71add1b3d085',
    '91a91b63-75e2-4e50-9aa1-5e33e6533da7',
    '9476a2c5-d036-4341-8dbd-f103546c8aa4',
    'b623af1b-b7e2-4b17-8da0-443d4e751203',
    '4ee7b799-8e64-4e4d-b67d-95dc9d661b02',
    'f33e5eb0-0253-4c2b-88c9-ba8832b06c15',
    'ab81759e-2d08-4ccc-bb01-0df414a46259'
  );

DO $$
DECLARE n int; g8 int;
BEGIN
  SELECT count(*) INTO n FROM cdr
  WHERE call_id IN (
      '1793211608.40','1793217547.7','1793211593.39','1793211552.38',
      '1793211511.36','1793215834.0','1793215885.1'
    );
  IF n <> 7 THEN
    RAISE EXCEPTION 'after delete expected 7 keepers, found %', n;
  END IF;

  -- G8 must not be touched by this script (0 = absent lab, 2 = still duplicate)
  SELECT count(*) INTO g8 FROM cdr WHERE call_id = '1793233454.37';
  IF g8 NOT IN (0, 1, 2) THEN
    RAISE EXCEPTION 'G8 unexpected count=%', g8;
  END IF;
END $$;

COMMIT;
