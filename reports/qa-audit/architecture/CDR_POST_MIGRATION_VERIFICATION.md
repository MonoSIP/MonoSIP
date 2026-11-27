# CDR Post-Migration Verification

Run after SQL A + SQL B + 0019 on production (operator).

## SQL checks

```sql
-- 0 duplicate groups
SELECT call_id, count(*) FROM cdr GROUP BY 1 HAVING count(*) > 1;
-- expect 0 rows

-- NULL call_id (should be impossible: column NOT NULL)
SELECT count(*) AS null_call_id FROM cdr WHERE call_id IS NULL;
-- expect 0

-- Totals
SELECT count(*) AS cdr_total,
       coalesce(sum(billsec),0) AS sum_billsec,
       count(*) FILTER (WHERE ended_at IS NULL) AS open_cdr
FROM cdr;

-- UNIQUE present
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename='cdr' AND indexname='cdr_call_id_uidx';
-- expect UNIQUE index

-- Keepers present
SELECT id, call_id, billsec FROM cdr WHERE id IN (
  'c80c248f-6b47-4e1f-8029-71add1b3d085',
  '91a91b63-75e2-4e50-9aa1-5e33e6533da7',
  '9476a2c5-d036-4341-8dbd-f103546c8aa4',
  'b623af1b-b7e2-4b17-8da0-443d4e751203',
  '4ee7b799-8e64-4e4d-b67d-95dc9d661b02',
  'f33e5eb0-0253-4c2b-88c9-ba8832b06c15',
  'ab81759e-2d08-4ccc-bb01-0df414a46259',
  'b28b0280-4f16-4c7c-a4b1-2777bb0c03de'
);
-- expect 8 rows; G8 billsec=20

SELECT coalesce(sum(billsec),0) FROM cdr WHERE call_id='1793233454.37';
-- expect 20

SELECT archive_batch, count(*) FROM cdr_dup_archive GROUP BY 1;
-- definite-g1-g7=7244, g8-manual=1

-- Long-open CDRs
SELECT count(*) FROM cdr
WHERE ended_at IS NULL AND started_at < now() - interval '2 hours';
```

## App / monitoring checks

1. `GET /api/v1/health` (TLS-validating client only — **no `curl -k`/`-sk`**) → `cdr` object with process counters:
   - `startOk`, `startExisting` (idempotent no-op / retry)
   - `startErrors`, `startRaceRecovered`
   - `endFinalized`, `endNoopFinished`, `endEnriched`, `endErrors`
   - `answeredOk`, `answeredNoop`
   - `endedWebhookEmitted`, `endedWebhookDeduped`
   - `openCount` (in-memory open CDRs)
2. `GET /api/v1/admin/cdr-integrity` → `duplicateCallIdGroups: 0`, `ok: true`, `openOlderThan2h`, same `metrics`.
3. Admin CDR list returns; talk-time aggregates sane.
4. **Lab/non-customer** call after ingest resume → one CDR row; Stasis retry does not double.
5. Raw second INSERT same `call_id` rejected by Postgres.

### Available vs not instrumented

| Check | Source |
|-------|--------|
| Duplicate call_id groups | integrity + SQL |
| NULL call_id | SQL (expect 0) |
| CDR total / SUM(billsec) / open rows | SQL |
| Open >2h | integrity `openOlderThan2h` |
| Idempotency no-ops | health `startExisting`, `endNoopFinished` |
| Ingest / end errors | health `startErrors`, `endErrors` |
| Webhook emit / dedupe | health `endedWebhookEmitted`, `endedWebhookDeduped` |
| Last CDR ingest timestamp | **not a dedicated metric** — use `SELECT max(started_at) FROM cdr` |
| Advisory lock wait time histogram | **not instrumented** — locks are transactional; failures surface as `startErrors` / `endErrors` |
| Webhook delivery HTTP failures | process logs `[webhook] failed …` (not a counter) |

Alarm thresholds (integrity endpoint):

| Metric | Warn | Critical |
|--------|------|----------|
| duplicateCallIdGroups | ≥1 | ≥1 |
| openOlderThan2h | ≥20 | ≥100 |
| endErrors (process counter) | ≥5 | ≥50 |
