# Architectural Findings — Validation & Hardening

**Date:** 2026-11-27  
**Environment:** throwaway Postgres `monosip_test` on `127.0.0.1:55433` (Docker `postgres:17-alpine`). **No production DB, no live SIP calls.**  
**Gates:** `pnpm arch:test` → **60** unit · `TEST_DATABASE_URL=… pnpm arch:test:int` → **19** integration.

---

## 1. Dual CDR ingest

### Mevcut davranış
| Path | Entry | Behaviour |
|---|---|---|
| A — Stasis | `cdrStart` / `cdrAnswered` / `cdrEnd` in `lib/cdr.ts` | Always `INSERT` on start; in-memory `open` Map; end `UPDATE`s by `call_id` |
| B — Dialplan | `POST /api/v1/internal/cdr` | If row exists → update/end; else start+end |

Same call often uses **A then B** (inbound/flow redirect → dialplan hangup curl).

### Teknik kanıt
- `cdr.call_id` has **non-unique** index `cdr_call_id_idx` only (`schema.ts` L339–341).
- Double `cdrStart` → **≥2 rows** (int test).
- Parallel triple `cdrStart` → **≥2 rows**.
- Dialplan second POST → **1 row** updated (`updated: true`).
- Stasis start + dialplan finalize → **1 row**, billsec from dialplan.

### Tekrarlanabilir test
- `apps/api/src/architecture/cdr-idempotency.int.test.ts` (9 tests): normal, duplicate start, retry end, concurrency, dialplan create/update, Stasis→dialplan, auth fail, catalog uniqueness.

### Kullanıcı / işletme etkisi
Duplicate CDR rows inflate reports, portal call lists, and spend-limit sums for the same `call_id`. Rare in happy path; more likely under ARI reconnect / double StasisStart.

### Risk
**P1** (data integrity under retry/reconnect). Dialplan path alone is closer to idempotent.

### Önerilen çözüm (onay gerekli)
1. Deduplicate existing `cdr` by `call_id` (keep latest `ended_at` / max billsec).  
2. Add **`UNIQUE (call_id)`** (draft note in `drizzle/0019_arch_hotpath_indexes.sql.draft`).  
3. Change `cdrStart` to upsert / no-op if row exists.  
**Geriye dönük:** unique index fails if duplicates remain — must clean first.

### Regresyon
Int suite above; keep failing “duplicate inserts ≥2” until upsert lands, then flip assertion to `length === 1`.

---

## 2. Pending transfers — restart recovery

### Mevcut davranış
- `pendingTransfers: Map` in `flow-runtime.ts` (process memory).
- Set on extension transfer redirect; consumed on `dial-failed`.
- Missing pending → **hangup** (no resume).
- API/container restart clears Map.

### Teknik kanıt
- Source: `const pendingTransfers = new Map…`; no Redis/DB write.
- `pendingTransferSnapshot` / `clearPendingTransfers` export for tests.
- Existing unit: dial-failed without pending hangs up.

### Tekrarlanabilir test
- `pending-transfers.test.ts` (6): empty after clear, Map contract, hangup-on-miss source lock, dial-status edges.

### Kullanıcı / işletme etkisi
Restart during IVR “ringing transfer” → caller hung up instead of noanswer/busy edge (voicemail/menu). Short window; single-container deploys amplify during rolling restart.

### Risk
**P2** (availability during deploy). Wrong-call binding not observed (keyed by channelId).

### Önerilen çözüm (onay gerekli — davranış değişmez şimdilik)
| Option | Pros | Cons |
|---|---|---|
| A. Accept + document | Zero complexity | Deploy hangups |
| B. Asterisk channel var JSON | Survives API restart if channel lives | Size/encoding limits; must rehydrate flow |
| C. Short-TTL DB row | Durable | Write on every transfer; cleanup job |

**Recommendation:** **A** for current product; consider **B** if zero-drop deploys become a goal. **No persistence implemented.**

### Regresyon
`pending-transfers.test.ts` + existing flow-runtime transfer tests.

---

## 3. Webhook vs DB event ordering (`call.ended`)

