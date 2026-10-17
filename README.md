# DSip

**Company PBX** — open-source Asterisk VoIP with an admin panel and browser softphone. Built for small offices (~20 extensions). Runs as Docker Compose on a Linux VM.

[Install](docs/INSTALL.md) · [Features](docs/FEATURES.md) · [Architecture](docs/ARCHITECTURE.md) · [Website](site/index.html) · [Release v1.0.0](https://github.com/diggyen/DSip/releases/tag/v1.0.0)

Default UI language: **English** (Turkish available in the app).

## Quick start

```bash
git clone https://github.com/diggyen/DSip.git
cd DSip
cp .env.example .env
chmod +x scripts/gen-certs.sh && ./scripts/gen-certs.sh
docker compose up --build -d
```

Open **https://localhost** (self-signed cert — accept the browser warning).

| Role | Login | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `Admin123!` |
| Portal (ext 101) | `101` | `portal101` |

Lab passwords only — change them for production.

## What you get

- Extensions, trunks, inbound/outbound routes, blacklist  
- Ring groups, queues (announce + callback), schedules & holidays  
- Visual IVR / flow designer (ARI)  
- Portal softphone (SIP.js + coturn), desk-phone provisioning  
- Live dashboard, spy/whisper, CDR, recordings, reports  
- Hostname + automatic Let’s Encrypt SSL from Settings  

Full list: **[docs/FEATURES.md](docs/FEATURES.md)**

## Stack

| Service | Role |
| --- | --- |
| `nginx` | HTTPS, ACME, reverse proxy (API, web, Asterisk WSS) |
| `web` | Admin + portal (React) |
| `api` | Fastify, ARI flow engine, config writer, SSL client |
| `asterisk` | Asterisk 22 (PJSIP, ARI, AMI, WebRTC) |
| `postgres` | Settings, CDR, flows (**persistent volume**) |
| `coturn` | TURN for off-site softphone |
| `tts` | Piper TTS (TR/EN prompts) |

Data survives rebuilds via named volumes (`pgdata`, `recordings`, …). See [INSTALL.md](docs/INSTALL.md).

## Production

Use Docker on Linux. Set `EXTERNAL_IP`, `PUBLIC_HOST`, strong secrets; then enable **Automatic SSL** in Admin → Settings. Desk phones → `EXTERNAL_IP:5060`.

Guide: **[docs/DEPLOY-VPS.md](docs/DEPLOY-VPS.md)**

## Documentation

All docs live under **[docs/](docs/README.md)**. Static product site: **[site/](site/index.html)** (open locally or publish with GitHub Pages → `/site`).

## License / ownership

Maintained by [@diggyen](https://github.com/diggyen).
