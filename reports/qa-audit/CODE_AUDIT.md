# Code Audit — Dead Code, Quality, Static Analysis

## Static analysis / type checking

| Check | Tool | Result |
|---|---|---|
| Type check — api | `tsc -p apps/api/tsconfig.json --noEmit` | **4 errors → 0 (FIXED)** |
| Type check — web | `tsc -p apps/web/tsconfig.json --noEmit` | 0 errors |
| Type check — shared | `tsc --noEmit` | 0 errors |
| Lint — all | `pnpm -r run lint` | **no-op** (`"lint": "echo ok"`) |
| ESLint config | — | **none present** |

### P1 (FIXED) — `typecheck` was red: header type mismatch
`clientIsHttps(req.headers, …)` and `sessionCookie(req)` typed `headers` as
`{ "x-forwarded-proto"?: … }` with no index signature, so Fastify's
`IncomingHttpHeaders` was not assignable (TS2345/TS2559).
- Files: `apps/api/src/lib/public-identity.ts:30`, `apps/api/src/routes/auth.ts:22`
- Call sites that errored: `auth.ts:79`, `auth.ts:232`, `portal.ts:74`, `widgets.ts:315`
- Impact: `pnpm --filter @monosip/api build` (`tsc`) and `typecheck` fail. Prod
  runs via `tsx` so it was masked, but the build target was broken.
- Fix: added `[key: string]: string | string[] | undefined` index signature to
  both parameter types. `tsc` now clean.

### P3 — `lint` is a placeholder
`apps/api` and `apps/web` both define `"lint": "echo ok"`; root `lint` fans out
to these. No ESLint/Biome config exists. Static-analysis coverage therefore
relies solely on `tsc`. Recommend adding ESLint (typescript-eslint) with at least
`no-floating-promises`, `no-unused-vars`, `require-await`.

## Dead code

Tool: `ts-prune` (via npx) against `apps/api/tsconfig.json`.

- **14 exports flagged; 0 are genuine dead code.** 13 are test-harness exports in
  `src/test/helpers.ts` and `src/test/jobs-harness.ts` (consumed by `*.int.test.ts`
  which are outside the main tsconfig include — false positives). The 1 remaining,
  `update-check.ts:131 clearUpdateCheckCache`, is used by `update-check.test.ts`.
- **Conclusion: effectively no dead code.** No unused runtime exports, no
  unreachable branches found by the type checker, no abandoned modules.

> Note: dynamically imported modules (the codebase uses `await import(...)`
> extensively for lazy route/job loading) and dialplan-invoked internal endpoints
> were NOT classified as dead code — their execution paths are real (verified via
> the integration suite and the live smoke test).

## Code markers / commented code
- `TODO|FIXME|HACK|XXX`: **3 matches, all false positives** (regex/number-pattern
  comments like `0XXXXXXXXXX`, `_NXXXXXX`). No real TODO/FIXME debt.
- No large commented-out code blocks found in `src`.

## Error handling observations
- The project consistently wraps background jobs in `.catch()` to avoid fatal
  unhandled rejections (good — e.g. `retention.ts`, `index.ts` boot loops).
- The global 500 handler was hardened earlier this session to not leak raw error
  text (see SECURITY_REPORT.md / FIXES_APPLIED.md).
- `scrypt`/token comparisons use `timingSafeEqual`; the one `!==` secret compare
  in `internal-auth.ts` was switched to constant-time this session.

## Architecture / maintainability
- Clear monorepo layout (api / web / shared / site). Shared Zod schemas in
  `@monosip/shared` drive both API validation and the web types — good single
  source of truth.
- Heavy use of lazy `await import()` in routes/jobs keeps boot fast (~3.3 s) but
  means type coverage depends on those modules being compiled; `typecheck` must
  stay green in CI to catch regressions (currently not enforced).
- No circular-dependency failures surfaced during `tsc` or the test runs.

## Severity roll-up (this report)
| Sev | Count | Items |
|---|---|---|
| P1 | 1 (fixed) | typecheck red |
| P3 | 1 | no-op lint / no ESLint |
| INFO | — | no dead code, no TODO debt |
