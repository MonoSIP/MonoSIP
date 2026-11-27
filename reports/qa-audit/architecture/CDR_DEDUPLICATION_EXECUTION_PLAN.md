# CDR Deduplication Execution Plan

**Status:** SUPERSEDED sequencing — see `CDR_FINAL_REMEDIATION.md` + `CDR_PRODUCTION_RUNBOOK.md`  
**Date:** 2026-11-27 (updated after G8 definite + ingest hardening)  
**Sources:** `_cdr_forensics_raw.json`, fix `e6261e5`, migration `0019_cdr_call_id_unique.sql`  
**Constraint:** No production connect/change in this work. Apply only after explicit written approval.

**Canonical apply order:** ingest pause → SQL A → SQL B → 0 dups → 0019 UNIQUE → verify → resume.  
(Do **not** apply 0019 after A alone — G8 would still block UNIQUE.)

---

## Verdict

Definite storm groups G1–G7: SQL A (archive 7244). G8: SQL B with multi-factor evidence (not startedAt-only); logical billsec 20. Lab **PASSED** A→B→0019 including rollback/re-apply.

Financial tables untouched. SQL A: `SUM(billsec)` unchanged. SQL B: −20 double-count.

---

## 1. Keeper manifest

Artifact: `cdr-dedupe/keeper-manifest.json`

### Selection rule (definite)

Keep `MIN(started_at)` per `call_id`. All G1–G7 rows share identical parties, `billsec=0`, `ended_at NULL`. Earliest start = channel birth. Keeper UUIDs taken from forensics earliest sample (verified against group `min_startedAt`).

Discard UUID lists are **not** dumped as 7244 literals (would require a live re-fetch). Each group uses:

`call_id = '<id>' AND id <> '<keeper_uuid>'`

with a hard count guard of **7244** total discards.

| call_id | rows | keeper UUID | discard | startedAt (keeper) | billsec | rationale |
|---------|------|-------------|---------|--------------------|---------|-----------|
| 1793211608.40 | 3639 | `c80c248f-6b47-4e1f-8029-71add1b3d085` | 3638 | 2026-10-28T18:20:08.201Z | 0 | earliest A+C storm |
| 1793217547.7 | 2748 | `91a91b63-75e2-4e50-9aa1-5e33e6533da7` | 2747 | 2026-10-28T19:59:07.645Z | 0 | earliest A+C storm |
| 1793211593.39 | 402 | `9476a2c5-d036-4341-8dbd-f103546c8aa4` | 401 | 2026-10-28T18:19:53.627Z | 0 | earliest A+C storm |
| 1793211552.38 | 207 | `b623af1b-b7e2-4b17-8da0-443d4e751203` | 206 | 2026-10-28T18:19:12.719Z | 0 | earliest A+C storm |
| 1793211511.36 | 125 | `4ee7b799-8e64-4e4d-b67d-95dc9d661b02` | 124 | 2026-10-28T18:18:31.723Z | 0 | earliest A+C storm |
| 1793215834.0 | 81 | `f33e5eb0-0253-4c2b-88c9-ba8832b06c15` | 80 | 2026-10-28T19:30:34.315Z | 0 | earliest A+C storm |
| 1793215885.1 | 49 | `ab81759e-2d08-4ccc-bb01-0df414a46259` | 48 | 2026-10-28T19:31:25.948Z | 0 | earliest A+C storm |
| **Totals** | **7251** | **7 keepers** | **7244** | | | |

### G8 — manual only (not auto-definite)

| field | keeper (proposed) | discard (proposed) |
|-------|-------------------|--------------------|
| UUID | `b28b0280-4f16-4c7c-a4b1-2777bb0c03de` | `68da5aff-65d2-4773-aab3-2db95a417ca6` |
| startedAt | 2026-10-29T00:24:14.168Z | 2026-10-29T00:25:48.221Z |
| direction / callee | internal → 800 | outbound → 110 |
| billsec | 20 | 20 |
| endedAt | 2026-10-29T00:25:48.235Z | 2026-10-29T00:25:48.235Z |

