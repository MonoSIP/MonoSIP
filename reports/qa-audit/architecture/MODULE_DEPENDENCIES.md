# Module Dependencies

## Measurement

| Tool | Result |
|---|---|
| `madge --circular --extensions ts apps/api/src` | **0 file-level cycles** |
| Folder graph (architecture unit test) | Soft cycle **`db ↔ lib` only** |
| `pnpm arch:deps` (dependency-cruiser entry cruise) | **0 violations** (99 modules / 98 deps) |
| `pnpm arch:test` | **48 passed** |

## Cross-folder edge counts (non-test)

| From → To | Approx import sites | Notes |
|---|---:|---|
| routes → lib | 45 | Auth, validation helpers, domain services |
| routes → db | 14 | Direct Drizzle queries in controllers |
| routes → asterisk | 9 | Config rewrite, ARI live state, routing |
| jobs → db | 14 | Retention, archive, trunk status |
| jobs → lib | 5 | SMTP, AMI helpers |
| jobs → asterisk | 2 | Trunk monitor emits on `ari` |
| lib → db | 34 | Expected for a service layer |
| lib → asterisk | 3 | `announce-call`, `presence`, `queue-announce-tts` |
| asterisk → lib | 7 | CDR, settings, TTS, … |
| asterisk → db | 6 | Flow load, settings |
| db → lib | 3 | `seed`, `reset-admin-password` → crypto/audit |
| db → asterisk | 1 | `seed` → `writeAsteriskConfig` |

**Forbidden (and currently absent):** `asterisk→routes`, `lib→routes`, `jobs→routes`, `shared→apps`, `web→api/src`.

## Intentional coupling (documented)

```
lib/announce-call.ts  → asterisk/ari.ts
lib/presence.ts       → asterisk/ari.ts
lib/queue-announce-tts.ts → asterisk/queue-lang.ts
db/seed.ts            → asterisk/config-writer.ts
db/seed.ts, reset-admin-password.ts → lib/crypto|audit
```

Locked by `apps/api/src/architecture/module-boundaries.test.ts`.

## Dependency depth

Typical request path depth:

1. `routes/*`  
2. `lib/*` and/or `asterisk/*`  
3. `db/client` + `schema`  
4. Postgres / Asterisk ARI  

Max practical depth ≈ **4**. No deep service/repository tower.

## Coupling / cohesion notes

| Module | Coupling | Cohesion | Comment |
|---|---|---|---|
| `admin-resources.ts` | High fan-out to db + asterisk | **Low** (many unrelated resources in one file) | Largest maintainability risk — see recommendations |
| `config-writer.ts` | Reads almost all telephony tables | High (one job: emit conf) | Large but single responsibility |
| `flow-runtime.ts` | ARI + db + flow-logic | High (IVR execution) | Large; node switch is dense |
| `lib/*` | Mixed | Mixed | Many small cohesive units; good |
| `jobs/*` | Low | High | One concern per file |

## Shared package consumers

- API: Zod parse on routes, settings, flow JSON, destinations (heavy use)  
- Web: **underused** — production import found only in `TrunksPage.tsx` (`formatCallerId` / `parseCallerId`); most admin forms duplicate shapes client-side (drift risk — see violations)  
- Site/docs: separate; not part of runtime graph  

## Graph (simplified)

```
                 ┌──────────────┐
                 │ @monosip/shared│
                 └───────▲──────┘
         ┌───────────────┼───────────────┐
         │               │               │
    apps/web        apps/api/src      (leaf)
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       routes          jobs         asterisk
          │              │              │
          └──────► lib ◄─┴──────────────┘
                    │ ▲
                    ▼ │
                    db
```
