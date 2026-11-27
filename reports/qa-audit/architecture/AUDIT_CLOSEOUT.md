# Architecture / CDR audit close-out

**Date:** 2026-11-27  
**Scope:** Architectural validation + CDR idempotency / hot-path indexes / dedupe package  
**Production DB / SSH:** not used (operator window still gated)

---

## Verdict

| Layer | Status |
|-------|--------|
| Code (idempotent CDR, UNIQUE schema, 0020 indexes, health/integrity probes) | **SHIPPED** on `main` (GHCR `:main` / `:latest` publish green) |
| Lab package (SQL A → B → 0019, rollback/re-apply) | **PASS** (re-run 2026-11-27) |
| Architecture regression suite | **PASS** — `arch:test` 60 · `arch:test:int` 27 |
| CI | **PASS** on current `main` |
| Production storm dedupe (SQL A/B) + first `0019` on prod volume | **NOT EXECUTED** — needs operator handoff + explicit apply |

Audit engineering work is **closed**. Remaining work is **ops execution**, not discovery.

---

## Re-verification evidence (this close-out)

| Check | Result |
|-------|--------|
| `pnpm arch:test` | 60 passed |
| `TEST_DATABASE_URL=… pnpm arch:test:int` | 27 passed (cdr-idempotency 16, webhook 6, hotpath 5) |
| `cdr-dedupe/lab_rehearsal.sh` | **LAB PASS** — see `lab_results.json` |
| Lab constants | before 7303 / billsec 1290 → after A+B 58 / 1270; dup groups 0; G8 Δ −20; index `cdr_call_id_uidx` |

---

## What shipped in tree (vs earlier “working tree / draft” notes)

| Item | Location |
|------|----------|
| Idempotent `cdrStart` / PK `cdrEnd` / post-commit `call.ended` | `apps/api/src/lib/cdr.ts`, flow-runtime |
| `UNIQUE(call_id)` | `0019_cdr_call_id_unique.sql` + `schema.ts` |
| Hot-path indexes | `0020_hotpath_call_id_indexes.sql` + `schema.ts` |
| Integrity probe | `GET /api/v1/admin/cdr-integrity` + health `cdr` metrics |
| Operator sequence | `cdr-dedupe/OPERATOR_APPLY_SEQUENCE.md` |

Compose/lab migrate applies 0019+0020 together. Production storm cleanup must still use the operator sequence (`psql -f` 0019 alone after A+B; 0020 in a separate window).

---

## Still open (operator-only)

1. **Deploy remediating image** to `sip.dgn.tr` (NineDeploy / orchestrator).  
   **Incident 2026-11-27 ~23:30+03:** hard `0019` UNIQUE on boot killed migrate while 8 dup groups remained → container never listened → **502 Bad Gateway** on `/api/v1/health`. Fixed by soft-defer `0019` + manual `03_enforce_unique.sql` after SQL A/B. Redeploy this build to restore health.  

2. Fill remaining `OPERATOR_ACCESS_HANDOFF.md` items (DB role / `psql`, backup restore proof, ingest stop/start).  
3. Maintenance window: backup → ingest pause → SQL preflight → SQL A → SQL B → `0019` → post-verify → resume.  
4. Later window: `0020` (or migrate once 0019 already present).  

### Live preflight reconfirm (Admin API, no SQL)

`cdr-dedupe/prod_preflight_refresh.json` — **MATCH** vs forensics constants (7504 rows, 8 groups, discard 7244, G8 billsec 40). Safe to proceed once remediating build is live and backup/ingest controls are in place.

Do **not** treat local Compose or this audit close-out as production execution verified.

---

## Doc hygiene in this close-out

Stale “draft only / awaiting approval / working-tree unreleased” claims updated in:

- `VALIDATION_HARDENING.md`
- `CDR_FINAL_REMEDIATION.md`
- `CDR_PRODUCTION_FORENSICS.md`
- `CDR_IDEMPOTENCY_HARDENING.md`
- `ARCHITECTURAL_ACCEPTANCE.md`
- Prior refresh: `DATABASE_INTEGRITY.md`, `ARCHITECTURAL_VIOLATIONS.md`

Canonical ops docs remain: `OPERATOR_APPLY_SEQUENCE.md`, `CDR_PRODUCTION_RUNBOOK.md`, `CDR_POST_MIGRATION_VERIFICATION.md`.
