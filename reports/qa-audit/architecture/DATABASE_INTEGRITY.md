# Database Integrity

## Schema inventory

- **Location:** `apps/api/src/db/schema.ts` (40 `pgTable`s)
- **Migrations:** `apps/api/drizzle/0000_*.sql` … `0018_*.sql` + `meta/`
- **ORM:** Drizzle 0.45.x

## Foreign keys with `onDelete: "cascade"`

| Child | Parent | Evidence |
|---|---|---|
| `extension_forwarding.extension_id` | `extensions` | schema ~L69–71 |
| `devices.extension_id` | `extensions` | ~L80–82 |
| `ring_group_members.*` | ring_groups / extensions | ~L105–108 |
| `queue_members.*` | queues / extensions | ~L142–145 |
| `schedule_ranges.schedule_id` | schedules | ~L171 |
| `holidays.schedule_id` | schedules | ~L180–181 |
| `flow_versions.flow_id` | flows | ~L270 |
| `recording_access_log.recording_id` | recordings | ~L376–378 |
| `voicemails.extension_id` | extensions | ~L400 |
| `announce_calls.api_key_id` | api_keys | migration 0015 |
| `widget_sessions.widget_id` | web_widgets | ~L536 |
| `widget_daily_stats.widget_id` | web_widgets | ~L553 |

Base migration mirrors these (`0000_wakeful_warbound.sql` ALTER … FOREIGN KEY … CASCADE).

## Intentional soft references (no FK)

| Column | Why soft |
|---|---|
| `cdr.trunk_id`, `cdr.recording_id` | CDR must survive trunk/recording deletion for history |
| `sessions.actor_id` | Polymorphic admin \| extension |
| `flows.published_version_id` | Avoid cycle with `flow_versions` |
| `*.dest_type` / `dest_id` (inbound, forwarding, widgets) | Polymorphic destinations |
| `extensions.boss_secretary_of` | Self-ref optional; not declared as FK |
| `announce_calls.recording_id` | Optional; row may outlive file |

Locked by `architecture/schema-integrity.test.ts`.

## Indexes vs hot paths

| Index | Table | Purpose |
|---|---|---|
| `cdr_started_idx` | cdr | Reports / retention windows |
| `cdr_call_id_uidx` (**UNIQUE**) | cdr | One CDR per UNIQUEID; ingest idempotency |
| `extensions_number_idx` | extensions | Dialplan / portal lookup |
| sessions.token UNIQUE | sessions | Auth hot path |
| widget_sessions sip_user UNIQUE | widgets | Softphone session |

## Orphan / dead structures

| Finding | Severity | Evidence |
|---|---|---|
| `recordings.delete_at` never written or read | P2 | Only in schema L369; retention uses `createdAt` |
| `queue_events` table never inserted/selected in app code | P2 | schema L353–361; `rg insert(queueEvents)` → empty |
| `cdr.trunk_id` never written by app code | P2 | schema L332; only `outbound_routes.trunk_ids` jsonb is used |
| CDR `recording_id` can dangle if delete skips nulling | INFO | `recording-files.ts` nulls on purge; no DB FK enforce |

## Additional soft refs (confirmed)

| Column | Notes |
|---|---|
| `flows.published_version_id` | Avoids FK cycle with `flow_versions` |
| `extensions.boss_secretary_of` | Self-ref used in dialplan writer; no FK |
| `queues.moh_id`, `queues.schedule_id` | Resolved at config-write time |
| Polymorphic `dest_type`+`dest_id` | Cannot be a single FK |

## Index gaps vs hot paths

| Path | Coverage |
|---|---|
| CDR by `started_at` / `call_id` | Unique index `cdr_call_id_uidx` (Phase 1 hardening) |
| Recordings join by `callId` (admin list) | **No** index — **Seq Scan** on 200-row lab sample |
| Portal CDR by extension/caller/callee | **No** covering index |
| `call_events` by `callId` / `type` | **No** indexes |
| Recording retention by `created_at` | **No** index (OK at small scale) |

**Draft migration (not applied):** `apps/api/drizzle/0019_arch_hotpath_indexes.sql.draft`  
Full validation write-up: `VALIDATION_HARDENING.md`.

## Cascade risk assessment

Cascades are confined to **membership and satellite** rows (devices, members, flow versions, access log). They do **not** cascade-delete CDR or recordings when an extension is removed — correct for a PBX audit trail. Deleting a recording cascades access-log only.

## Transaction boundaries

- Most admin mutations are single-statement or short sequences without explicit `db.transaction`.
- Schedule replace (delete ranges + insert) in `admin-resources.ts` is multi-step — concurrent edits can interleave (P2 maintainability, not observed as prod incident in prior QA).
- Recording purge nulls `cdr.recordingId` then deletes row — order is safe for soft FK.

## Migration consistency

- Sequential numbered SQL migrations through `0018_`.
- Architecture tests assert base FK names still present.
- Repeated migrate: Drizzle journal in `meta/` — standard; not re-audited destructively here.

## Retention / deletion policies

| Data | Policy | Owner |
|---|---|---|
| Recordings | Age months from settings; archive-aware | `jobs/retention.ts` |
| Sessions | Delete where `expiresAt < now` | `pruneExpiredSessions` |
| TTS cache | Boot + expiry | `lib/tts.ts` |
| Empty recordings | Boot purge | `purgeZeroSecondRecordings` |
| `deleteAt` column | **Unused** | — |

## Concurrent updates

- Trunk monitor updates status every 60s; last-write-wins.
- Live CDR open-map in process memory (`lib/cdr.ts`) — single API process assumption (Docker one container). Multi-instance would need external coordination (INFO for scale-out).
