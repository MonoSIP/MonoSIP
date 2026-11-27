# Production CDR Migration Preflight — `0019_cdr_call_id_unique`

**Date:** 2026-11-27  
**Target:** `https://sip.dgn.tr` (MonoSIP **1.9.9**, company DGN Teknoloji)  
**Migration under review:** `apps/api/drizzle/0019_cdr_call_id_unique.sql`  
**Action taken:** **NONE** — no DDL, no DML, no migration apply.

---

## Access method (important)

| Path | Result |
|---|---|
| Direct `psql` / SSH to `10.6.6.9` | **Unavailable** (publickey denied) |
| Embedded Postgres inside prod container | Not reachable from this workstation |
| Read-only **Admin HTTP API** | Used (`/api/v1/admin/cdr` paginated + export) |

Requested SQL semantics were reproduced via the admin CDR API (`total` from SQL `count(*)`, full table walk at `pageSize≤200`). Index/table-size catalog queries **could not** be executed on prod Postgres; those sections use schema/migration analysis + known image defaults.

---

## 1. Duplicate check

**Equivalent to:**
```sql
SELECT call_id, COUNT(*) FROM cdr GROUP BY call_id HAVING COUNT(*) > 1;
```

**Result (full walk: 7504/7504 rows):**

| Metric | Value |
|---|---:|
| Total CDR rows | **7504** |
| Distinct `call_id` | **259** |
| Duplicate groups (`count > 1`) | **8** |
| Rows belonging to those groups | **7253** |
| Excess rows vs unique call_id | **7245** |

**Top duplicate groups:**

| call_id | count |
|---|---:|
| `1793211608.40` | 3639 |
| `1793217547.7` | 2748 |
| `1793211593.39` | 402 |
| `1793211552.38` | 207 |
| `1793211511.36` | 125 |
| `1793215834.0` | 81 |
| `1793215885.1` | 49 |
| `1793233454.37` | 2 |

Evidence: distinct primary keys per duplicate (e.g. `1793217547.7` → many UUIDs, `startedAt` ~1–2 ms apart, `billsec=0`) — classic parallel/retry `cdrStart` storm **before** Phase 1 hardening.

**Migration impact:** The migration’s `DO $$ … RAISE EXCEPTION` **will fire**. Even without that guard, `CREATE UNIQUE INDEX … (call_id)` would fail with unique violation.

---

## 2. NULL check

**Equivalent to:**
```sql
SELECT COUNT(*) FROM cdr WHERE call_id IS NULL;
```

**Result:** **0** (API walk: `null_or_empty_call_id = 0`).

Schema also declares `call_id varchar(64) NOT NULL` — consistent.

---

## 3. Constraint / index expectations

| Item | Expected on prod (from schema / image) | Observed via API |
|---|---|---|
| `cdr.call_id` type | `varchar(64)` | Values look like Asterisk UNIQUEID (`digits.digits`), max len 13 in sample |
| Nullable | **NOT NULL** | No nulls in 7504 rows |
| Current lookup index | Likely non-unique `cdr_call_id_idx` (pre-0019) | Not queryable without catalog access |
| Migration creates | `UNIQUE INDEX cdr_call_id_uidx ON cdr (call_id)` | Name collision: only if already applied — **not** on 1.9.9 until migrate |
| Migration drops | `cdr_call_id_idx` | Safe if present; `IF EXISTS` |

**Name/definition clash:** Low risk of colliding with an existing *unique* index of the same name unless 0019 was already applied (updates API shows app **1.9.9**; unique hardening is still working-tree / not released as applied migration on this host’s prior deploys unless someone migrated manually). Duplicates prove unique index is **absent** today.

---

## 4. Data volume

| Metric | Value | Source |
|---|---|---|
| Row count | **7504** | `GET /api/v1/admin/cdr?page=1&pageSize=5` → `total` |
| Logical calls if deduped | **~259** | Distinct call_id |
| Table size / indexes bytes | **Unknown** | Requires `pg_total_relation_size` |
| Estimated UNIQUE index build | Sub-second–few seconds at 7.5k rows on PG17 | Small table |

At this size, lock duration for a non-concurrent `CREATE UNIQUE INDEX` would normally be short — **but the build cannot succeed until duplicates are gone**.

---

## 5. Migration safety (DDL behaviour)

Migration body (simplified):

1. `DO $$` duplicate guard → **EXCEPTION** if dups  
2. `DROP INDEX IF EXISTS cdr_call_id_idx`  
3. `CREATE UNIQUE INDEX cdr_call_id_uidx ON cdr (call_id)`

| Topic | Assessment |
|---|---|
| PostgreSQL version | Prod image line is PG **17.x** (all-in-one MonoSIP); confirms SHARE lock semantics for `CREATE INDEX` |
| Transaction / Drizzle | Drizzle migrator runs statements in a transaction; `CREATE INDEX` (non-`CONCURRENTLY`) is OK in a txn on PG17 |
| `CREATE INDEX CONCURRENTLY` | **Not** used (correct — cannot run in a transaction) |
| Failure / rollback | Guard fails first → later DDL not applied; txn aborts → **no partial unique index**. If drop index ran then unique create failed, non-unique index could be gone until rolled back — **guard ordering prevents that** while dups exist |
| CDR ingest during migrate | Brief lock on `cdr` for index build; with current dups migrate **aborts before build**. After dedupe, expect short ingest delay only |
| App code vs DB | New `cdrStart` idempotency reduces *new* dups after deploy of that code; **existing** 7k+ bad rows remain until manual cleanup |

---

## 6. Decision

# **BLOCKED**

### Technical rationale

1. Production has **8 duplicate `call_id` groups** and **7245 excess rows**.  
2. `0019_cdr_call_id_unique.sql` is designed to **abort** in that state (no silent delete/merge).  
3. Applying now would yield a failed migrate (or unique-index error if guard removed) — **not** a successful UNIQUE constraint.  
4. Direct catalog/size SQL was unavailable; duplicate evidence alone is sufficient to block.

### What must happen before PROCEED

1. **Manual dedupe plan** (operator-approved), e.g. keep one row per `call_id` (prefer non-null `endedAt`, else max `billsec`, else latest `startedAt`) — **do not auto-run without approval**.  
2. Re-run:
   ```sql
   SELECT call_id, COUNT(*) FROM cdr GROUP BY call_id HAVING COUNT(*) > 1;
   ```
   → **0 rows**.  
3. Re-run NULL check → still 0.  
4. Apply `0019` in maintenance window; keep `0019_cdr_call_id_unique.down.sql` ready.  
5. Confirm app build with idempotent `cdrStart` is deployed **before or with** migrate so dups cannot immediately recur.

### Suggested operator SQL (read-only inventory on host)

```sql
SELECT call_id, COUNT(*) AS n
FROM cdr GROUP BY call_id HAVING COUNT(*) > 1
ORDER BY n DESC;

SELECT COUNT(*) FROM cdr WHERE call_id IS NULL;

SELECT COUNT(*) AS total_rows FROM cdr;

SELECT pg_size_pretty(pg_total_relation_size('cdr')) AS cdr_total_size;

SELECT indexname, indexdef
FROM pg_indexes WHERE tablename = 'cdr' AND indexdef ILIKE '%call_id%';

SELECT version();
```

---

## Residual gaps in this preflight

| Gap | Why |
|---|---|
| Exact `pg_indexes` / `pg_total_relation_size` | No SSH/psql to prod |
| Live lock timing measurement | Not measured (migrate not run) |

These do **not** change the **BLOCKED** decision.
