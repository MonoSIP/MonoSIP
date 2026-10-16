# Backend API

Backend üç ayrı yüzey sunar: admin API, kullanıcı portalı API'si ve dış sistemler için entegrasyon API'si. Hepsi `/api/v1` altında; istek ve yanıtlar `packages/shared` içindeki Zod şemalarıyla doğrulanır.

## Admin API (`/api/v1/admin`, oturum + 2FA)

| Kaynak | Uçlar |
| --- | --- |
| Dahililer | `GET/POST /extensions`, `GET/PATCH/DELETE /extensions/:id`, `POST /extensions/import`, `GET /extensions/export`, `POST /extensions/:id/reset-password`, `PUT /extensions/:id/forwarding` |
| Cihazlar | `GET/POST /devices`, `GET /devices/:id/qr` |
| Zil grupları | `GET/POST /ring-groups`, `PATCH/DELETE /ring-groups/:id` |
| Kuyruklar | `GET/POST /queues`, `PATCH/DELETE /queues/:id`, `PUT /queues/:id/members`, `POST /queues/:id/members/:ext/pause` |
| Zaman planları | `GET/POST /schedules`, `PATCH /schedules/:id`, `PUT /schedules/:id/override`, `GET /holidays`, `POST /holidays/import` |
| Hatlar | `GET/POST /trunks`, `PATCH/DELETE /trunks/:id`, `GET /trunks/:id/status` |
| Rotalar | `GET/POST /routes/inbound`, `GET/POST /routes/outbound`, `PATCH/DELETE /routes/:kind/:id`, `GET/POST/DELETE /blacklist` |
| Akışlar | `GET/POST /flows`, `GET/PUT /flows/:id/draft`, `POST /flows/:id/validate`, `POST /flows/:id/publish`, `GET /flows/:id/versions`, `POST /flows/:id/rollback`, `POST /flows/:id/simulate`, `POST /flows/test-http` |
| Sesler | `GET/POST /prompts` (yükleme veya TTS), `GET/POST /moh` |
| Kayıtlar | `GET /recordings`, `GET /recordings/:id/stream`, `GET /recordings/:id/download`, `GET /recordings/:id/access-log` |
| Loglar | `GET /cdr`, `GET /cdr/export`, `GET /missed-calls`, `GET /calls/:id/timeline` |
| Canlı | `GET /live/calls`, `POST /live/calls/:id/spy` (dinle / fısılda / katıl), `POST /live/calls/:id/hangup` |
| Raporlar | `GET /reports/summary`, `/reports/queues`, `/reports/extensions`, `/reports/ivr` |
| Sistem | `GET/PATCH /settings`, `GET/POST /webhooks`, `GET/POST /api-keys`, `GET /audit-log`, `POST /backups`, `POST /system/reload` |

## Kullanıcı portalı API'si (`/api/v1/me`, dahili oturumu)

- `POST /auth/login` (dahili no + şifre), `POST /auth/logout`, `PATCH /me/password`
- `GET /me/sip-credentials`: softphone için kısa ömürlü bağlantı bilgisi
- `GET /me/calls`, `GET /me/missed-calls`
- `GET /me/recordings`, `GET /me/recordings/:id/stream` (yalnızca kendi kaydı, indirme başlığı yok)
- `GET /me/voicemails`, `GET /me/voicemails/:id/stream`, `PATCH /me/voicemails/:id`
- `GET/PUT /me/forwarding`, `PUT /me/dnd`
- `GET /me/directory`: rehber ve iş arkadaşlarının durumu

## Entegrasyon API'si (`/api/v1/ext`, API anahtarı)

- `POST /calls/originate`: click-to-call (önce dahili çalar, açınca numarayı arar)
- `GET /cdr`, `GET /recordings/:id/stream`
- Webhook olayları: `call.ringing`, `call.answered`, `call.ended`, `call.missed`; HMAC imzalı gövde, 3 deneme.

## WebSocket (`/ws`)

- Admin: `call.*`, `queue.*` (bekleyen, üye durumu), `extension.state`, `trunk.state`, `alert.*`
- Portal: `presence.*` (iş arkadaşları), `voicemail.new`, `missed.new`
- Olaylar AMI ve ARI'den toplanır, backend tarafından süzülerek yayınlanır.
