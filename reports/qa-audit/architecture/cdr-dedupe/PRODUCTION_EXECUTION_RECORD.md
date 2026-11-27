# Production CDR dedupe — execution record

**Host:** `sip.dgn.tr` (NineDeploy node `10.4.4.250`, service `monosip-352`)  
**When:** 2026-11-27 ~20:56–21:00 UTC  
**Authority:** `OPERATOR_APPLY_SEQUENCE.md`  
**Result:** **PRODUCTION EXECUTION VERIFIED**

---

## Steps performed

1. Remediating image already live (`ghcr.io/monosip/monosip:main`, soft-defer `0019`).  
2. Backup: `pg_dump -Fc` + CDR data-only SQL under `/root/monosip-cdr-ops/backups/` (`cdr-pre-dedupe-20261127T205630Z.*`).  
3. Ingest pause: `docker update --restart=no` + `docker stop monosip-352`.  
4. Ops Postgres: `postgres:17-alpine` on volume `nd-svc-monosip-data` (`PGDATA=/data/postgres`).  
5. Preflight `00_lock_and_preflight.sql` — MATCH (discard 7244, G8=2, dup groups 8).  
6. SQL A `01_definite_dedupe.sql` — archive/delete **7244**, billsec unchanged **4539**.  
7. SQL B `02_g8_manual_dedupe.sql` — archive/delete **1**, G8 billsec **40→20**.  
8. UNIQUE `03_enforce_unique.sql` — `cdr_call_id_uidx` created.  
9. Resume: stop ops PG, `docker update --restart=unless-stopped` + `docker start monosip-352`.  

---

## Post-verify

| Check | Value |
|-------|------:|
| `cdr` rows | **259** |
| Distinct `call_id` | **259** |
| `SUM(billsec)` | **4519** (−20 vs 4539) |
| Dup groups | **0** |
| Archive rows | **7245** (7244 + 1) |
| Index | `cdr_call_id_uidx` (+ `0020` call_id indexes present) |
| `GET /api/v1/health` | **200** `ok/db/asterisk/dialplan` + `cdr` |
| `GET /api/v1/admin/cdr-integrity` | **200** `ok:true` `duplicateCallIdGroups:0` |

Residual: `openOlderThan2h=14` (below warn=20) — unfinished historical opens, not storm dups.

---

## Rollback assets

- Dump: `/root/monosip-cdr-ops/backups/cdr-pre-dedupe-20261127T205630Z.dump`  
- Scripts: `/root/monosip-cdr-ops/{01,02}_*_rollback.sql` + `0019` down in image/repo  
