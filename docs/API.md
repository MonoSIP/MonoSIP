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

- `POST /calls/originate`: click-to-call (rings extension first, then dials the number)
- `GET /cdr`, `GET /recordings/:id/stream`
- Webhook events: `call.ringing`, `call.answered`, `call.ended`, `call.missed`; HMAC-signed body, 3 retries

## WebSocket (`/ws`)

- Admin: `call.*`, `queue.*` (waiters, member state), `extension.state`, `trunk.state`, `alert.*`
- Portal: `presence.*` (coworkers), `voicemail.new`, `missed.new`
- Events are collected from AMI and ARI, filtered by the backend, then fan-out
