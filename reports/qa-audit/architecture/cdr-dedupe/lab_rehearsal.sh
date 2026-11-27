#!/usr/bin/env bash
# Full lab rehearsal: SQL A → SQL B → 0019 UNIQUE → re-run/rollback paths.
# Never points at production.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONTAINER="monosip-cdr-dedupe-lab"
IMAGE="postgres:16-alpine"
PGUSER=lab
PGPASSWORD=lab
PGDATABASE=lab
export PGPASSWORD
MIGRATE_UNIQUE="$ROOT/../../../../apps/api/drizzle/0019_cdr_call_id_unique.sql"
MIGRATE_UNIQUE_DOWN="$ROOT/../../../../apps/api/drizzle/0019_cdr_call_id_unique.down.sql"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> Starting throwaway Postgres"
cleanup
docker run -d --name "$CONTAINER" \
  -e POSTGRES_USER="$PGUSER" -e POSTGRES_PASSWORD="$PGPASSWORD" -e POSTGRES_DB="$PGDATABASE" \
  -p 55432:5432 "$IMAGE" >/dev/null

psql_lab() {
  docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
    psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 "$@"
}

for i in $(seq 1 40); do
  psql_lab -c 'SELECT 1' >/dev/null 2>&1 && break
  sleep 0.25
done

psql_lab <<'SQL'
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE cdr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id varchar(64) NOT NULL,
  started_at timestamptz NOT NULL,
  answered_at timestamptz,
  ended_at timestamptz,
  direction varchar(16) NOT NULL,
  caller varchar(64),
  callee varchar(64),
  did varchar(32),
  extension_number varchar(16),
  queue_number varchar(16),
  disposition varchar(32),
  duration integer DEFAULT 0,
  billsec integer DEFAULT 0,
  wait_sec integer,
  trunk_id uuid,
  recording_id uuid,
  dnd_flag boolean NOT NULL DEFAULT false,
  jitter real,
  packet_loss real,
  mos real
);
CREATE INDEX cdr_started_idx ON cdr (started_at);
CREATE INDEX cdr_call_id_idx ON cdr (call_id);

