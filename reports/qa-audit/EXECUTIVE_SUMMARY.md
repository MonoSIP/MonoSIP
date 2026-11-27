# MonoSIP — QA Audit Executive Summary

**Date:** 2026-11-27 · **Auditor:** independent QA pass · **Scope:** full repository
(apps/api — Fastify/TypeScript, apps/web — React/Vite, packages/shared, site, docker).

## Overall quality: **84 / 100**

MonoSIP is a well-built, test-heavy codebase. It has a large real test suite
(1,400+ tests), almost no dead code, modern dependencies and a careful auth
design. The points deducted are for: a `typecheck` that was red (now fixed),
a no-op `lint`, no test stage in CI, dependency CVEs (12 high, prod-path), an
unbounded `sessions` table (fixed), and an intermittent integration-test flake
(fixed). No P0/critical runtime or data-loss defect was found in application code.

### Scoring method
Start 100; subtract for evidence-backed defects weighted by severity and whether
unresolved. −6 typecheck red (fixed → −2 residual for no CI gate), −4 no lint,
−3 no CI test stage, −5 dependency highs (unresolved, recommend-only), −3
sessions growth (fixed → residual doc), −2 test flake (fixed), −1 login CPU
cost. Capped by: no critical unresolved issue (so ≥80 defensible); not 100
because dependency highs remain and site/e2e suites are BLOCKED here.

## Test status (this environment)
| Suite | Result |
|---|---|
| API unit (vitest) | **491 / 491 PASS** |
| API integration (vitest + Postgres) | **732 / 732 PASS** (after flake fix) |
| Web unit (vitest) | **201 / 201 PASS** |
| Typecheck (api/web/shared) | **PASS** (4 real errors fixed) |
| Smoke (`scripts/smoke-test.sh`) | **10 / 10 PASS** |
| Site Playwright e2e | **BLOCKED** (needs browser + built site server) |
| Web Playwright e2e (SIP/queue/perf) | **BLOCKED** (needs full Asterisk stack) |

**Total automated tests executed & passing: 1,424.** New tests added this pass: 1
regression (session pruning) plus the smoke suite; 15 security/unit tests added
earlier this session (CORS, secret-check, internal-auth, key rotation).

## Critical findings
None at P0. Highest-impact items:
- **P1 (fixed): `typecheck` was failing** with 4 real TypeScript errors — `tsc`
  build would reject them. Fixed (header index-signature).
- **P2 (fixed): unbounded `sessions` table.** Expired sessions were never
  deleted; only filtered at read. Added `pruneExpiredSessions()` to the 6-hourly
  retention job + regression test.
- **P1 (recommend): 12 high-severity dependency advisories** on production paths
  (`drizzle-orm`, `@fastify/static`, `node-forge`/`follow-redirects` via
  `acme-client`, `zod`, `i18next`). See DEPENDENCY_AUDIT.md.
- **P2 (fixed): intermittent integration flake** — `auth.int.test` leaked a DB
  `ip_bans` row for 127.0.0.1, making later admin tests get 403 instead of 401.
- **P3: `lint` is a no-op** (`echo ok`); no CI test stage.

## Security status
A full external security audit was performed earlier this session and the real,
reproduced findings were fixed and shipped (releases 1.9.5–1.9.7): internal
dialplan endpoints were internet-reachable, CORS reflected any origin with
credentials, the call-back widget could act as an open dialer, revoking portal
access left live sessions, and the image had no default-secret guard. See
SECURITY_REPORT.md. No new exploitable vulnerability was found in this pass.

## Performance status (measured, local, API-only rig)
- Startup ≈ **3.3 s** to first served request.
- `GET /health`: **2,817 req/s**, p50 16 / p95 25 / p99 35 ms, 0 errors @ 50 conc.
- `GET /admin/extensions` (authed DB read): **1,773 req/s**, p99 37 ms, 0 errors.
- `POST /admin/auth/login` (scrypt): **44 req/s**, ~90 ms each — intentionally
  CPU-bound; throttle + ban mitigate brute-force. See PERFORMANCE_REPORT.md.

## Recommended next steps
1. Add a **CI test stage** (unit + integration + typecheck + smoke) — the biggest
   process gap; the suite is strong but nothing runs it on push.
2. Triage the **dependency highs** (DEPENDENCY_AUDIT.md): safe minor bumps for
   `@fastify/static`, `drizzle-orm`, `acme-client`; plan the `zod` 3→4 migration.
3. Replace the no-op **`lint`** with real ESLint + `tsc --noEmit` in `typecheck`.
4. Ship the applied fixes (FIXES_APPLIED.md) and keep the new smoke test in CI.
