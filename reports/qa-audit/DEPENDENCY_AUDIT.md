# Dependency & Supply-Chain Audit

Tool: `pnpm audit` (via `npx pnpm@12`, network available).

## Phase 3 snapshot (final acceptance)
`pnpm audit`: **5 advisories — 0 critical, 0 high, 5 moderate, 0 low.**
All five are **dev-only** (`vitest` / `@vitest/mocker` / `glob` / `minimatch` via
coverage). **`zod@4.6.7`** resolved the prior HIGH. Raw: `_audit-phase3.txt`.

Accepted exceptions (non-blocking for production runtime): the five moderate
toolchain findings. No CRITICAL/HIGH remains without an exception.

---

## Phase 1/2 historical snapshot
Tool: `pnpm audit` (via `npx pnpm@12`, network available). Snapshot: 2026-11-27
(early). Raw JSON: `reports/qa-audit/_audit.json`.

## Vulnerability totals (Phase 1)
`pnpm audit`: **45 advisories — 2 critical, 12 high, 21 moderate, 10 low.**
(`pnpm audit --prod` narrowed to 39; the extra 6 were dev-only toolchain.)

## Severity by module (deduplicated)

| Severity | Module | Path | Prod? | Note |
|---|---|---|---|---|
| critical | `tinypool` | vitest → tinypool | **dev** | test runner only; not shipped |
| high | `drizzle-orm` <0.45.2 | direct (api) | **yes** | ORM — bump to ≥0.45.2 |
| high | `@fastify/static` ≤10.1.0 | direct (api) | **yes** | serves the SPA — bump |
| high | `node-forge` ≤1.4.0 | acme-client → node-forge | **yes** | Let's Encrypt (ACME) |
| high | `zod` <4.6.6 | shared → zod | **yes** | validation — see note |
| high | `follow-redirects` 1.16.0–1.16.1 | acme-client → axios → follow-redirects | **yes** | ACME HTTP |
| moderate | `@fastify/static`, `esbuild`, `@vitest/mocker`, `fast-uri`, `glob`, `i18next`, `minimatch`, `vitest`, `node-forge` | mixed | mixed | `i18next` is web/prod |
| low | `fast-uri`, `node-forge` | transitive | — | |

## Analysis & recommendations

**Do NOT blanket-upgrade.** Classify:

1. **Safe, recommended now (minor/patch, low breakage):**
   - `@fastify/static` → patched 10.1.1+ or current major line. Serves static
     assets; low API surface for MonoSIP. Run web build + smoke after.
   - `acme-client` → latest (pulls patched `node-forge` + `axios`/`follow-redirects`).
     Only used for Let's Encrypt issuance; covered by the ssl-renew job — test on
     a staging cert.
   - `drizzle-orm` 0.44 → 0.45.x. 0.x minors can carry breaking changes; **must**
     re-run the integration suite (732 tests) after bumping. Defer if no cycle to
     validate.

2. **Dev-only (no shipped risk, upgrade opportunistically):**
   - `tinypool` (critical), `vitest`, `@vitest/mocker`, `esbuild`, `glob`,
     `minimatch`. Bumping `vitest` pulls patched `tinypool`/`@vitest/mocker`.

3. **Needs a migration, NOT a quick bump:**
   - `zod` 3.25 → 4.x is a **major** rewrite (API changes). All validation and
     `@monosip/shared` schemas depend on it. Plan as a tracked task with full test
     runs; do not auto-bump. The advisory severity is "high" but the practical
     exploitability in this server (schemas validate trusted-shape internal/admin
     input) is lower than the label suggests — still, schedule it.
   - `i18next` (web) — bump within its major; re-run web tests.

## Other supply-chain notes
- Dependency counts are modest: api 14 prod / 9 dev, web 18 / 14, shared 1 / 1,
  site 5 / 12. No obvious bloat or duplicate frameworks.
- Core libs are current majors: Fastify 5, Drizzle 0.44, pg 8, ws 8, zod 3.25.
- No abandoned direct dependency identified. `acme-client` is the main source of
  transitive highs (node-forge/axios/follow-redirects) — upgrading it clears
  several at once.
- License: project is MIT; no incompatible direct dependency licenses observed in
  the manifests.

## Action items
- [ ] Bump `acme-client` to latest; re-run ssl-renew path on staging.
- [ ] Bump `@fastify/static`; web build + `test:smoke`.
- [ ] Bump `drizzle-orm` to ≥0.45.2; **re-run the 732 integration tests**.
- [ ] Bump `vitest` (clears `tinypool` critical + dev moderates).
- [ ] Track `zod` v4 migration as a separate story (breaking).
- [ ] Add `pnpm audit --audit-level=high` as a non-blocking CI step.