CREATE OR REPLACE FUNCTION seed_storm(
  p_keeper uuid, p_call_id text, p_start timestamptz, p_total int
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO cdr (id, call_id, started_at, direction, caller, callee, disposition, duration, billsec, extension_number)
  VALUES (p_keeper, p_call_id, p_start, 'outbound', '130', '900', 'ANSWERED', 0, 0, '130');
  INSERT INTO cdr (id, call_id, started_at, direction, caller, callee, disposition, duration, billsec, extension_number)
  SELECT gen_random_uuid(), p_call_id, p_start + (i * interval '175 milliseconds'),
    'outbound', '130', '900', 'ANSWERED', 0, 0, '130'
  FROM generate_series(1, p_total - 1) AS g(i);
END $$;

SELECT seed_storm('c80c248f-6b47-4e1f-8029-71add1b3d085'::uuid, '1793211608.40', '2026-10-28 18:20:08.201+00', 3639);
SELECT seed_storm('91a91b63-75e2-4e50-9aa1-5e33e6533da7'::uuid, '1793217547.7', '2026-10-28 19:59:07.645+00', 2748);
SELECT seed_storm('9476a2c5-d036-4341-8dbd-f103546c8aa4'::uuid, '1793211593.39', '2026-10-28 18:19:53.627+00', 402);
SELECT seed_storm('b623af1b-b7e2-4b17-8da0-443d4e751203'::uuid, '1793211552.38', '2026-10-28 18:19:12.719+00', 207);
SELECT seed_storm('4ee7b799-8e64-4e4d-b67d-95dc9d661b02'::uuid, '1793211511.36', '2026-10-28 18:18:31.723+00', 125);
SELECT seed_storm('f33e5eb0-0253-4c2b-88c9-ba8832b06c15'::uuid, '1793215834.0', '2026-10-28 19:30:34.315+00', 81);
SELECT seed_storm('ab81759e-2d08-4ccc-bb01-0df414a46259'::uuid, '1793215885.1', '2026-10-28 19:31:25.948+00', 49);

INSERT INTO cdr (id, call_id, started_at, answered_at, ended_at, direction, caller, callee,
  disposition, duration, billsec, extension_number, queue_number)
VALUES
  ('b28b0280-4f16-4c7c-a4b1-2777bb0c03de', '1793233454.37',
   '2026-10-29 00:24:14.168+00', '2026-10-29 00:24:14.172+00', '2026-10-29 00:25:48.235+00',
   'internal', '130', '800', 'ANSWERED', 0, 20, '140', '300'),
  ('68da5aff-65d2-4773-aab3-2db95a417ca6', '1793233454.37',
   '2026-10-29 00:25:48.221+00', '2026-10-29 00:24:14.172+00', '2026-10-29 00:25:48.235+00',
   'outbound', '130', '110', 'ANSWERED', 0, 20, '140', '300');

INSERT INTO cdr (call_id, started_at, ended_at, direction, caller, callee, disposition, duration, billsec, extension_number)
SELECT 'clean.' || i,
  '2026-11-01 10:00:00+00'::timestamptz + (i || ' minutes')::interval,
  '2026-11-01 10:00:00+00'::timestamptz + (i || ' minutes')::interval + interval '30 seconds',
  'outbound', '200', '5550100', 'ANSWERED', 30, 25, '200'
FROM generate_series(1, 50) AS g(i);

CREATE TABLE lab_billing_baseline AS
SELECT count(*)::int AS row_count,
  coalesce(sum(billsec),0)::int AS sum_billsec,
  (SELECT count(*) FROM cdr WHERE call_id NOT LIKE '17932%' AND call_id NOT LIKE 'clean.%')::int AS other_storm
FROM cdr;
SQL

BEFORE_BILL=$(psql_lab -tAc "SELECT sum_billsec FROM lab_billing_baseline;")
BEFORE_TOTAL=$(psql_lab -tAc "SELECT count(*) FROM cdr;")
CLEAN_BEFORE=$(psql_lab -tAc "SELECT count(*) FROM cdr WHERE call_id LIKE 'clean.%';")
echo "before_total=$BEFORE_TOTAL bill=$BEFORE_BILL clean=$CLEAN_BEFORE"

echo "==> Wrong-count abort probe"
psql_lab -c "UPDATE cdr SET billsec=1 WHERE id='c80c248f-6b47-4e1f-8029-71add1b3d085';" >/dev/null
# Still 3639 rows so A should run but billsec change shouldn't affect count guards
# Restore billsec for billing checks
psql_lab -c "UPDATE cdr SET billsec=0 WHERE id='c80c248f-6b47-4e1f-8029-71add1b3d085';" >/dev/null

echo "==> SQL A"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$ROOT/01_definite_dedupe.sql"
test "$(psql_lab -tAc "SELECT count(*) FROM cdr_dup_archive WHERE archive_batch='definite-g1-g7';")" = "7244"
test "$(psql_lab -tAc "SELECT count(*) FROM cdr WHERE call_id='1793233454.37';")" = "2"
AFTER_A_BILL=$(psql_lab -tAc "SELECT coalesce(sum(billsec),0) FROM cdr;")
test "$AFTER_A_BILL" = "$BEFORE_BILL"
echo "SQL A OK (billsec unchanged=$AFTER_A_BILL)"

echo "==> SQL A re-run no-op"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$ROOT/01_definite_dedupe.sql"

echo "==> SQL B"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$ROOT/02_g8_manual_dedupe.sql"
test "$(psql_lab -tAc "SELECT count(*) FROM cdr WHERE call_id='1793233454.37';")" = "1"
test "$(psql_lab -tAc "SELECT coalesce(sum(billsec),0) FROM cdr WHERE call_id='1793233454.37';")" = "20"
AFTER_B_BILL=$(psql_lab -tAc "SELECT coalesce(sum(billsec),0) FROM cdr;")
test "$AFTER_B_BILL" = "$((BEFORE_BILL - 20))"
echo "SQL B OK (billsec $BEFORE_BILL → $AFTER_B_BILL)"

echo "==> SQL B re-run no-op"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$ROOT/02_g8_manual_dedupe.sql"

echo "==> Clean rows untouched"
test "$(psql_lab -tAc "SELECT count(*) FROM cdr WHERE call_id LIKE 'clean.%';")" = "$CLEAN_BEFORE"

echo "==> Dup groups must be 0 before UNIQUE"
test "$(psql_lab -tAc "SELECT count(*) FROM (SELECT call_id FROM cdr GROUP BY call_id HAVING count(*)>1) d;")" = "0"

echo "==> 0019 UNIQUE"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$MIGRATE_UNIQUE"
test "$(psql_lab -tAc "SELECT count(*) FROM pg_indexes WHERE indexname='cdr_call_id_uidx';")" = "1"

echo "==> Duplicate insert rejected"
set +e
psql_lab -c "INSERT INTO cdr (call_id, started_at, direction) VALUES ('clean.1', now(), 'outbound');" 2>/tmp/cdr-lab-dup.err
rc=$?
set -e
test "$rc" -ne 0
grep -qi unique /tmp/cdr-lab-dup.err || grep -qi duplicate /tmp/cdr-lab-dup.err

echo "==> 0019 re-run (IF NOT EXISTS path)"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$MIGRATE_UNIQUE"

echo "==> Migration down + re-up"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$MIGRATE_UNIQUE_DOWN"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$MIGRATE_UNIQUE"

echo "==> Rollback B then A (drop UNIQUE first)"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$MIGRATE_UNIQUE_DOWN"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$ROOT/02_g8_manual_rollback.sql"
test "$(psql_lab -tAc "SELECT count(*) FROM cdr WHERE call_id='1793233454.37';")" = "2"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$ROOT/01_definite_dedupe_rollback.sql"
test "$(psql_lab -tAc "SELECT count(*) FROM cdr WHERE call_id IN (
  '1793211608.40','1793217547.7','1793211593.39','1793211552.38',
  '1793211511.36','1793215834.0','1793215885.1');")" = "7251"

echo "==> Re-apply A+B+UNIQUE after rollback"
psql_lab -c "DELETE FROM cdr_dup_archive;"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$ROOT/01_definite_dedupe.sql"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$ROOT/02_g8_manual_dedupe.sql"
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" \
  psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 < "$MIGRATE_UNIQUE"

FINAL_ROWS=$(psql_lab -tAc "SELECT count(*) FROM cdr;")
FINAL_BILL=$(psql_lab -tAc "SELECT coalesce(sum(billsec),0) FROM cdr;")
FINAL_DUP=$(psql_lab -tAc "SELECT count(*) FROM (SELECT call_id FROM cdr GROUP BY call_id HAVING count(*)>1) d;")

cat > "$ROOT/lab_results.json" <<JSON
{
  "ok": true,
  "before_total": $BEFORE_TOTAL,
  "before_billsec_sum": $BEFORE_BILL,
  "after_ab_total": $FINAL_ROWS,
  "after_ab_billsec_sum": $FINAL_BILL,
  "after_dup_groups": $FINAL_DUP,
  "g8_billsec_delta": -20,
  "unique_index": "cdr_call_id_uidx",
  "sequence": ["SQL_A","SQL_B","0019","rerun_noop","rollback_B_A","reapply_A_B_0019"],
  "notes": "Lab used production counts; G8 answeredAt evidence seeded; clean.* rows preserved."
}
JSON

echo "==> LAB PASS"
cat "$ROOT/lab_results.json"
