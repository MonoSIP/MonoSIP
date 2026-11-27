# Architectural Violations & Findings

Severity: **P0** critical architecture/security · **P1** high structural · **P2** medium maintainability · **P3** low · **INFO** observation.

Only evidence-backed items. No invented multi-tenant bugs (product is single-tenant).

---

### P1 — Dual CDR ingest idempotency — **HARDENED** (2026-11-27)

- **Fix:** `cdrStart` advisory-locked + exist-check; `UNIQUE cdr_call_id_uidx`; `cdrEnd` no-op on finished retry.
- **Migration:** `0019_cdr_call_id_unique.sql` (prod not applied; throwaway verified).
- **Evidence:** `CDR_IDEMPOTENCY_HARDENING.md`; int tests — parallel/retry → exactly 1 row; raw 2nd INSERT → `23505`.
- **Residual:** Prod apply only after `SELECT call_id, count(*) … HAVING count(*) > 1` is empty (migration fails loud if not).

---

### P1 — `admin-resources.ts` responsibility sprawl

- **File:** `apps/api/src/routes/admin-resources.ts` (~3202 LOC, ~cx 522)
- **Impact:** Highest change-risk file; CDR ingest, recordings, schedules, settings, reports, flows adjacent — review/regression cost grows with every feature.
- **Evidence:** LOC/complexity metrics (`_metrics.json`); single `adminResourceRoutes` registration.
- **Reproduction:** `wc -l` / architecture metrics script.
- **Recommended fix:** Split by domain (`admin-cdr.ts`, `admin-flows.ts`, `admin-settings.ts`, …) **without** introducing a new abstraction layer — keep Fastify handlers + shared helpers. Wait for approval before refactor.
- **Regression test:** After split, extend `module-boundaries` allow-list; keep route smoke/e2e.

---

### P1 — Routes talk to Drizzle directly (no service boundary)

- **Files:** all `routes/*.ts` (14+ `from "../db/"` import sites)
- **Impact:** Controllers own SQL + auth + side effects (config rewrite). Harder to reuse logic from jobs/WS without duplication.
- **Evidence:** import graph; e.g. portal ownership SQL inline at `portal.ts` L172–187.
- **Reproduction:** `rg 'from \"\\.\\./db/' apps/api/src/routes`
- **Recommended fix:** **Do not** introduce a repository framework. Optionally extract repeated query blocks into `lib/*` helpers when touching a feature. Enforce “no new SQL in routes” only if you choose that rule later.
- **Regression test:** Optional ESLint path restriction — not enabled (would fail entire codebase today).

---

### P2 — Folder-level soft cycle `db ↔ lib`

- **Files:** `db/seed.ts`, `db/reset-admin-password.ts` → `lib/crypto|audit`; `lib/*` → `db/client`
- **Impact:** Low runtime risk; complicates “db is leaf” mental model. File-level madge still clean.
- **Evidence:** `architecture/module-boundaries.test.ts` (allowed exception).
- **Recommended fix:** Move seed crypto usage behind a tiny `db/password.ts` or pass hash functions in — only if cycle grows.
- **Regression test:** existing boundaries test fails on new folder cycles.

---

### P2 — Unused `recordings.delete_at`

- **File:** `apps/api/src/db/schema.ts` L369
- **Impact:** Dead schema column; retention uses `createdAt` (`jobs/retention.ts`). Confuses future contributors.
- **Evidence:** `rg deleteAt` → schema only; architecture schema test.
- **Recommended fix:** Either wire retention to `deleteAt` or drop column in a migration (approved change).
- **Regression test:** `schema-integrity.test.ts` documents current unused state — update when fixed.

---

### P2 — Unused `queue_events` table

- **File:** `schema.ts` L353–361
- **Impact:** Dead table; queue analytics cannot rely on it.
- **Evidence:** no `insert(queueEvents)` / `from(queueEvents)` in src.
- **Recommended fix:** Implement writers from AMI/queue events **or** remove table.
- **Regression test:** add “table has writer” inventory when decided.

---

### P2 — Unused `cdr.trunk_id`

- **File:** `schema.ts` L332
- **Impact:** Dead column; cannot report “which trunk” from CDR.
- **Evidence:** no `insert`/`set` of `cdr.trunkId` in routes/lib/asterisk/jobs (outbound uses `trunk_ids` jsonb on routes).
- **Recommended fix:** Populate on outbound finalize **or** drop column.
- **Regression test:** `schema-integrity` “unused cdr.trunkId” assertion.

