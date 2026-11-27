# Production CDR Data Forensics

**Date:** 2026-11-27  
**Host:** `https://sip.dgn.tr` (MonoSIP **1.9.9**)  
**Access:** read-only Admin CDR API (full 7504-row walk). **No DELETE/UPDATE/merge. No migration. No deploy.**  
**Raw extract:** `reports/qa-audit/architecture/_cdr_forensics_raw.json`

**Update:** Remediation package complete (`CDR_FINAL_REMEDIATION.md`). G8 is now **definite** (evidence-based keeper). Migration `0019` is ready **after** SQL A + SQL B on production (operator-approved). Forensics snapshot itself was not re-fetched.

---

## Executive counts

| Population | Rows | Distinct call_id |
|---|---:|---:|
| All CDR | 7504 | 259 |
| Rows in duplicate groups | 7253 | 8 |
| Singleton call_ids (1 row) | 251 | 251 |

| Classification | Rows | Notes |
|---|---:|---|
| **A — same-call copies (definite)** | **7244** | Excess rows in 7 outbound storms (keep 1 each) |
| **A/C — copies that are also unfinished** | *(same 7244)* | All storm rows have `endedAt=NULL` |
| **A — probable dual-ingest copy** | **1** | Excess in 2-row group `1793233454.37` |
| **D — valid single-call rows** | **251** | Singleton call_ids |
| **D — keepers from dup groups** | **8** | One retained row per group (proposed) |
| **B — different calls sharing call_id** | **0** | No evidence of colliding UNIQUEIDs across real calls |
| **E — unclassified** | **0** | All groups classified with evidence |

**After a correct dedupe:** ≈ **259** logical CDR rows remain (251 + 8).

---

## 1. Duplicate group analysis

`call_id` values match Asterisk **UNIQUEID** shape (`<unix_epoch>.<seq>`). No separate channel column in CDR schema; UNIQUEID **is** the channel identity MonoSIP stores.

### Group G1 — `1793211608.40` (largest)

| Field | Value |
|---|---|
| COUNT | **3639** |
| UNIQUEID ≈ | 2026-10-28T18:20:08Z |
| MIN/MAX startedAt | 18:20:08.201Z → 18:30:48.722Z (**640.5 s**) |
| endedAt | **all NULL** (3639) |
| Unique PKs | 3639 |
| Insert cadence | median **175 ms**, p95 **186 ms** (~5.7 inserts/s) |
| billsec / duration | all **0** |
| trunkId | all null |
| direction / parties | **outbound** `130` → `900` (100%) |
| disposition | ANSWERED (100%) |
| answeredAt | **identical** `18:30:48.727Z` on all rows (bulk `UPDATE … WHERE call_id`) |

**Class:** **A** (same call copies) + **C** (never finalized).  
**Keeper proposal:** earliest `startedAt` row (or any one — all billsec 0); archive/delete the other 3638.

### Group G2 — `1793217547.7`

| Field | Value |
|---|---|
| COUNT | **2748** |
| UNIQUEID ≈ | 2026-10-28T19:59:07Z |
| startedAt span | 19:59:07.645Z → 20:07:03.354Z (**475.7 s**) |
| endedAt | all NULL |
| cadence | median **172 ms** |
| parties | outbound `130`→`900` only |
| billsec | all 0 |

**Class:** **A+C**. Keep 1, remove 2747.

### Group G3 — `1793211593.39`

| COUNT | 402 | span | 69.96 s | cadence ~173 ms |
| parties | outbound 130→900 | endedAt | all NULL | billsec all 0 |

**Class:** **A+C**. Keep 1, remove 401.

### Group G4 — `1793211552.38`

| COUNT | 207 | span | 34.96 s | cadence ~169 ms |
| parties | outbound 130→900 | endedAt | all NULL | billsec all 0 |

**Class:** **A+C**. Keep 1, remove 206.

### Group G5 — `1793211511.36`

| COUNT | 125 | span | 21.34 s | cadence ~170 ms |
| parties | outbound 130→900 | endedAt | all NULL | billsec all 0 |

**Class:** **A+C**. Keep 1, remove 124.

### Group G6 — `1793215834.0`

| COUNT | 81 | span | 13.60 s | cadence ~170 ms |
| parties | outbound 130→900 | endedAt | all NULL | billsec all 0 |

