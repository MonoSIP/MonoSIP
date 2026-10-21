# MunaSIP

**Company PBX** — open-source Asterisk VoIP with an admin panel, a visual IVR designer and a browser softphone. Built for small offices (~20 extensions). Runs as one prebuilt Docker image (or Docker Compose) on a Linux VM.

[Install](docs/INSTALL.md) · [Features](docs/FEATURES.md) · [Architecture](docs/ARCHITECTURE.md) · [Website](site/index.html) · [Release v1.4.0](https://github.com/diggyen/MunaSIP/releases/tag/v1.4.0) · [MIT License](LICENSE)

Default UI language: **English** (Turkish available in the app).

## Quick start

Prebuilt image (linux/amd64, published on every release):

```bash
docker run -d --name munasip --restart unless-stopped \
  -p 3000:3000 -p 10000-10100:10000-10100/udp \
  -v munasip-data:/data \
  -e EXTERNAL_IP=<public IPv4> -e PUBLIC_HOST=<hostname> \
  ghcr.io/diggyen/munasip:latest
```

Recommended: 2 vCPU and 4 GB RAM (neural speech runs on the PBX CPU).

From source with Docker Compose:

```bash
git clone https://github.com/diggyen/MunaSIP.git
cd MunaSIP
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

- Extensions with one password for portal and SIP, trunks, inbound/outbound routes, blacklist  
- Ring groups, queues (position / hold-time announcements per language and voice, callback), schedules & holidays  
- Visual IVR designer: 17 node types, API lookups with encrypted secrets, speech filters, simulation, versions  
- Speech: Edge Neural voices and EMA (offline Turkish), sentence by sentence  
- Portal softphone that survives page changes, mini phone on every page, desk-phone provisioning  
- Live dashboard, spy/whisper, call logs with inline IVR timeline, recordings, reports  
- Security: 2FA, IP allowlists, login-flood ban, SIP guard; automatic Let’s Encrypt SSL from Settings  

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
| *(embedded)* | TTS runs inside `api` / all-in-one (Edge / EMA) |

Data survives rebuilds via named volumes (`pgdata`, `recordings`, …). See [INSTALL.md](docs/INSTALL.md).

## Production

Use Docker on Linux. Set `EXTERNAL_IP`, `PUBLIC_HOST`, strong secrets; then enable **Automatic SSL** in Admin → Settings. Desk phones → `EXTERNAL_IP:5060`.

Guide: **[docs/DEPLOY-VPS.md](docs/DEPLOY-VPS.md)**

## Documentation

All docs live under **[docs/](docs/README.md)**. Static product site: **[site/](site/index.html)** (open locally or publish with GitHub Pages → `/site`).

## License

MunaSIP is released under the **[MIT License](LICENSE)** — use, modify and redistribute it freely, keeping the copyright notice.

## Maintenance

Canonical repo: **[github.com/diggyen/MunaSIP](https://github.com/diggyen/MunaSIP)**, maintained by **[@diggyen](https://github.com/diggyen)**. This repository does not take third-party pull requests (see [.github/MAINTENANCE.md](.github/MAINTENANCE.md)); fork it freely under the MIT License.
