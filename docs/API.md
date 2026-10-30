# Backend API

The backend exposes three surfaces: admin API, user portal API, and an integration API for external systems. All under `/api/v1`; request/response bodies are validated with Zod schemas in `packages/shared`.

## Admin API (`/api/v1/admin`, session + 2FA)

| Resource | Endpoints |
| --- | --- |
| Extensions | `GET/POST /extensions`, `GET/PATCH/DELETE /extensions/:id`, `POST /extensions/import`, `GET /extensions/export`, `POST /extensions/:id/reset-password`, `PUT /extensions/:id/forwarding` |
| Devices | `GET/POST /devices`, `GET /devices/:id/qr` |
| Ring groups | `GET/POST /ring-groups`, `PATCH/DELETE /ring-groups/:id` |
| Queues | `GET/POST /queues`, `PATCH/DELETE /queues/:id`, `PUT /queues/:id/members`, `POST /queues/:id/members/:ext/pause` |
| Schedules | `GET/POST /schedules`, `PATCH /schedules/:id`, `PUT /schedules/:id/override`, `GET /holidays`, `POST /holidays/import` |
| Trunks | `GET/POST /trunks`, `PATCH/DELETE /trunks/:id`, `GET /trunks/:id/status` |
| Routes | `GET/POST /routes/inbound`, `GET/POST /routes/outbound`, `PATCH/DELETE /routes/:kind/:id`, `GET/POST/DELETE /blacklist` |
| Flows | `GET/POST /flows`, `GET/PUT /flows/:id/draft`, `POST /flows/:id/validate`, `POST /flows/:id/publish`, `GET /flows/:id/versions`, `POST /flows/:id/rollback`, `POST /flows/:id/simulate`, `POST /flows/test-http` |
| Prompts | `GET/POST /prompts` (upload or TTS), `GET/POST /moh` |
| Recordings | `GET /recordings`, `GET /recordings/:id/stream`, `GET /recordings/:id/download`, `GET /recordings/:id/access-log` |
| Logs | `GET /cdr`, `GET /cdr/export`, `GET /missed-calls`, `GET /calls/:id/timeline` |
| Live | `GET /live/calls`, `POST /live/calls/:id/spy` (listen / whisper / barge), `POST /live/calls/:id/hangup` |
| Reports | `GET /reports/summary`, `/reports/queues`, `/reports/extensions`, `/reports/ivr` |
| System | `GET/PATCH /settings`, `GET/POST /webhooks`, `GET/POST /api-keys`, `GET /audit-log`, `POST /backups`, `POST /system/reload` |

## User portal API (`/api/v1/me`, extension session)

- `POST /auth/login` (extension + password), `POST /auth/logout`, `PATCH /me/password`
- `GET /me/sip-credentials`: short-lived softphone credentials
- `GET /me/calls`, `GET /me/missed-calls`
- `GET /me/recordings`, `GET /me/recordings/:id/stream` (own recordings only; no download header)
- `GET /me/voicemails`, `GET /me/voicemails/:id/stream`, `PATCH /me/voicemails/:id`
- `GET/PUT /me/forwarding`, `PUT /me/dnd`
- `GET /me/directory`: directory and coworker presence

## Integration API (`/api/v1/ext`, API key)

- Auth: send the key in `X-Api-Key` or `Authorization: Bearer`, and the barrier in `X-Api-Barrier`. The name is a label. The key is listed; the barrier is shown once and stored only as a hash. A wrong key or barrier is the same 401. Expiry, the IP allowlist, and a per-address limit on failed attempts apply to every integration route. Empty IP list, prefixes, and call caps still mean unlimited.
- `POST /calls/originate`, `GET /cdr` and `GET /recordings/:id/stream` use the same key and barrier. The key needs `originate`, `cdr`, or `recordings`.
- `POST /calls/originate`: `number` is 2 to 20 digits, so an extension such as `101` is a valid destination. Permission `originate`.
- `POST /calls/announce`: dial a number and speak text. Permission `announce`. Body: `number` (2 to 20 digits; an existing extension is rung directly, anything else goes out through a SIP provider), `text`, `language` (`en`|`tr`), `voice` (`female`|`male`|`ema`), `mode` (`answered`|`played`|`dtmf`), optional `callerId`, optional `https` `webhookUrl`. Returns `{ id }` immediately. EMA is Turkish only. Key IP list, number prefixes, calls-per-minute and concurrent cap are empty-means-unlimited. A number that matches an extension is not subject to the prefix list.
- `GET /calls/:id`: status of an announcement this key placed, including `ok`, `reason`, `digits`, `recordingId`
- `GET /calls/:id/recording`: stream that announcement's recording
- Panel webhook events: `call.ringing`, `call.answered`, `call.ended`, `call.missed`; HMAC-signed body, 3 retries
- Announcement result is a separate POST to the request's `webhookUrl` (`x-monosip-event: announce.done`), not the panel subscription

## WebSocket (`/ws`)

- Admin: `call.*`, `queue.*` (waiters, member state), `extension.state`, `trunk.state`, `alert.*`
- Portal: `presence.*` (coworkers), `voicemail.new`, `missed.new`
- Events are collected from AMI and ARI, filtered by the backend, then fan-out