**Class:** **A+C**. Keep 1, remove 80.

### Group G7 — `1793215885.1`

| COUNT | 49 | span | 8.13 s | cadence ~169 ms |
| parties | outbound 130→900 | endedAt | all NULL | billsec all 0 |

**Class:** **A+C**. Keep 1, remove 48.

### Group G8 — `1793233454.37` (special)

| Field | Value |
|---|---|
| COUNT | **2** |
| UNIQUEID ≈ | 2026-10-29T00:24:14Z (**after** loop fix) |
| startedAt | 00:24:14.168Z and 00:25:48.221Z (**94 s** apart) |
| endedAt | both set `00:25:48.235Z` |
| billsec | both **20** |
| Party signatures | **2**: `internal 130→800` and `outbound 130→110` |
| extension/queue | both rows show ext `140`, queue `300` |

**Class:** **A (probable)** — same Asterisk UNIQUEID cannot be two real calls; dual `cdrStart` + later bulk updates produced conflicting party fields. **Not B** (B would require two independent calls wrongly keyed; UNIQUEID forbids that).  
**Keeper:** prefer row with richer final context (queue `300` / billsec 20 / endedAt set) — either PK is fine if billsec matches; recommend the **earlier** start (`internal` row) as canonical start, noting party fields were overwritten by later ingest noise.  
**Remove:** 1 row.

---

## 2. Classification rules applied

| Code | Meaning | Decision rule used (not call_id alone) |
|---|---|---|
| **A** | Same-call copies | Same UNIQUEID + identical party signature + sub-second insert cadence **or** dual start with shared end/answered timestamps |
| **B** | Different calls, same call_id | Would need incompatible UNIQUEID semantics — **not observed** |
| **C** | Half-open CDR | `endedAt IS NULL` (storm rows all C as well as A) |
| **D** | Valid distinct calls | Singleton call_id |
| **E** | Unclassified | Reserved — unused |

---

## 3. Historical CDR production mechanism

### What `call_id` always was

From v1.0.0 (`be69a3a`) through HEAD:

- Stasis: `cdrStart({ callId: channelId })` — ARI channel id (= Asterisk UNIQUEID for that channel)
- Dialplan: JSON `"callId":"${UNIQUEID}"` → `/api/v1/internal/cdr`

**One channel → one UNIQUEID → one logical CDR** was always the intent. UI/API already `limit(1)` by `call_id`.

### `cdrStart` idempotency

| Era | Behaviour |
|---|---|
| v1.0.0 … **released HEAD (1.9.9)** | Unconditional `INSERT` — no exist-check, no unique index |
| **Working tree (unreleased)** | Advisory lock + exist-check + migration `UNIQUE(call_id)` |

Git history for `apps/api/src/lib/cdr.ts` shows the insert-always body since the initial release; Phase 1 hardening is **not in a tagged release yet**.

### Why parallel / loop events created thousands of rows

**Root cause (storms G1–G7):** commit **`e6261e5`** (2026-10-28 23:16 +0300 / **20:16 UTC**) fixed:

> unknown short number → `from-internal` `_X.` catch-all → **re-enters `monosip-outbound`** → `cdrStart` again → loop

**Before the fix**, any 3–4 digit dial was blindly redirected:

```ts
await cdrAnswered(channelId);
await ari.redirect(channelId, dialed, "from-internal");
```

If `900` was not a concrete extension/queue/RG/flow (or dialplan bounced back into Stasis), StasisStart fired repeatedly. Each entry called `cdrStart` → new UUID row, same `call_id`.

**Evidence alignment:**

| Fact | Fits loop theory |
|---|---|
| All G1–G7 on **2026-10-28**, ending ≤ 20:07 UTC | Before fix 20:16 UTC |
| Callee always **900**, caller **130**, outbound | Same dial attempt |
| ~**170 ms** between inserts | Tight Stasis re-entry, not 5s ARI poll |
| `endedAt` never set | Channel never cleanly finalized via `cdrEnd` |
| Shared `answeredAt` at storm end | One `cdrAnswered`/`UPDATE` by `call_id` painted all copies |

**After the fix:** only **2** duplicate rows remain (G8) — consistent with rare dual `cdrStart` without UNIQUE, not a sustained loop.

