# Remaining Issues, Blocked Tests & Technical Debt

## Unresolved (recommendations)

### R1 — Dependency CVEs on production paths (HIGH)
12 high advisories, several on prod paths (`drizzle-orm`, `@fastify/static`,
`node-forge`/`follow-redirects` via `acme-client`, `zod`, `i18next`). Not auto-fixed
because: (a) some need re-running the integration suite to validate (drizzle), and
(b) `zod` 3→4 is a breaking major. See DEPENDENCY_AUDIT.md for the staged plan.

### R2 — No CI test stage (process gap, HIGH value)
`.github/workflows/` has only `docker.yml` (image build) and `pages.yml` (site).
**Nothing runs the 1,400+ tests, typecheck, or smoke on push.** The strong suite
provides no regression protection in CI. Recommend a workflow running
`typecheck` + api unit + api integration (service Postgres) + web unit + smoke.

### R3 — `lint` is a no-op; no ESLint (P3)
`"lint": "echo ok"`. Add typescript-eslint with `no-floating-promises`,
`require-await`, `no-unused-vars` at minimum. `typecheck` should also be wired as
a real gate now that it is green.

### R4 — No global request rate limit (P3, security-adjacent)
Only per-IP login throttle + per-API-key limits + widget caps exist. A distributed
flood of unauthenticated requests (notably `login`, ~90 ms scrypt each) is
throttled per-IP but not globally. Consider a lightweight global limiter
(`@fastify/rate-limit`) and/or a concurrency cap on in-flight login hashes.

### R5 — Existing prod admin credential (operator action)
`sip.dgn.tr` admin is still `admin@example.com` / `Admin123!` with TOTP off (the
1.9.7 auto-generated admin password only applies to *fresh* installs). The operator
must change it in Settings → Admin sign-in and enable TOTP.

## Blocked tests (could not execute in this environment)

| Suite | Why BLOCKED |
|---|---|
| `site` Playwright (`site/tests/*.spec.ts`) | Needs a built site + headless browser server; the brief forbids uncontrolled external calls and the site dev server + browser weren't stood up. Prior session notes list known pre-existing failures (home-page contrast, route-picker). |
| web `test:e2e` / `test:e2e:sip` / `test:e2e:queue` / `test:e2e:perf` | Need the full Asterisk + coturn + TTS + web stack and a SIP endpoint — not runnable in this API-only rig. |
| Multi-hour endurance / 100-conc stress | Not run to avoid an unbounded local resource test; 50-conc health showed 0 errors with headroom. |

## Known test-infrastructure debt
- Integration tests share **one** `monosip_test` database and run sequentially
  (`fileParallelism: false`). State leaks between files are possible; the `ip_bans`
  leak (fixed, see FIXES_APPLIED.md #5) was one instance. A stronger design would
  give each file a transaction rollback or a fresh schema, but that is a larger
  refactor. The added global `reset-bans` hook addresses the observed flake.
- The in-memory login-guard counter is process-global; tests reset it per-IP via
  `clearLoginFailures`. A `resetAll()` export would make this cleaner.

## Unverified assumptions
- `health.ok` requires Asterisk; in an API-only deployment it stays `false` even
  when the API+DB are fully healthy. The smoke test treats `db:true` as the hard
  gate and reports `ok` as informational. Confirm this matches operational
  alerting expectations (don't page on `ok:false` when only Asterisk is the probe
  target in a split deployment).
- Dependency-upgrade impact (esp. `drizzle-orm`, `zod`) is **not** validated here;
  each bump must re-run the full integration suite before merge.

## Technical debt (low priority)
- `apps/api` `build` (`tsc`) is never exercised in prod (runs via `tsx`); keep
  `typecheck` green in CI so the compile target doesn't silently rot (it had
  rotted — 4 errors — until this pass).
- Several routes use lazy `await import()`; fine for boot speed, but means a typo
  in a rarely-hit lazy import only surfaces at runtime unless `typecheck` runs.
