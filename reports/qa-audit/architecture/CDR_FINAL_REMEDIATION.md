# CDR Final Remediation — Closed Package

**Date:** 2026-11-27  
**Authority sequence:** `cdr-dedupe/OPERATOR_APPLY_SEQUENCE.md`  
**Ops checklist:** `cdr-dedupe/OPERATOR_PREFLIGHT_CHECKLIST.md`  
**Access handoff:** `cdr-dedupe/OPERATOR_ACCESS_HANDOFF.md`  
**Status:** **READY FOR CONTROLLED PRODUCTION EXECUTION**  
**Code / registry:** shipped on `main` (image publish green). See `AUDIT_CLOSEOUT.md`.

Production DB not touched. Production execution blocked until `OPERATOR_ACCESS_HANDOFF.md` is satisfied and the operator runs `OPERATOR_APPLY_SEQUENCE.md`.

---

## Verdict

| Statement | Applicable? |
|-----------|-------------|
| **READY FOR CONTROLLED PRODUCTION EXECUTION** | **YES** — code, SQL, lab, docs, tests aligned; human approval still required to apply |
| BLOCKED — ACTION REQUIRED | No (package consistency PASS; tests PASS) |
| PRODUCTION EXECUTION VERIFIED | **No** — production was not executed |

---

## 1. Repository

### Changed / added (CDR integrity scope)

| Path | Why |
|------|-----|
| `apps/api/src/lib/cdr.ts` | Idempotent start; PK-scoped answer/end; finished billsec no-op; `call.ended` after commit; metrics |
| `apps/api/src/asterisk/flow-runtime.ts` | No premature `call.ended` while CDR open |
| `apps/api/src/routes/admin-resources.ts` | Internal CDR via `cdrEnd`; health `cdr`; `GET /api/v1/admin/cdr-integrity` |
| `apps/api/src/db/schema.ts` | `UNIQUE(call_id)` in model |
| `apps/api/drizzle/0019_cdr_call_id_unique.sql` (+ `.down.sql`) | UNIQUE after A+B |
| `apps/api/drizzle/0020_hotpath_call_id_indexes.sql` (+ `.down.sql`) | Separate hot-path indexes |
| `apps/api/drizzle/meta/_journal.json` | 0019 + 0020 entries |
| `apps/api/src/architecture/*` | Arch / idempotency / webhook / hotpath tests |
| `reports/qa-audit/architecture/cdr-dedupe/*` | SQL A/B, rollbacks, preflight, manifest, lab, **OPERATOR_APPLY_SEQUENCE.md** |
| Runbooks / verification MD files | Single ops sequence; rollback; post-verify |

### Consistency (this close-out)

Cross-check of sequence ↔ manifest ↔ SQL A/B ↔ rollbacks ↔ 0019 ↔ runbooks ↔ post-verify: **PASS**  
(UUID keepers, 7244 / 7251 / G8 40→20, archive batches `definite-g1-g7` / `g8-manual`, rollback order UNIQUE↓ → B → A.)

Doc-only fix in this close-out: expanded `CDR_POST_MIGRATION_VERIFICATION.md` checklist (null call_id, totals, honest metric coverage).

---

## 2. Tests (re-run 2026-11-27 close-out)

Throwaway Postgres / lab docker — **not production**.

| Suite | Result |
|-------|--------|
| `pnpm arch:test` | **60 passed** |
| `pnpm arch:test:int` | **27 passed** (cdr-idempotency 16, webhook 6, hotpath 5) |
| `cdr-dedupe/lab_rehearsal.sh` | **PASS** — A→B→0019, re-run no-op, rollback B then A, re-apply; billsec 1290→1270; dup groups 0 |
| GitHub Actions CI on `main` | **PASS** (check + integration) |
| GHCR image publish | **PASS** |

Covered: parallel `cdrStart`, repeated `cdrEnd`, UNIQUE reject, webhook-after-commit, SQL A/B+rollback lab, hot-path catalog indexes.

