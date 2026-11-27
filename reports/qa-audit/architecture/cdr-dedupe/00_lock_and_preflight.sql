-- =============================================================================
-- Production preflight BEFORE SQL A/B.
--
-- WHAT THIS FILE EXECUTES: read-only SELECT statements only.
-- It does NOT run LOCK TABLE, BEGIN, or any DDL/DML.
--
-- Filename is historical ("lock_and_preflight"). Optional lock below is
-- documentation only — operator must type it separately if desired.
--
-- Recommended pattern:
--   1) Pause CDR ingest on ALL instances (see OPERATOR_PREFLIGHT_CHECKLIST.md §3)
--   2) psql -f this file (SELECTs) — expect discard=7244, G8=2, dup_groups=8
--   3) psql -f 01_definite_dedupe.sql then 02_g8_manual_dedupe.sql
--
-- Optional HARD LOCK (NOT run by this file; same ops session if you choose):
--   BEGIN;
--   SET LOCAL lock_timeout = '15s';
--   LOCK TABLE cdr IN SHARE ROW EXCLUSIVE MODE;
--   -- SHARE ROW EXCLUSIVE: blocks INSERT/UPDATE/DELETE on cdr; allows SELECT.
--   -- Held until COMMIT/ROLLBACK/disconnect. Contends with cdrStart/cdrEnd.
--   -- lock_timeout: lock wait fails → no lock acquired. Always set timeout.
--   -- Note: 01/02 scripts use their own BEGIN/COMMIT, so holding one outer
--   -- lock across them requires a carefully designed single-session wrap;
--   -- prefer ingest pause (§3) as the primary safety control.
-- =============================================================================

-- Read-only preflight SELECTs
SELECT call_id, count(*) AS n
FROM cdr
WHERE call_id IN (
  '1793211608.40','1793217547.7','1793211593.39','1793211552.38',
  '1793211511.36','1793215834.0','1793215885.1','1793233454.37'
)
GROUP BY 1
ORDER BY 2 DESC;

SELECT count(*) AS definite_discard_candidates
FROM cdr
WHERE call_id IN (
  '1793211608.40','1793217547.7','1793211593.39','1793211552.38',
  '1793211511.36','1793215834.0','1793215885.1'
) AND id NOT IN (
  'c80c248f-6b47-4e1f-8029-71add1b3d085',
  '91a91b63-75e2-4e50-9aa1-5e33e6533da7',
  '9476a2c5-d036-4341-8dbd-f103546c8aa4',
  'b623af1b-b7e2-4b17-8da0-443d4e751203',
  '4ee7b799-8e64-4e4d-b67d-95dc9d661b02',
  'f33e5eb0-0253-4c2b-88c9-ba8832b06c15',
  'ab81759e-2d08-4ccc-bb01-0df414a46259'
);
-- expect 7244

SELECT coalesce(sum(billsec),0) AS sum_billsec_all FROM cdr;

SELECT id, call_id, billsec, started_at, answered_at, ended_at, direction, callee
FROM cdr
WHERE call_id = '1793233454.37'
ORDER BY started_at;
-- expect 2 rows; SUM billsec 40

SELECT count(*) AS dup_groups
FROM (SELECT call_id FROM cdr GROUP BY call_id HAVING count(*) > 1) d;
-- expect 8 before A+B; 0 after A+B
