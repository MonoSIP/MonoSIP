# CDR Production Runbook — Controlled Dedupe + UNIQUE

**Status:** READY FOR CONTROLLED PRODUCTION EXECUTION (after explicit operator approval)  
**This document does not authorize production apply by itself.**

**Tek sıralı operatör listesi:** `cdr-dedupe/OPERATOR_APPLY_SEQUENCE.md`  
**Güvenlik / ingest / DB erişim checklist:** `cdr-dedupe/OPERATOR_PREFLIGHT_CHECKLIST.md`  
Çelişkide **OPERATOR_APPLY_SEQUENCE.md** esas alınır.

## Exact order (mirrors SEQUENCE #1–14)

1. Deploy API build with idempotent `cdrStart` / single-row `cdrEnd`.
2. Verify backup restore point.
3. **Pause CDR ingest** on all API instances, ARI, Stasis, dialplan writers, and retries (checklist §3 — not COUNT-only).
4. Confirm zero writers (`cdr-integrity` + `pg_stat_activity` + ≥2 min no new `cdr` rows). TLS-validating HTTPS only (**no `curl -k` / `-sk`**).
5. Preflight: `cdr-dedupe/00_lock_and_preflight.sql` — **SELECT-only** (file does **not** take a lock). Counts must match forensics.
6. Record baseline `SUM(billsec)`.
7. **SQL A** — `01_definite_dedupe.sql` (G1–G7, archive 7244).
8. Verify A: 7 keepers, G8 still 2, `SUM(billsec)` unchanged vs baseline.
9. **SQL B** — `02_g8_manual_dedupe.sql` (G8, archive 1, SUM for call 40→20).
10. Verify B: **0** duplicate `call_id` groups.
11. **UNIQUE enforce** — `cdr-dedupe/03_enforce_unique.sql` via `psql -f` (hard fail if dups remain). Auto-migrate `0019` is soft-defer and must not be relied on for this step.
12. Post checks: `CDR_POST_MIGRATION_VERIFICATION.md`.
13. Resume ingest.
14. (Separate window) Migration **0020** if indexes missing — independent of CDR dedupe.

## DB access

Use a **temporary, minimum-privilege** role and vault-managed secrets. Revoke/rotate after the window. Do not paste production URLs with passwords into logs or chat.

## Ingest pause (required)

Do **not** run DELETE while ingest is live. Full verification matrix: `OPERATOR_PREFLIGHT_CHECKLIST.md` §3.2 (API, ARI, Stasis, dialplan, retries, DB activity, ≥2 min insert freeze).

Optional DB supplement (typed by operator; **not** executed by `00_lock_and_preflight.sql`):

```sql
BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE cdr IN SHARE ROW EXCLUSIVE MODE;
```

`SHARE ROW EXCLUSIVE`: blocks INSERT/UPDATE/DELETE on `cdr`; allows SELECT. Released on COMMIT/ROLLBACK/disconnect. Prefer ingest pause as primary control.

## Preflight must match

| call_id | count |
|---------|------:|
| 1793211608.40 | 3639 |
| 1793217547.7 | 2748 |
| 1793211593.39 | 402 |
| 1793211552.38 | 207 |
| 1793211511.36 | 125 |
| 1793215834.0 | 81 |
| 1793215885.1 | 49 |
| 1793233454.37 | 2 |
| definite discard candidates | **7244** |

Any mismatch → **STOP** (re-forensics).

## Commands (operator)

```bash
# After SEQUENCE #1–6 OK:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f reports/qa-audit/architecture/cdr-dedupe/01_definite_dedupe.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f reports/qa-audit/architecture/cdr-dedupe/02_g8_manual_dedupe.sql

# Hard UNIQUE after A+B (auto-migrate 0019 soft-defers while dups exist).
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f reports/qa-audit/architecture/cdr-dedupe/03_enforce_unique.sql
```

Monitoring after resume (TLS validating):

```bash
curl --fail-with-body "https://<prod>/api/v1/health"
# admin auth required:
curl --fail-with-body -H "Cookie: …" "https://<prod>/api/v1/admin/cdr-integrity"
```

See also: `CDR_ROLLBACK_RUNBOOK.md`, `CDR_POST_MIGRATION_VERIFICATION.md`.