**Rationale:** Same Asterisk UNIQUEID; dual ingest + shared `UPDATE WHERE call_id` paint; discard has `answeredAt < startedAt`. Keeper is evidence-based (see manifest `g8_group`). SQL A leaves G8 untouched; SQL B is step 7 in the canonical sequence.

---

## 2. Billing safety

### Where CDR feeds money-like controls

| Consumer | Logic | Impact of definite dedupe |
|----------|-------|---------------------------|
| `call-policy.ts` daily/monthly spend | `SUM(billsec)` outbound (today / month) | Storm is 2026-10-28, `billsec=0` → **no spend change** |
| `call-policy.ts` per-extension spend | same `SUM(billsec)` | **unchanged** |
| `call-policy.ts` maxOutboundPerHour | `COUNT(*)` outbound last **1 hour** | Storm outside rolling window → **no live rate-limit effect** |
| Admin talk-time reports | `SUM(billsec)` | Storm zeros → **unchanged**; after G8, talk for that call_id drops 40→20 (correct) |
| Invoices / ledger tables | **none found** — no invoice, payment, or billed-amount tables read CDR | **No financial records to rewrite** |

### Guarantees for this plan

- No writes to `spend_limits`, extensions, or any billing config.
- Keeper rows keep their original `billsec` / `duration` / party fields.
- Archive stores full loser rows for restore.
- SQL A expected `SUM(billsec)` delta: **0**.
- SQL B expected `SUM(billsec)` delta: **−20** for call `1793233454.37` only.

Historical Oct 28 outbound call *counts* in any all-time report that uses `COUNT(*)` (not billsec) will drop by 7244 — that is the intended correction of the storm, not a invoice mutation.

---

## 3. SQL preparation

Directory: `reports/qa-audit/architecture/cdr-dedupe/`

| File | Purpose |
|------|---------|
| `01_definite_dedupe.sql` | **SQL A** — G1–G7 only |
| `01_definite_dedupe_rollback.sql` | Restore 7244 archived losers |
| `02_g8_manual_dedupe.sql` | **SQL B** — G8 only, separate approval |
| `02_g8_manual_rollback.sql` | Restore G8 discard |
| `keeper-manifest.json` | Machine-readable keepers |
| `lab_rehearsal.sh` | Anonymized throwaway Postgres rehearsal |
| `lab_results.json` | Last lab pass artifact |

### Safety properties (both A and B)

1. Wrapped in `BEGIN` / `COMMIT`; any `RAISE EXCEPTION` → full `ROLLBACK`.
2. Preflight group sizes must match forensics **or** already-deduped size 1 (re-run → no-op).
3. Partial states abort (no half-dedupe).
4. Keeper UUIDs must still exist before delete.
5. Exact discard count enforced (A: 7244, B: 1).
6. Archive before delete into `cdr_dup_archive` with `archive_batch`.
7. Re-run after success: no-op (does not double-archive).
8. G8 never included in A.

### Suggested production apply order (after approval)

**Canonical list:** `cdr-dedupe/OPERATOR_APPLY_SEQUENCE.md` (and `CDR_PRODUCTION_RUNBOOK.md`).

```text
1. Deploy idempotent CDR build
2. Backup confirmation
3. REQUIRED: pause CDR ingest (all instances)
4. Preflight SELECT counts (must match forensics)
5. psql -f 01_definite_dedupe.sql
6. Verify: 7 keepers, archive 7244, G8 still 2, SUM(billsec) unchanged
7. psql -f 02_g8_manual_dedupe.sql
8. Verify: 0 duplicate call_id groups
9. psql -f apps/api/drizzle/0019_cdr_call_id_unique.sql  (NOT full db:migrate — avoids 0020)
10. Post-verify + resume ingest
```

**Do not** run migration 0019 until duplicates are gone — it deliberately fails if any remain.

---

## 4. Lab rehearsal results

