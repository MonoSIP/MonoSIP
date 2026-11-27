# MonoSIP

**Company PBX** — open-source Asterisk VoIP with an admin panel, a visual IVR designer and a browser softphone. Built for small offices (~20 extensions). Runs as one prebuilt Docker image (or Docker Compose) on a Linux VM.

[Install](docs/INSTALL.md) · [Features](docs/FEATURES.md) · [Architecture](docs/ARCHITECTURE.md) · [Website](https://www.monosip.com/) · [Release v1.9.8](https://github.com/MonoSIP/MonoSIP/releases/tag/v1.9.8) · [MIT License](LICENSE)

Default UI language: **English** (Turkish available in the app).

## Quick start

Prebuilt image (linux/amd64, published on every release):

```bash
docker run -d --name monosip --restart unless-stopped \
  -p 3000:3000 -p 10000-10100:10000-10100/udp \
  -v monosip-data:/data \
  -e EXTERNAL_IP=<public IPv4> -e PUBLIC_HOST=<hostname> \
  ghcr.io/monosip/monosip:latest
```

Sign in at `admin@example.com`. This image **generates a unique admin password on first start** and prints it once in its log — read it with `docker logs monosip` (on a hosting panel, open the service's Runtime logs):

```
============================================================
 MonoSIP first-run admin login (save it, change after login)
   email:    admin@example.com
   password: 4f3c…(unique)
============================================================
```

Change it under Settings → Admin sign-in after you log in. To choose the password yourself instead, pass `-e ADMIN_PASSWORD=<strong password>` on first run. All other secrets (session, encryption, Asterisk) are generated and persisted to the `/data` volume automatically — you set nothing.

Recommended: 2 vCPU and 4 GB RAM (neural speech runs on the PBX CPU).

From source with Docker Compose:

```bash
git clone https://github.com/MonoSIP/MonoSIP.git
cd MonoSIP
cp .env.example .env
chmod +x scripts/gen-certs.sh && ./scripts/gen-certs.sh
docker compose up --build -d
```

Open **https://localhost** (self-signed cert — accept the browser warning).

**Admin password (v1.9.7+)**

| How you run | Admin login | Password |
| --- | --- | --- |
| Prebuilt single image (`docker run` / GHCR) | `admin@example.com` | **Unique — printed once** in `docker logs` (`first-run admin login`). Not `Admin123!`. |
| Docker Compose lab (`.env.example`) | `admin@example.com` | `Admin123!` from `.env` — **lab only**; change before any real use |
| Portal (ext 101) | `101` | `portal101` (Compose / lab seed) |

To pick the admin password yourself on first boot of the single image, pass `-e ADMIN_PASSWORD=<strong password>`. Demo extensions are seeded once on an empty DB; deleting them and rebuilding will not recreate them (`MONOSIP_LAB_SEED=0` skips them on a fresh volume). Forgot the admin password later: `pnpm db:reset-admin` (Compose: `docker compose exec api pnpm db:reset-admin`; single image: `docker exec monosip pnpm db:reset-admin`) restores the **recovery** password `Admin123!` — sign in and change it immediately under Settings → Admin sign-in. See [INSTALL.md](docs/INSTALL.md).

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

All docs live under **[docs/](docs/README.md)**. The site is **[www.monosip.com](https://www.monosip.com)**; its source is **[site/](site/)** in this repository.

## License

MonoSIP is released under the **[MIT License](LICENSE)** — use, modify and redistribute it freely, keeping the copyright notice.