### When was the problem fixed?

| Layer | Status on production today |
|---|---|
| Stasis short-number loop (`e6261e5`) | **Fixed** in tree since 2026-10-28; present in 1.9.9 |
| `cdrStart` idempotency + `UNIQUE(call_id)` | **Not applied** on prod DB; code hardening is local working tree |

### Version window of bad rows

| Day (UTC) | Rows | Note |
|---|---:|---|
| 2026-10-28 | **7303** | Almost all storm garbage |
| 2026-10-29 | 27 | Includes G8 (2) |
| Other days | 174 | Mostly clean singletons |

Production app is now **1.9.9** (2026-11-27); storm data is **historical Oct 28**.

---

## 4. Dedupe plan (proposal only — not executed)

### Global strategy

1. For each duplicate `call_id`, **keep one** row.  
2. Prefer: `endedAt IS NOT NULL`, then max `billsec`, then **min `startedAt`**.  
3. For G1–G7 all-null-ended / zero-billsec: keep **min(startedAt)**.  
4. Move losers to an archive table **or** delete after backup — **operator approval required**.  
5. Re-check `GROUP BY call_id HAVING count(*)>1` → 0.  
6. Then apply `0019_cdr_call_id_unique`.

### Per-group recommendations

| Group | Keep | Discard | Billing impact | API/report impact | Rollback |
|---|---|---:|---|---|---|
| G1 `…08.40` | 1 (earliest) | 3638 | None (billsec 0; inflate counts only) | Reports `total`/`answered` drop sharply toward truth | Restore from pre-dedupe backup / archive |
| G2 `…47.7` | 1 | 2747 | None | Same | Same |
| G3 `…93.39` | 1 | 401 | None | Same | Same |
| G4 `…52.38` | 1 | 206 | None | Same | Same |
| G5 `…11.36` | 1 | 124 | None | Same | Same |
| G6 `…34.0` | 1 | 80 | None | Same | Same |
| G7 `…85.1` | 1 | 48 | None | Same | Same |
| G8 `…54.37` | 1 (earlier start) | 1 | billsec 20 counted twice today → keep once | Call detail/party fields may need manual note | Same |

**Suggested archive DDL (not run):**

```sql
CREATE TABLE cdr_dup_archive (LIKE cdr INCLUDING ALL);
-- then INSERT…SELECT losers; DELETE losers;  -- only after approval
```

**Billing:** storm rows have `billsec=0` → removing them **does not** reduce talk-time totals; it **fixes** inflated call counts / “answered” SLA artifacts (`avgDuration: 1` in summary is a symptom).

---

## 5. Data model verdict — is `UNIQUE(call_id)` valid?

**Yes**, for MonoSIP’s model:

1. Production `call_id` values are Asterisk UNIQUEID strings.  
2. Storms prove many rows per UNIQUEID were **bug copies**, not multi-leg accounting.  
3. G8’s conflicting party fields still share one UNIQUEID — dual writers, not two calls.  
4. Dialplan and Stasis both key the same UNIQUEID by design.  
5. Application queries already assume one row per `call_id`.

**Not valid only if** product later stores B-leg/peer UNIQUEIDs as separate billable CDRs under a reused key — it does not today.

---

## 6. Conditions still missing for safe migration

| Condition | Status |
|---|---|
| Duplicate groups = 0 | **FAIL** (8 groups) |
| Idempotent `cdrStart` deployed to prod | **FAIL** (unreleased working-tree fix) |
| `UNIQUE` migration applied | **FAIL** (blocked) |
| Backup / archive before delete | **Not done** |
| Operator-approved dedupe script | **Pending** |
| Post-dedupe verification query | **Pending** |

---

## Summary answers

| Question | Answer |
|---|---|
| Kaç kayıt **kesin** duplicate? | **7244** (excess in G1–G7) |
| Kaç kayıt **muhtemel** duplicate? | **1** (excess in G8) |
| Kaç kayıt **geçerli** olabilir? | **259** logical calls (251 singletons + 8 keepers) |
| Kaç kayıt sınıflandırılamıyor? | **0** |
| Migration için eksik koşullar? | Dedupe + verify 0 dups + deploy idempotent `cdrStart` + then `0019` |

**Decision remains: BLOCKED** until the dedupe is approved and executed under a maintenance plan.