### Mevcut davranış
- `call.answered` emitted from `cdrAnswered` **after** DB update.
- `call.ended` emitted from **flow-runtime Stasis handlers**, often **while CDR still open** (inbound redirect / flow return).
- `cdrEnd` does **not** emit `call.ended` → dialplan-only calls get **no** ended webhook.
- `dispatchWebhooks`: 3 retries, 5s timeout; **no** dedup / outbox.

### Teknik kanıt
Int tests:
1. After `call.answered` webhook, `answeredAt` is set.  
2. Simulated Stasis race: webhook received while `endedAt IS NULL` and `cdrIsOpen`.  
3. Duplicate dispatch → **2** deliveries.  
4. Unreachable URL: resolves without throw after retries.  
5. `cdrEnd` alone → **0** `call.ended` deliveries.

### Kullanıcı / işletme etkisi
Integrators querying DB on `call.ended` may see incomplete CDR; dialplan-only legs may never notify `call.ended`.

### Risk
**P2** (integration correctness).

### Önerilen çözüm (onay gerekli)
1. Emit `call.ended` from `cdrEnd` (single source of truth) **or** delay Stasis emit until `!cdrIsOpen`.  
2. Optional transactional outbox later — not required for single-node.  
**Geriye dönük:** integrators may see fewer early “ended” events (more accurate); dialplan path would start receiving ended (new behaviour — document).

### Regresyon
`webhook-ordering.int.test.ts` (5).

---

## 4. Hot-path index audit

### Mevcut davranış / EXPLAIN (55433 lab)

| Query | Plan (evidence) |
|---|---|
| `cdr WHERE call_id = …` | **Index Scan** `cdr_call_id_idx` |
| `recordings WHERE call_id = …` (200 rows) | **Seq Scan** + Filter (199 removed) |
| Join recordings ∈ recent cdr call_ids | **Seq Scan on recordings** + hash semi join |
| `call_events(call_id)` | **No index** in catalog |
| `sessions.token` | Unique index present |

### INSERT/UPDATE cost
Secondary btree on `recordings(call_id)` / `call_events(call_id)`: low write amplification for PBX-scale volumes; high read win on admin CDR list joins.

### Önerilen çözüm
Draft only: `apps/api/drizzle/0019_arch_hotpath_indexes.sql.draft`  
**Not applied.** Awaits approval. Prefer `CREATE INDEX` in numbered migration for small deploys (CONCURRENTLY needs non-txn ops window).

### Regresyon
`hotpath-indexes.int.test.ts` (5) — locks “no recordings(call_id) index today”.

---

## 5. Shared package boundary

### Mevcut davranış
- Web production import of `@monosip/shared`: **only** `TrunksPage.tsx`.
- Web ↛ `apps/api/src`; shared ↛ `apps/*`.

### Tekrarlanabilir test
`shared-boundary.test.ts` (4) — permanent allow-list of the single web import file.

### Risk
**P2** schema drift (UI vs API), not a runtime security hole.

### Önerilen çözüm
When editing a web form, import shared Zod. Do not expand API→web reverse imports.

---

## 6. Test quality matrix

| Finding | Normal | Error/timeout | Retry | Duplicate | Restart | Concurrency |
|---|---|---|---|---|---|---|
| Dual CDR | ✓ | ✓ auth 401 | ✓ 2nd POST | ✓ 2× start | n/a | ✓ parallel start |
| Pending transfer | ✓ empty | ✓ hangup miss | n/a | n/a | ✓ clear=restart | n/a |
| Webhook order | ✓ answered | ✓ unreachable | ✓ 3 attempts | ✓ 2× ended | n/a | n/a |
| Indexes | ✓ EXPLAIN | n/a | n/a | n/a | n/a | n/a |
| Shared boundary | ✓ | n/a | n/a | n/a | n/a | n/a |

Isolated Asterisk call placement: **not run** (per rules). Transfer hangup-on-miss covered by existing mocked ARI unit tests + source contracts.

---

## Unresolved risks (no fix applied)

1. Non-unique `cdr.call_id` → duplicate rows under concurrent Stasis start.  
2. Early `call.ended` vs open CDR; dialplan path silent on ended.  
3. `pendingTransfers` lost on restart.  
4. Missing `recordings(call_id)` / `call_events(call_id)` indexes (draft only).

**Awaiting approval** before upsert/unique, webhook reordering, index migration apply, or transfer persistence.