---

### P2 — Missing hot-path indexes

- **Files:** `schema.ts` `recordings`, `call_events`; portal CDR filters in `portal.ts` / admin list
- **Impact:** Larger installs slow on recording join-by-callId and call-event timelines.
- **Evidence:** no `recordings(call_id)` / `call_events(call_id)` indexes; admin joins `inArray(recordings.callId, …)`.
- **Recommended fix:** Add indexes in a migration when scale warrants (measure first).
- **Regression test:** schema-integrity documents current gap for `recordings(call_id)`.

---

### P2 — Dual CDR ingest + webhook timing

- **Files:** `lib/cdr.ts` (Stasis); `admin-resources.ts` `POST /api/v1/internal/cdr` (dialplan); flow-runtime webhook emit on Stasis return
- **Impact:** “Ended” in webhook can precede DB `ended_at`; two writers must stay semantically aligned.
- **Recommended fix:** Document contract; optionally defer webhook until `cdrEnd`; keep ingest tests covering both paths.
- **Regression test:** existing CDR/int tests; extend if changing either path.

---

### P2 — `pendingTransfers` not durable across API restart

- **File:** `flow-runtime.ts` in-process `Map`
- **Impact:** Restart mid IVR-transfer ring → dial-failed cannot resume → hangup.
- **Recommended fix:** Accept for single-container PBX **or** persist short-lived transfer state (usually not worth it).
- **Regression test:** N/A (ops constraint) — document in SIP_STATE_MACHINE.

---

### P2 — Web underuses `@monosip/shared`

- **Evidence:** Only `TrunksPage.tsx` imports shared (`formatCallerId` / `parseCallerId`); API validates heavily with Zod from shared.
- **Impact:** UI/API schema drift risk for most admin forms.
- **Recommended fix:** Incrementally import shared schemas in web forms/Flow designer when touching those pages.
- **Regression test:** optional count of web shared imports (informational).

---

### P2 — Loose IVR node `data` typing

- **File:** `packages/shared/src/flow.ts` L25–30 (`data: z.record(...)`)
- **Impact:** Invalid node configs validate; fail at runtime on calls.
- **Recommended fix:** Per-type Zod discriminators gradually.
- **Regression test:** extend `ivr-graph-properties` / shared schema tests per node.

---

### P2 — Flow JSON lacks `schemaVersion`

- **Impact:** Future node contract changes harder to migrate safely.
- **Recommended fix:** Add optional `schemaVersion: 1` default; migrate on read.
- **Regression test:** parse fixtures v1.

---

### P2 — In-process jobs / single-instance assumption

- **Files:** `index.ts` job starts; `lib/cdr.ts` open Map
- **Impact:** Horizontal scale of API would duplicate jobs and split CDR memory.
- **Recommended fix:** Document “one API replica” (already true for Asterisk co-location). No Redis job bus unless scaling is a real goal.
- **Regression test:** N/A (ops constraint).

---

### P3 — `lib → asterisk` reverse edges

- **Files:** `announce-call.ts`, `presence.ts`, `queue-announce-tts.ts`
- **Impact:** Domain helpers depend on telephony I/O — acceptable but watch growth.
- **Regression test:** allow-list in `module-boundaries.test.ts`.

---

### INFO — No multi-tenant isolation layer

- Product is single-company PBX. Actor isolation (admin/extension/widget/internal) is the real boundary — tested in `actor-isolation.test.ts` + portal ownership checks.
- Cross-tenant tests **N/A**; do not invent tenant_id.

---

### INFO — dependency-cruiser must cruise entrypoints

- Directory cruise returns 0 modules with current toolchain; `scripts/arch-deps.sh` uses entry files. Documented operational quirk.

---

## Boundary rules currently green

| Rule | Status |
|---|---|
| asterisk ↛ routes/jobs | pass |
| lib ↛ routes | pass |
| jobs ↛ routes | pass |
| shared ↛ apps | pass |
| web ↛ api/src | pass |
| file-level circular | pass (0) |
| `pnpm arch:deps` | pass |
| `pnpm arch:test` | 48 pass |
