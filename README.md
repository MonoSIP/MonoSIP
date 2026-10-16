# DSip — Company PBX

Open-source Asterisk-based VoIP PBX with an admin panel and user portal. Runs as a Docker Compose stack on a company VM (~20 extensions).

**Default language: English** (Turkish also available in the UI).

## Quick start

```bash
cp .env.example .env
chmod +x scripts/gen-certs.sh
./scripts/gen-certs.sh
docker compose up --build -d
```

Open **https://localhost** (self-signed certificate — accept the browser warning).

| Role | Login | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `Admin123!` |
| Portal (ext 101) | `101` | `portal101` |
| Portal (ext 100–103) | extension number | `portal{number}` |

## Stack

| Service | Role |
| --- | --- |
| `nginx` | HTTPS + reverse proxy (API, web, Asterisk WSS) |
| `web` | Admin panel + user portal (React) |
| `api` | Fastify API, ARI flow engine, Asterisk config writer |
| `asterisk` | Asterisk 22 (PJSIP, ARI, AMI, WebRTC) |
| `postgres` | Settings, CDR, flows |
| `coturn` | TURN for off-site softphone |
| `tts` | Piper TTS (open-source) — Turkish + English prompt WAV generation |
| `fail2ban` | Optional profile (`--profile fail2ban`) — Asterisk auth jail |

## Development (without rebuilding images)

```bash
pnpm install
pnpm --filter @dsip/shared build
# start only infra
docker compose up -d postgres asterisk coturn
# run API + web locally
export DATABASE_URL=postgresql://dsip:dsip_secret_change_me@localhost:5432/dsip
pnpm --filter @dsip/api run db:generate
pnpm --filter @dsip/api run db:migrate
pnpm --filter @dsip/api run db:seed
pnpm dev
```

## Docs

See [docs/](docs/) and [TASKS.md](TASKS.md) for the full product specification.

## Deploy on a VPS (phones)

**Use Docker on Linux** — that is the supported production path. The local Mac softphone NAT quirk does not apply on a normal Linux VM. See **[docs/DEPLOY-VPS.md](docs/DEPLOY-VPS.md)**.

Minimal `.env` for a public VM:

```env
EXTERNAL_IP=YOUR.PUBLIC.IPV4
PUBLIC_HOST=pbx.example.com
PUBLIC_URL=https://pbx.example.com
SIP_DOMAIN=pbx.example.com
SIP_WSS_URL=wss://pbx.example.com/asterisk-ws
TURN_REALM=pbx.example.com
```

Then open firewall ports (443, and SIP/RTP only for office/VPN/trunk), `docker compose up --build -d`, and point desk phones at `EXTERNAL_IP:5060` with the extension SIP password from the portal.

## Notes

- Add a real SIP trunk in **Trunks** and enable it for external calls.
- Softphone needs microphone permission over HTTPS.
- Optional env: `RECORDING_ARCHIVE_PATH` (or Settings `recordingArchivePath`), SMTP fields in Settings for daily summary (log-only if unset).
- Fail2ban lab: `docker compose --profile fail2ban up -d` (Asterisk + API security logs).
- Host firewall: Admin → Settings → Security export, or `scripts/harden-firewall.sh`.
- **TTS:** Admin → Prompts → text + language (TR/EN) → Generate. Uses local [Piper](https://github.com/rhasspy/piper) (`tr_TR-fettah-medium`, `en_US-lessac-medium`). No cloud API keys.