Command: `cdr-dedupe/lab_rehearsal.sh`  
Environment: throwaway `postgres:16-alpine` container; production never contacted.

| Check | Result |
|-------|--------|
| Pre counts | 7303 rows, 8 dup groups, `SUM(billsec)=1290` |
| SQL A archive/delete | 7244 / 7244 |
| Keepers present | 7/7 forensics UUIDs |
| G8 after A | still 2 |
| Billing after A | `SUM(billsec)=1290` (unchanged) |
| Re-run A | no-op |
| Rollback A | restored 7251 across G1–G7 |
| Re-apply A | OK |
| SQL B | G8 → 1 row, keeper `billsec=20` |
| Billing after B | 1290 → 1270 (−20) |
| Rollback B + re-apply | OK |
| UNIQUE(`call_id`) | created; 0 dup groups |
| Final rows | 58 (7 keepers + 1 G8 + 50 clean) |

`lab_results.json`: `"ok": true`.

---

## 5. Rollback procedure

### Definite batch

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f \
  reports/qa-audit/architecture/cdr-dedupe/01_definite_dedupe_rollback.sql
```

Restores 7244 rows from `cdr_dup_archive` where `archive_batch='definite-g1-g7'`. Aborts if archive count ≠ 7244 or IDs already live. If UNIQUE index already applied, **drop UNIQUE first** or rollback will fail on `call_id` conflict — preferred order is: rollback dedupe **before** migration, or drop `cdr_call_id_uidx` then restore then re-dedupe.

### G8 batch

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f \
  reports/qa-audit/architecture/cdr-dedupe/02_g8_manual_rollback.sql
```

Same UNIQUE caveat.

### Nuclear

Restore from the pre-window Postgres backup/snapshot. Archive table is an additional safety net, not a substitute for backup.

---

## 6. Production preflight checklist (read-only before apply)

Run only when apply is approved; values must match:

```sql
SELECT call_id, count(*) FROM cdr
WHERE call_id IN (
  '1793211608.40','1793217547.7','1793211593.39','1793211552.38',
  '1793211511.36','1793215834.0','1793215885.1','1793233454.37'
) GROUP BY 1 ORDER BY 2 DESC;

SELECT count(*) FROM cdr c
WHERE c.call_id IN (
  '1793211608.40','1793217547.7','1793211593.39','1793211552.38',
  '1793211511.36','1793215834.0','1793215885.1'
) AND c.id NOT IN (
  'c80c248f-6b47-4e1f-8029-71add1b3d085',
  '91a91b63-75e2-4e50-9aa1-5e33e6533da7',
  '9476a2c5-d036-4341-8dbd-f103546c8aa4',
  'b623af1b-b7e2-4b17-8da0-443d4e751203',
  '4ee7b799-8e64-4e4d-b67d-95dc9d661b02',
  'f33e5eb0-0253-4c2b-88c9-ba8832b06c15',
  'ab81759e-2d08-4ccc-bb01-0df414a46259'
);
-- expect 7244

SELECT coalesce(sum(billsec),0) FROM cdr;  -- record baseline
```

If any keeper UUID is missing or counts diverge, **stop** and re-forensics.

---

## 7. Explicit approval gate

**Not done (and not to be done without your OK):**

- Connect to production for apply
- Run SQL A or B on production
- Apply migration 0019
- Commit / push / deploy

**Waiting for:** single explicit operator approval to run the canonical sequence in `cdr-dedupe/OPERATOR_APPLY_SEQUENCE.md` (A → B → 0019).

---

## Artifacts index

```
reports/qa-audit/architecture/
  CDR_DEDUPLICATION_EXECUTION_PLAN.md    ← this file
  _cdr_forensics_raw.json                ← forensics source
  cdr-dedupe/
    keeper-manifest.json
    01_definite_dedupe.sql
    01_definite_dedupe_rollback.sql
    02_g8_manual_dedupe.sql
    02_g8_manual_rollback.sql
    lab_rehearsal.sh
    lab_results.json
```
