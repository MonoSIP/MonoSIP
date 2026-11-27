# Architectural Acceptance

## Question

> Does MonoSIP have a sound internal architecture, not merely working functionality?

## Answer

**Yes — with localized maintainability debt, not systemic architectural failure.**

It is a deliberate **modular monolith** for a self-hosted company PBX: clear actor auth, shared Zod contracts, Asterisk behind ARI + generated dialplan, IVR graph executed in-process with step/depth limits, and background work as supervised in-process jobs. File-level dependency cycles are absent; forbidden cross-layer imports (SIP→HTTP, lib→routes, web→api src) are absent and now CI-gated.

The main structural risks are **file size / cohesion** (`admin-resources.ts`, large dialplan writer, dense flow-runtime) and a few **dead schema remnants** — not tangled circular domains or missing security boundaries.

## Acceptance checklist

| Criterion | Result |
|---|---|
| Modules mapped with evidence | Pass — `ARCHITECTURE_MAP.md` |
| Dependency direction understood | Pass — `MODULE_DEPENDENCIES.md` |
| Circular deps controlled | Pass — 0 file cycles; soft `db↔lib` documented |
| DB FK / cascade / soft refs understood | Pass — `DATABASE_INTEGRITY.md` |
| Tenant model correct for product | Pass — single-tenant; actor isolation tested |
| SIP/IVR state model documented | Pass — app tracks ARI/CDR/IVR, not raw SIP FSM |
| IVR limits & graph tests | Pass — property-style suite |
| API/event contracts described | Pass |
| Jobs / lifecycle guards | Pass — catch wrappers, WS teardown |
| Architecture regression in CI | Pass — `arch:test`, `arch:deps` |
| Findings validated with PG int tests | Pass — `arch:test:int` (19) on throwaway DB |
| Mutation insight on critical logic | Pass — focused, not vanity % |
| No unjustified microservice push | Pass |

## Metrics snapshot

| Metric | Value |
|---|---|
| API non-test TS files | ~91 |
| API LOC | ~19k |
| Avg file LOC | ~208 |
| File circular deps | 0 |
| Folder soft cycles | 1 (`db↔lib`) |
| Arch unit tests | 60 |
| Arch integration tests (throwaway PG) | 19 |
| Depcruiser violations | 0 |
| Largest file | `admin-resources.ts` ~3202 LOC |

## Residual risks to watch

1. Uncontrolled growth of `admin-resources.ts` / `config-writer.ts`  
2. Loose IVR `data` validation  
3. Single-process job + CDR memory + `pendingTransfers` if API restarts mid-call or is scaled  
4. Dialplan string regressions (weak mutation kill rate)  
5. Production CDR storm cleanup not yet executed (code shipped; ops window gated — `AUDIT_CLOSEOUT.md`)  
6. Web/API schema drift while shared Zod stays API-centric  

Dual CDR ingest + early `call.ended` + hot-path call_id indexes are **hardened in tree** (lab + CI verified).

Discovery inputs also folded from mapping passes [Schema/IVR/SIP map](6cf2993d-a58d-45d0-ac5e-2bbc7a0ffcbc) and [API architecture map](fbba3c1a-cf14-455d-89f8-c53258c5b134).

## Sign-off posture

Architecture is **accepted for continued production operation** under the modular-monolith model.  
**Refactoring is optional and gated** — implement P1/P2 only after explicit approval (per audit execution rules).

## Artifacts

1. `ARCHITECTURE_MAP.md`  
2. `MODULE_DEPENDENCIES.md`  
3. `DATABASE_INTEGRITY.md`  
4. `SIP_STATE_MACHINE.md`  
5. `IVR_ENGINE_ANALYSIS.md`  
6. `API_AND_EVENT_CONTRACTS.md`  
7. `RESOURCE_LIFECYCLE.md`  
8. `ARCHITECTURAL_VIOLATIONS.md`  
9. `MUTATION_TEST_REPORT.md`  
10. `ARCHITECTURE_RECOMMENDATIONS.md`  
11. `ARCHITECTURAL_ACCEPTANCE.md` (this file)  
12. `AUDIT_CLOSEOUT.md` — engineering close-out vs operator-gated prod dedupe  

Tooling: `.dependency-cruiser.cjs`, `scripts/arch-deps.sh`, `apps/api/src/architecture/*.test.ts`, CI steps in `.github/workflows/ci.yml`.
