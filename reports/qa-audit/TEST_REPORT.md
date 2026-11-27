# Test Report

Legend: **PASS** executed & passed · **FAIL** executed & failed · **BLOCKED**
could not execute (missing infra) · **NOT RUN**.

## Summary

| Suite | Framework | Count | Status |
|---|---|---|---|
| API unit | vitest | 491 | **PASS (491/491)** |
| API integration | vitest + Postgres 17 | 732 | **PASS (732/732)** |
| Web unit | vitest + jsdom | 201 | **PASS (201/201)** |
| Typecheck (api/web/shared) | tsc --noEmit | — | **PASS (0 errors)** |
| Smoke | `scripts/smoke-test.sh` | 10 | **PASS (10/10)** |
| Site Playwright e2e | playwright | 1 spec | **BLOCKED** |
| Web Playwright e2e (SIP/queue/perf) | playwright | — | **BLOCKED** |

**Total executed & passing: 1,424 automated tests** (491 + 732 + 201) + 10 smoke
checks + full typecheck.

## Baseline vs final

| | Baseline (start of pass) | Final |
|---|---|---|
| api typecheck | **4 errors** | 0 errors |
| api unit | 490/491 (1 stale fail) | **491/491** |
| api integration | 730/731 (1 stale fail) + intermittent ban flake | **732/732, stable** |
| web unit | 201/201 | 201/201 |
| smoke test | none existed | **10/10** |

## New tests written this pass
- `apps/api/src/jobs/retention.int.test.ts` — regression for the session-pruning
  fix (expired deleted, live kept). **PASS.**
- `scripts/smoke-test.sh` — 10 functional smoke assertions. **PASS.**
- (Earlier this session: `cors-origin.test.ts`, `secret-check.test.ts`,
  `internal-auth.test.ts`, `crypto-rotation.test.ts` — 17 security/unit tests, all
  PASS, already in the suite counts above.)

## Bugs found → fixed → regression-verified
1. **`typecheck` red** (4 TS errors) → fixed (header index signature) → `tsc` clean.
2. **Unbounded `sessions` growth** → `pruneExpiredSessions()` added → new
   integration regression test PASS.
3. **Stale KVKK transfer assertion** → test made deterministic → flow-runtime
   122/122 PASS.
4. **Stale `.ogg` conversion assertion** → corrected to `.mp3` → jobs2 30/30 PASS.
5. **Intermittent integration flake** (`ip_bans` leak for 127.0.0.1 → admin tests
   got 403 not 401) → global per-test ban reset → **5/5 stability runs 732/732**.

## Flake-fix evidence
Before fix (same suite, repeated runs): `732`, `1 failed | 731`, `732`,
`1 failed | 731` — intermittent (a run could fail up to 8 tests in
`admin-resources.int.test.ts` + 1 in `auth-xff.int.test.ts`).
After fix (`reset-bans` global hook), 5 consecutive runs:
```
run 1:  732 passed (732)
run 2:  732 passed (732)
run 3:  732 passed (732)
run 4:  732 passed (732)
run 5:  732 passed (732)
```

## How to run (from a clean checkout)
```bash
# unit (no infra)
pnpm --filter @monosip/api test          # or: cd apps/api && vitest run --exclude '**/*.int.test.ts'
pnpm --filter @monosip/web test

# typecheck
pnpm typecheck

# integration (needs Postgres with a monosip_test DB on TEST_PG_PORT, default 55433)
TEST_DATABASE_URL=postgresql://monosip:...@localhost:55433/monosip_test \
  pnpm --filter @monosip/api run test:integration

# smoke (against a running instance)
BASE_URL=http://127.0.0.1:3000 ADMIN_PASSWORD=... pnpm test:smoke
```

## Coverage
No coverage instrumentation was run (no `@vitest/coverage-*` configured and the
brief says not to fabricate percentages). Qualitatively, coverage is **high**:
1,424 tests span auth, authorization, the dialplan flow runtime (122 tests),
CDR/recording ingest, jobs, routing, call policy, TTS, widgets, and the web admin
pages. Gaps are the BLOCKED e2e/SIP paths. Recommend adding `@vitest/coverage-v8`
and a coverage gate for critical modules (`lib/auth`, `lib/crypto`,
`routes/auth`, `asterisk/flow-runtime`).

## Blocked — detail
- **Site Playwright** and **web SIP/queue/perf e2e**: require a built site +
  headless browser and the full Asterisk/coturn/TTS media stack with a real SIP
  endpoint. Not available in this API-only rig; the brief forbids uncontrolled
  external calls. See REMAINING_ISSUES.md.
