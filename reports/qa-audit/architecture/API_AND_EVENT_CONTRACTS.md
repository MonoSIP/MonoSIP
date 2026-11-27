# API and Event Contracts

## Request / response schemas

- Primary contracts: `@monosip/shared` Zod schemas (`schemas.ts`, `flow.ts`, `destinations.ts`).
- Route handlers parse with `.parse` / `.safeParse` on admin and portal bodies.
- Error envelope: `{ error: string }` (hardened global handler — no raw stack in prod).

## Versioning

| Surface | Versioning |
|---|---|
| HTTP | Prefix `/api/v1/...` — single major; no per-resource version negotiation |
| WebSocket messages | `{ type, payload, at }` — types are string literals, unversioned |
| Webhooks | Row in `webhooks` + payload from call events — no schema version field |
| Flow JSON | Implicit via Zod; no `schemaVersion` field on saved flows |

**Finding (P2):** Flow definitions lack an explicit schema version — migrations of node `data` shapes rely on tolerant readers.

## WebSocket message types (observed)

| Type | Audience | Source |
|---|---|---|
| `hello` | all | ws.ts |
| `error` | unauth | ws.ts |
| `ping` | all | interval |
| `call.update` | admin | ari `calls` |
| `extension.state` / `presence.update` | admin / portal | ari |
| `trunk.state` | admin | ari / trunk-monitor |
| `queue.update` | admin | poll + AMI |
| `alert` | admin | trunk down etc. |
| `voicemail.new` / `missed.new` | owning extension | liveEvents |

No separate protobuf/Avro layer — JSON only.

## Internal / dialplan contracts

- Dialplan `curl` posts JSON into admin/internal ingest (CDR + MixMonitor path).  
- Auth: `requireInternalSecret` (constant-time compare).  
- Shape: callId, billsec, disposition, mos, … (stringly typed from Asterisk variables).

## Idempotency

| Path | Behavior |
|---|---|
| CDR finalize | Upsert-ish update by `callId`; duplicate posts update same row |
| Recording store | Keep/discard gates; purge can run twice safely |
| Queue callback job | Processes pending rows; relies on status transitions |
| Webhook delivery | Not a durable outbox with idempotency keys (best-effort) |

**Finding (P2):** No general Idempotency-Key header on mutating admin APIs — acceptable for UI-driven admin; weaker for integration API if clients retry.

## Duplicate event processing

- ARI reconnect can redeliver events; handlers are mostly set-state not append-only.  
- `liveEvents` is fire-and-forget to connected WS clients.  
- `call_events` table exists for append-only history where written.

## Incompatible change detection

- Architecture suite does **not** yet snapshot OpenAPI.  
- Practical gate: shared Zod + web/api unit tests + e2e.  
- Recommendation: optional Zod→OpenAPI export later (P3) — do not invent a microservices contract registry.

## Actor contract summary

| Actor | Credential | Can access |
|---|---|---|
| Admin | session cookie | `/api/v1/admin/*`, full WS |
| Extension | session cookie | `/api/v1/me/*`, filtered WS |
| API key | bearer / header | integration routes |
| Internal | shared secret | dialplan callbacks |
| Widget | widget session | widget + softphone proxy |