**Not run:** live production SQL A/B; real PSTN call on prod.

---

## 3. Production readiness

### Human approval still required for

1. Deploy of idempotent CDR API build  
2. Maintenance window: backup + ingest pause  
3. Running SQL A / SQL B / `psql -f 0019_…sql`  
4. Ingest resume  
5. Separate window for 0020  

### Hard stop conditions (any → halt)

- Backup not restore-verified  
- Ingest still writing on any instance  
- Preflight ≠ forensics (`discard≠7244` or `G8≠2`)  
- Keeper UUID missing  
- SQL A/B ERROR / count guard fail  
- Any duplicate `call_id` before 0019  
- Using `db:migrate` in this window (would also apply 0020)  

### Monitoring present

- `GET /api/v1/health` → `cdr` counters  
- `GET /api/v1/admin/cdr-integrity` → dup groups + long-open + metrics  

Not instrumented as first-class counters: advisory-lock wait histogram; webhook HTTP failure counter (log-only); dedicated “last ingest timestamp” field (use SQL `max(started_at)`).

### 0020

Separate maintenance only. Do not bundle with 0019. Prefer `psql -f 0020_…` or later migrate after 0019 already applied via this window’s `psql -f`.

---

## 4. Production execution

**Production CDR dedupe not executed.**

Remediating code is on `main` / GHCR. No production SQL A/B, archive, delete, ingest pause/resume, or prod `0019` apply was performed in audit work.

---

## Canonical apply order (operator)

See **`cdr-dedupe/OPERATOR_APPLY_SEQUENCE.md`** — sole authority.

1. Idempotent CDR API deploy  
2. Backup verify  
3. Pause ingest (all instances)  
4. Confirm no writes + integrity  
5. `00_lock_and_preflight.sql`  
6. Expect discard=7244, G8=2  
7. Record baseline `SUM(billsec)`  
8. SQL A `01_definite_dedupe.sql`  
9. Verify: 7 keepers, G8=2, billsec unchanged  
10. SQL B `02_g8_manual_dedupe.sql`  
11. Verify: 0 dups, G8 billsec=20  
12. `psql -f apps/api/drizzle/0019_cdr_call_id_unique.sql`  
13. `CDR_POST_MIGRATION_VERIFICATION.md`  
14. Resume ingest  
15. 0020 in a **separate** window  

**Rollback:** 0019 down → SQL B rollback → SQL A rollback → expect G1–G7=7251, G8=2.

---

## Package file list

```
reports/qa-audit/architecture/cdr-dedupe/OPERATOR_APPLY_SEQUENCE.md
reports/qa-audit/architecture/cdr-dedupe/keeper-manifest.json
reports/qa-audit/architecture/cdr-dedupe/00_lock_and_preflight.sql
reports/qa-audit/architecture/cdr-dedupe/01_definite_dedupe.sql
reports/qa-audit/architecture/cdr-dedupe/01_definite_dedupe_rollback.sql
reports/qa-audit/architecture/cdr-dedupe/02_g8_manual_dedupe.sql
reports/qa-audit/architecture/cdr-dedupe/02_g8_manual_rollback.sql
reports/qa-audit/architecture/cdr-dedupe/lab_rehearsal.sh
reports/qa-audit/architecture/cdr-dedupe/lab_results.json
apps/api/drizzle/0019_cdr_call_id_unique.sql
apps/api/drizzle/0019_cdr_call_id_unique.down.sql
apps/api/drizzle/0020_hotpath_call_id_indexes.sql
apps/api/drizzle/0020_hotpath_call_id_indexes.down.sql
reports/qa-audit/architecture/CDR_PRODUCTION_RUNBOOK.md
reports/qa-audit/architecture/CDR_ROLLBACK_RUNBOOK.md
reports/qa-audit/architecture/CDR_POST_MIGRATION_VERIFICATION.md
reports/qa-audit/architecture/CDR_FINAL_REMEDIATION.md
```
