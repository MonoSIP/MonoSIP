# Architecture Recommendations

Ordered by severity. **No automatic refactors performed.** Await approval before structural splits.

## P0

*None found in this architectural pass.* Prior functional/security QA already addressed auth timing, WS leaks, empty recordings, etc. Architecture review did not surface a new critical boundary bypass.

## P1

1. **CDR idempotency (validated):** dedupe `cdr` by `call_id`, add unique constraint, make `cdrStart` upsert. See `VALIDATION_HARDENING.md` §1. **Approval required before apply.**
2. **Split `admin-resources.ts` by domain** when next touching that file for features — not a big-bang rewrite. Keep handlers thin; move shared SQL to `lib/` only when duplicated.
3. **Keep dependency-cruiser + `arch:test` (+ `arch:test:int` in CI when Postgres service present)** (wired). Treat new `lib→asterisk` or folder cycles as explicit allow-list PRs.

## P2

3. **Resolve dead schema:** `recordings.delete_at`, `queue_events`, and unused `cdr.trunk_id` — implement or remove.
4. **Tighten Flow node `data`** with discriminated Zod unions node-by-node (start with `transfer`, `menu`, `api`).
5. **Add `schemaVersion` to FlowJson** (default 1) before the next breaking node change.
6. **Document single-replica constraint** next to deploy docs (jobs + in-memory CDR + `pendingTransfers`).
7. **Optional:** wrap multi-step schedule/range updates in `db.transaction`.
8. **Indexes when measured slow:** `recordings(call_id)`, `call_events(call_id)` — do not add blindly.
9. **Align web with `@monosip/shared`** on forms you next edit (today only TrunksPage imports it).
10. **CDR dual-path contract:** keep Stasis `lib/cdr` and dialplan `/internal/cdr` semantically paired; defer “ended” webhooks until `cdrEnd` if integrators need DB truth.

## P3

8. Extract seed crypto so `db` does not import `lib` (breaks soft cycle) — only if convenient.
9. OpenAPI snapshot from Zod — nice for external integrators; not required for soundness.
10. Graceful SIGTERM: stop ARI + clear job intervals (nice for zero-drop deploys).

## INFO / non-goals

- **Do not** split into microservices. Co-located Asterisk + API is the product shape.
- **Do not** invent multi-tenant tables.
- **Do not** add a generic repository/UoW framework.
- Prefer modular monolith hygiene: folder boundaries, shared Zod, focused files.

## Installation / migration integrity (checklist — non-destructive)

| Check | Status in audit |
|---|---|
| Fresh install path documented | `docs/INSTALL.md` / Docker |
| Migrations sequential 0000–0018 | present |
| Re-run migrate idempotent | Drizzle journal (not re-run destructively here) |
| Backup/restore job | `nightly-backup.ts` |
| Env validation | `config.ts` |
| Default secret safety | lab placeholders in examples only |
| Docker reproducibility | single image story |
| Arch tests on CI | `arch:test`, `arch:deps` added |

## Proposed change approval gate

Before any P1 split or schema drop:

1. Present file list + route map  
2. Run `pnpm arch:test && pnpm arch:deps && pnpm --filter @monosip/api test`  
3. Run integration suite against lab DB  
4. Only then commit / deploy
