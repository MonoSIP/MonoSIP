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

### Teknik kanıt (pre-hardening baseline)
- Was: non-unique `cdr_call_id_idx`; double/parallel `cdrStart` could create ≥2 rows.
- Dialplan second POST already updated a single row; Stasis→dialplan finalize was 1 row.

### Shipped fix (2026-11-27+)
- `UNIQUE cdr_call_id_uidx` via `0019_cdr_call_id_unique.sql` + `schema.ts`.
- `cdrStart` advisory-locked + exist-check; finished `cdrEnd` retries no-op.
- Int suite asserts parallel/retry → exactly 1 row; raw 2nd INSERT → `23505`.

### Tekrarlanabilir test
- `apps/api/src/architecture/cdr-idempotency.int.test.ts`: normal, duplicate start, retry end, concurrency, dialplan create/update, Stasis→dialplan, auth fail, catalog uniqueness.

### Residual
Production volumes still need empty-duplicate preflight before first apply of `0019` (migration fails loud if dup groups remain).

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

### Mevcut davranış (shipped)

| Query | Catalog / plan notes |
|---|---|
| `cdr WHERE call_id = …` | Unique `cdr_call_id_uidx` (tiny tables may still seq-scan in EXPLAIN) |
| `recordings WHERE call_id = …` | `recordings_call_id_idx` (`0020`) |
| `call_events(call_id)` / `(call_id, at DESC)` | `call_events_call_id_idx` + `call_events_call_id_at_idx` (`0020`) |
| `sessions.token` | Unique index present |

### INSERT/UPDATE cost
Secondary btree on `recordings(call_id)` / `call_events(call_id)`: low write amplification for PBX-scale volumes; high read win on admin CDR list joins. Large prod tables may prefer `CREATE INDEX CONCURRENTLY` outside drizzle txn (see comments in `0020_*.sql`).

### Regresyon
`hotpath-indexes.int.test.ts` — asserts catalog indexes from `0019`/`0020` (does not rely on EXPLAIN picking the index on empty/tiny tables).

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
