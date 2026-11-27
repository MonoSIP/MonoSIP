# Mutation Test Report

## Method

Full Stryker/mutation tooling was **not** added as a permanent dependency (heavy, slow on ~19k LOC API). Instead:

1. **Critical-predicate mutants** encoded in `apps/api/src/architecture/mutation-critical.test.ts` (7 tests).
2. Review of existing unit coverage on auth, flow-logic, recording keep rules, IVR runtime.
3. Qualitative survival analysis — what a careless edit would break vs slip through.

## Priority targets

| Area | Module | Existing coverage signal |
|---|---|---|
| Auth / sessions | `lib/auth.ts`, `routes/auth.ts` | unit + integration (`auth.int.test.ts`) |
| Authorization | `requireAdmin` / `requireExtension`, portal ownership | portal source locks + int tests |
| SIP / ARI cleanup | `ari.ts`, `flow-runtime.ts` | large `flow-runtime.test.ts` |
| IVR engine | `flow-logic.ts`, `flow-runtime.ts` | extensive unit tests |
| Queue | config-writer + queue-callback job | unit + int |
| API validation | shared Zod | schema tests + route tests |
| Session retention | `jobs/retention.ts` | `retention.int.test.ts` |
| Recording keep | `recording-files.ts` + ingest | unit + architecture mutants |

## Mutants examined (architecture suite)

| Mutant idea | Killed? | How |
|---|---|---|
| `compare('=')` → `!==` | Yes | equality assertion vs mutant |
| `contains` confused with `starts_with` | Yes | distinguishable cases |
| `BUSY` → `noanswer` collapse | Yes | `dialStatusToHandle` |
| Menu `strict=false` fallback on bad digit | Yes | `nextNode` strict vs loose |
| Keep threshold → 0s / ignore size | Yes | `isKeepableRecording` |
| Drop `billed === 0` discard on ingest | Yes | source contract assert in admin-resources |

## Surviving / weakly killed classes (significance)

| Class | Why it may survive | Significance |
|---|---|---|
| Typo-only changes in dialplan string templates inside `config-writer.ts` | Few asserts on exact conf lines vs behavior | **High** for telephony — prefer golden-file snippets for critical exten lines when touching writer |
| Alternate error message strings | Tests often check status codes not copy | Low |
| Log-line only edits | Untested | None |
| Soft-FK nulling order on recording delete | Partial coverage | Medium — add int test if changing purge |
| Webhook retry / duplicate delivery | Best-effort path | Medium for integrations |
| Per-node IVR `data` field validation | Zod record is loose | **High** for bad designer saves — typed schemas kill this class |

## Score philosophy

No global mutation score published. Chasing % on generated dialplan strings and Fastify glue yields noise. The meaningful bar:

- Authz bypass mutants die  
- IVR routing mutants die  
- Recording retention/keep mutants die  
- Boundary rule mutants die (`arch:test` / `arch:deps`)

## Optional next step (approval required)

Pin `stryker-js` on a **narrow** set: `flow-logic.ts`, `recording-files.ts`, `lib/auth.ts`, `lib/internal-auth.ts` — nightly or manual, not every CI push.
