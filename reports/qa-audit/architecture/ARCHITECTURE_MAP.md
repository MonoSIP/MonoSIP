# MonoSIP — Architecture Map

**Scope:** read-only discovery of the *actual* architecture (v1.9.9).  
**Not:** functional QA. Evidence from source under `apps/api`, `packages/shared`, `apps/web`.

## Verdict (one sentence)

MonoSIP is a coherent **single-process, single-tenant PBX monolith**: Fastify API + Drizzle/Postgres + Asterisk ARI/dialplan writer + Vite SPA, with clear actor boundaries and a soft folder cycle (`db↔lib`) but **zero file-level circular imports**.

---

## 1. Runtime topology

```
┌─────────────┐     HTTPS/WS      ┌──────────────────────────────┐
│  apps/web   │ ◄───────────────► │  apps/api (Fastify)          │
│  Vite SPA   │   /api/v1, /ws    │  routes → lib / asterisk / db │
└─────────────┘                   │  jobs (setInterval workers)  │
                                  │  ARI WS → Asterisk           │
                                  │  config-writer → /etc/asterisk│
                                  └──────────────┬───────────────┘
                                                 │
                                  ┌──────────────▼───────────────┐
                                  │  Postgres (Drizzle schema)   │
                                  │  Asterisk (PJSIP + dialplan) │
                                  └──────────────────────────────┘
```

Shared contracts live in `@monosip/shared` (Zod schemas, flow JSON, destinations, locales).

## 2. Application modules (`apps/api/src`)

| Module | Responsibility | LOC (non-test) |
|---|---|---|
| `routes/` | HTTP + WS surface: auth, admin CRUD, portal, widgets, integration, security, updates | ~5.4k |
| `asterisk/` | ARI client, dialplan/PJSIP writer, IVR runtime/engine/logic, routing helpers | ~5.3k |
| `lib/` | Auth, crypto, CDR, TTS, AMI, SMTP, recordings, call policy, presence, sip-guard, … | ~6.0k |
| `db/` | Drizzle client, schema, migrate, seed, admin password reset | ~1.2k |
| `jobs/` | Retention, archive, backup, SSL, trunk monitor, queue callback, reports, clock, mp3 | ~0.8k |
| `config.ts` / `index.ts` | Env config + process bootstrap (route register, ARI, jobs, static SPA) | ~0.4k |

**Web (`apps/web`):** React admin + portal pages; largest admin surfaces are Settings (~1263), FlowDesigner (~787), Integrations/Schedules/Trunks/Extensions.

**Shared (`packages/shared`):** `flow.ts`, `schemas.ts`, `destinations.ts`, `locales.ts` — consumed by API validation and web forms.

## 3. API boundaries

Registered in `apps/api/src/index.ts`:

| Route module | Auth | Domain |
|---|---|---|
| `auth.ts` | public login + `requireAdmin` | sessions, TOTP |
| `admin-extensions.ts` | admin | extensions/devices |
| `admin-resources.ts` | admin + some internal | trunks, queues, flows, CDR, recordings, settings, … |
| `portal.ts` | `requireExtension` | me/*, ownership-scoped |
| `integration.ts` | API key / internal | announce, webhooks |
| `widgets.ts` | widget token + public | browser softphone |
| `security.ts` | admin + internal | IP bans / SIP ACL |
| `updates.ts` | admin | update check |
| `ws.ts` | session cookie | live events |
| `asterisk-ws-proxy.ts` | (browser phone) | Asterisk WS proxy |

Internal dialplan callbacks use `requireInternalSecret` (`lib/internal-auth.ts`).

## 4. Asterisk / SIP / IVR boundaries

| Concern | Owner |
|---|---|
| Live channels / DTMF / playback | `asterisk/ari.ts` (Stasis apps: `monosip-inbound`, `monosip-flow`, `monosip-outbound`) |
| Dialplan + PJSIP generation | `asterisk/config-writer.ts` → Asterisk conf + reload |
| IVR execution | `flow-runtime.ts` + `flow-logic.ts` + `flow-engine.ts` |
| Destination resolution | `asterisk/routing.ts` |
| Outbound announce | `lib/announce-call.ts` (uses `ari`) |
| Queue language/TTS | `asterisk/queue-lang.ts` + `lib/queue-announce-tts.ts` |

**Boot:** `attachFlowRuntime()` + `attachAnnounceRuntime()` then `ari.start()`; dialplan write loop until success (`index.ts`).

## 5. Database ownership

- **Schema:** `db/schema.ts` (40 tables) + `apps/api/drizzle/*.sql`
- **Writers:** routes (CRUD), jobs (retention/archive/trunk status), flow-runtime/CDR helpers, dialplan→internal HTTP ingest, seed
- **No multi-tenant column** — one company deployment = one database

## 6. Event / realtime communication

- **ARI EventEmitter** on `ari` (`calls`, `extension.state`, `trunk.state`, `queue.update`, `alert`, `channelDestroyed`, …)
- **`liveEvents`** (`lib/live-events.ts`) for portal voicemail/missed
- **Admin/portal `/ws`** filters by actor type
- **No external message bus** (no Kafka/NATS) — process-local emitters + HTTP webhooks table

## 7. Background workers

All in-process `setInterval` / delayed ticks started from `index.ts` (not a separate worker fleet):

`retention`, `queue-callback`, `summary-email`, `archive`, `recording-convert`, `sip-guard`, `trunk-monitor`, `nightly-backup`, `ssl-renew`, `clock-check`

## 8. Configuration management

| Layer | Location |
|---|---|
| Process env | `config.ts` (DB, ARI, secrets, paths) |
| Operator settings | `settings` table + `SettingsSchema` in shared |
| Asterisk conf | generated by `config-writer` from DB rows |
| SIP secrets | encrypted columns (`sipSecretEnc`, etc.) |

## 9. Runtime resource ownership

| Resource | Owner | Cleanup |
|---|---|---|
| ARI WS sockets + poll timer | `ari` | `ari.stop()` |
| DTMF/playback Maps | `ari` | channel hangup handlers |
| `pendingTransfers` | `flow-runtime` | delete on consume / destroy |
| Open CDR Map | `lib/cdr.ts` | end/destroy paths |
| `/ws` intervals + listeners | `ws.ts` | teardown-before-await pattern |
| Temp TTS / recordings | `lib/tts`, retention/archive jobs | purge on boot + schedules |

## 10. Dependency direction (actual)

```
routes ──► lib ──► db
  │          │
  │          └──► asterisk
  └──────────────► asterisk ──► lib, db
jobs ──► lib, db, asterisk
db ──► lib (seed/reset crypto), asterisk (seed dialplan write)
shared ◄── api, web   (shared is a leaf)
web ──HTTP──► api     (no TS imports of api/src)
```

**File-level cycles (madge):** 0  
**Folder-level soft cycle:** `db ↔ lib` (documented; accepted for this monolith)

## 11. Largest modules (complexity hotspots)

| File | LOC | Rough branch density |
|---|---:|---:|
| `routes/admin-resources.ts` | 3202 | very high |
| `asterisk/config-writer.ts` | 1751 | high |
| `asterisk/flow-runtime.ts` | 1281 | high |
| `asterisk/ari.ts` | 814 | medium |
| `db/schema.ts` | 560 | low (declarations) |

See `MODULE_DEPENDENCIES.md` and metrics in `_metrics.json`.
