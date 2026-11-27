# CDR Final Production Review (updated)

**Date:** 2026-11-27 (remediation complete)  
**Prior decision:** APPROVED FOR HUMAN REVIEW (SQL A only)  
**Current decision:** superseded by **READY FOR CONTROLLED PRODUCTION EXECUTION** in `CDR_FINAL_REMEDIATION.md`

## What changed since the prior review

| Gap in prior review | Remediation |
|---------------------|-------------|
| G8 blocked 0019 after SQL A alone | SQL B definite with evidence; lab A→B→0019 PASS |
| Premature `call.ended` while CDR open | Removed from flow-runtime; emit after `cdrEnd` commit |
| `cdrEnd` UPDATE-by-call_id multi-row paint | Update by primary key + finished billsec guard |
| Concurrent ingest during DELETE | Runbook requires ingest pause + optional `SHARE ROW EXCLUSIVE` |
| Hot-path draft mixed with UNIQUE | Separate `0020_hotpath_call_id_indexes` |

## SQL A checklist (unchanged PASS)

Still valid: G1–G7 only, 7244 archive, keepers match manifest, transaction guards, re-run no-op, rollback batch-scoped. Lab re-confirmed.

## SQL B checklist (new PASS)

Keeper `b28b0280-…`, discard `68da5aff-…`, SUM 40→20, evidence guards in SQL, archive `g8-manual`, re-run no-op. Lab PASS.

## Migration 0019

Apply **only** when `GROUP BY call_id HAVING count(*)>1` is empty (after A+B).

## Production

**Storm SQL A/B + prod `0019` not applied.** Remediation code is on `main` / GHCR.  
See `CDR_PRODUCTION_RUNBOOK.md` + `AUDIT_CLOSEOUT.md`. Explicit operator approval still required for the maintenance window.
