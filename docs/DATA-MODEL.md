# Data model

All settings live in PostgreSQL; Asterisk config is generated from here. Destination fields use the same pair everywhere: `dest_type` + `dest_id`.

| Table | Main fields |
| --- | --- |
| `extensions` | number, name, email, sip_secret (encrypted), portal_password_hash, portal_enabled, recording_mode, recording_listen_allowed, outbound_cli, call_permissions, mobile_forward_allowed, dnd, voicemail_pin |
| `extension_forwarding` | extension_id, status (no_answer / busy / unavailable), ring_seconds, dest_type, dest_id |
| `devices` | extension_id, model, mac, provisioning_profile, last register time |
| `ring_groups` | name, number, strategy, ring time, unanswered destination |
| `ring_group_members` | ring_group_id, extension_id, order |
| `queues` | name, number, strategy, member_timeout, wrapup, max_wait, max_callers, announce settings, moh_id, schedule_id, overflow destinations, callback_enabled |
| `queue_members` | queue_id, extension_id, penalty, paused, pause_reason |
| `schedules` | name, timezone, override_mode, override_until |
| `schedule_ranges` | schedule_id, day, start, end, status (open / lunch) |
| `holidays` | schedule_id (null = global), date, half-day flag, name |
| `trunks` | name, host, port, transport, auth_type, username, secret (encrypted), codecs, max_channels, number format rules, status |
| `inbound_routes` | did, caller_pattern, priority, dest_type, dest_id |
| `outbound_routes` | name, pattern, prefix rewrite, ordered trunk list, required permission |
| `blacklist` | number or pattern, direction, note |
| `flows` | name, draft_json, published_version_id |
| `flow_versions` | flow_id, version number, json, published_at |
| `secrets` | encrypted tokens/passwords for API nodes |
| `prompts` | name, language, file path, TTS source |
| `moh_classes` | name, files |
| `cdr` | call_id (linkedid), start, answer, end, direction, caller, callee, did, extension, queue, disposition, duration, trunk_id, recording_id, dnd_flag, quality (jitter, loss, MOS) |
| `call_events` | call_id, time, type, data (CEL and flow steps; IVR DTMF reports come from here) |
| `queue_events` | Asterisk `queue_log` rows |
| `recordings` | call_id, file path, duration, size, deleted_at, archived flag |
| `recording_access_log` | recording_id, who (admin / extension), time |
| `missed_calls` | number, destination, time, status (waiting / called_back), return call_id |
| `voicemails` | extension_id, caller, time, file, read flag |
| `spend_limits` | scope (global / extension), daily and monthly limits, current usage |
| `webhooks` | URL, event types, signing key, active flag |
| `api_keys` | name, hash, permissions, last used |
| `audit_log` | actor, action, object, before/after, IP, time |
| `settings` | global settings (KVKK retention, SMTP, backup, IP restrictions, hostname/SSL) |
