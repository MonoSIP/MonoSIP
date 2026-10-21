# Installation

MunaSIP runs as a **Docker Compose** stack. Supported production path: Linux VM (Debian/Ubuntu). Local Mac is fine for the admin panel; desk phones and RTP work best on a real VPS.

## Requirements

| Item | Notes |
| --- | --- |
| Docker Engine + Compose v2 | `docker.io` + `docker-compose-v2` on Debian/Ubuntu |
| ~2–4 vCPU, 4–8 GB RAM | Enough for ~20 extensions |
| Ports | `443` (panel + WSS), `80` (ACME / redirect), SIP/RTP as needed |
| Git | To clone this repository |

## Lab install (localhost)

```bash
git clone https://github.com/MunaSIP/MunaSIP.git
cd MunaSIP
git checkout v1.7.4   # or main

cp .env.example .env
chmod +x scripts/gen-certs.sh
./scripts/gen-certs.sh

docker compose up --build -d
```

Open **https://localhost** and accept the self-signed certificate warning.

| Role | Login | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `Admin123!` |
| Portal | `101` | `portal101` |
| Portal | `100`–`103` | `portal{number}` |

Change these passwords before any production use.

### Useful commands

```bash
docker compose ps
docker compose logs -f api
curl -sk https://localhost/api/v1/health
docker compose down          # stop (keeps volumes)
docker compose down -v       # stop AND delete DB/recordings volumes
```

## Deploy on any platform (single Docker image)

The whole product ships as **one image** built from the root `Dockerfile` with the
**repository root** as build context — the universal default, so it works on any
Docker-based host (Render, Railway, Fly.io, Coolify, Dokploy, CapRover,
DigitalOcean App Platform, NineDeploy, a plain VM, …) with no platform-specific config:

```bash
docker build -t munasip .
docker run -d -p 3000:3000 -p 10000-10100:10000-10100/udp -v munasip-data:/data munasip
```

### Prebuilt image (GitHub Container Registry)

Every push to `main` and every `vX.Y.Z` tag publishes the same image to GHCR
(`.github/workflows/docker.yml`, linux/amd64), so you can skip the build:

```bash
docker run -d --name munasip --restart unless-stopped \
  -p 3000:3000 -p 10000-10100:10000-10100/udp \
  -v munasip-data:/data \
  -e EXTERNAL_IP=<public IPv4> -e PUBLIC_HOST=<hostname> \
  ghcr.io/munasip/munasip:latest
```

| Tag | Source |
| --- | --- |
| `latest`, `X.Y.Z`, `X.Y` | release tags (`vX.Y.Z`) |
| `main` | tip of `main` |
| `sha-<short>` | a specific commit |

Update: `docker pull ghcr.io/munasip/munasip:latest`, then recreate the container — data
stays in the `munasip-data` volume.

**PaaS without building (NineDeploy, Coolify, …):** create the service from the
image `ghcr.io/munasip/munasip:latest` instead of the Git repository, mount `/data`,
expose port 3000 (+ UDP 10000-10100) and set `PUBLIC_HOST` / `EXTERNAL_IP`. Deploys
then only pull (~1 min) instead of building torch + TTS models (~10 min, ~4 GB of
build layers left on the host per deploy). On NineDeploy enable **Auto-update** so a
new `:latest` digest redeploys automatically; pin `:X.Y.Z` to upgrade manually.

What every platform needs:

- **Dockerfile:** repo root `Dockerfile` (leave the build context at the repo root — the default; if a panel defaults to a subdirectory, clear its **baseDir** so context is `.`, otherwise `COPY` paths fail)
- **Persistent volume** mounted at `/data` (DB, Asterisk config, recordings, secrets)
- **Port 3000** published for HTTPS/API/web/softphone signalling (`/asterisk-ws`)
- **UDP 10000-10100** published + `EXTERNAL_IP` set for softphone audio (RTP); or run coturn and enable TURNS on 443 for strict edges
- Optional `DATABASE_URL` for managed Postgres (otherwise embedded Postgres runs under `/data/postgres`)

`.ninedeploy` is an optional convenience manifest for NineDeploy (volume, ports, RAM
hints); it is **not** required to build or run anywhere else.

### One-click image deploy

The API image is **all-in-one**: Node API + web SPA + embedded Postgres + **Asterisk** + **TTS** (Edge / EMA on `127.0.0.1:5500`; ARI/WSS on `127.0.0.1:8088` only; public HTTPS must hit container **port 3000**, softphone via `/asterisk-ws`). Desk-phone UDP SIP usually needs a VPS with published `5060`/RTP — a PaaS edge typically only exposes HTTPS→3000.

No env is required for a first boot:

- If `DATABASE_URL` is unset, the image starts **embedded Postgres** under `/data/postgres` (persists **only** if the **/data volume is persistent**)
- Embedded **Asterisk** starts unless `ASTERISK_ARI_URL` points at another host (Compose sets `http://asterisk:8088`)
- `SESSION_SECRET` / `ENCRYPTION_KEY` / ARI·AMI passwords are generated and stored in `/data/.munasip-secrets` — **do not lose this file** or encrypted SIP secrets become unreadable
- Asterisk dialplan/PJSIP config persists under `/data/asterisk`
- Mount a persistent volume at `/data` (4 GB RAM recommended). Check deploy logs for `secrets=1 pg_cluster=1` (both 0 every deploy ⇒ volume not sticking)
- **NineDeploy:** set Service → Volume mount path to `/data` in the UI (the `.ninedeploy` `volume.mount` entry only configures backups — it does **not** attach the disk). Without this, every Deploy recreates an empty `/data` on the overlay and all settings/trunks vanish
- Boot **never wipes** an existing Postgres cluster on start failure (set `MUNASIP_PG_WIPE_ON_FAIL=1` only after a backup if you intentionally reset)
- Demo SIP trunk is **not** auto-seeded (set `MUNASIP_LAB_SEED=1` for lab only)
- With `PUBLIC_HOST` set (or `MUNASIP_REQUIRE_PERSISTENT_DATA=1`), boot **refuses** to start if `/data` is not a real volume (prevents silent wipe). Lab-only escape: `MUNASIP_ALLOW_EPHEMERAL_DATA=1`

Default admin (change after login): `admin@example.com` / `Admin123!`

**Vault (recommended for a public host such as `pbx.example.com`):**

```env
PUBLIC_HOST=pbx.example.com
PUBLIC_URL=https://pbx.example.com
SIP_DOMAIN=pbx.example.com
SIP_WSS_URL=wss://pbx.example.com/asterisk-ws
EXTERNAL_IP=<public IPv4 of the host>
ADMIN_PASSWORD=<strong password>
```

**Softphone audio (WebRTC):** SIP over WSS works through HTTPS. Media is UDP RTP to Asterisk, and when behind corporate firewalls the softphone also uses **TURNS on port 443**.

**Docker Compose:** nginx multiplexes TLS on `:443` by ALPN — browsers (HTTPS/WSS) vs TURNS (empty ALPN → coturn `:5349`). Set `TURN_SECRET` (shared with the API) and `EXTERNAL_IP`. Softphone fetches `/api/v1/ice-servers` automatically.

**PaaS edge without ALPN mux (e.g. Traefik):** publish host **UDP 10000–10100** for RTP, set `EXTERNAL_IP`, then `MUNASIP_RTP_PUBLISHED=1`. Optionally set `MUNASIP_TURNS_ON_443=0` and skip `TURN_SECRET` (STUN-only). Deploy logs and `/api/v1/health.media` warn when RTP ports are missing.

**Website widgets:** Admin → Integrations → create a widget, copy the embed `<script src="https://…/widget.js" data-widget="w_…">`.

**Strongly recommended:** attach a managed Postgres and set `DATABASE_URL` (or `POSTGRES_URL`) in the vault — embedded Postgres is then skipped and survives image rebuilds/major PG upgrades without risk of an empty lab seed.

## Production (VPS)

1. Set public identity in `.env`:

```env
EXTERNAL_IP=203.0.113.10
PUBLIC_HOST=pbx.example.com
PUBLIC_URL=https://pbx.example.com
SIP_DOMAIN=pbx.example.com
SIP_WSS_URL=wss://pbx.example.com/asterisk-ws
TURN_REALM=pbx.example.com

POSTGRES_PASSWORD=…          # strong
SESSION_SECRET=…             # ≥32 random chars
ENCRYPTION_KEY=…             # 64 hex chars
ADMIN_PASSWORD=…
ASTERISK_ARI_PASSWORD=…
ASTERISK_AMI_PASSWORD=…
```

2. Start the stack: `docker compose up --build -d`

3. **TLS:** Admin → **Settings → Hostname & SSL** — set the public hostname, enable **Automatic SSL** (Let's Encrypt). Port `80` must reach the server.  
   Offline lab only: `./scripts/gen-certs.sh`

4. Open firewall: `443/tcp`, `80/tcp`; lock `5060` + RTP to office/VPN/trunk. Details: [DEPLOY-VPS.md](DEPLOY-VPS.md).

5. Point desk phones at `EXTERNAL_IP:5060` using the SIP password from the portal.

## Persistent data

Compose **named volumes** keep state across rebuilds:

| Volume | Contents |
| --- | --- |
| `pgdata` | PostgreSQL (extensions, CDR, flows, settings) |
| `recordings` | Call recordings |
| `uploads` | Prompt / MOH uploads |
| `asterisk_config` | Generated dialplan / PJSIP |
| `./docker/nginx/certs` | TLS certificates (bind mount) |

`docker compose up --build` does **not** wipe volumes. Only `docker compose down -v` does.

## Upgrading from DSip (before the MunaSIP rename)

**Single image:** nothing to do. On the first start the image renames what it
finds under the old name: `/data/.dsip-secrets`, the embedded Postgres role and
database `dsip`, the generated `*_dsip.conf` files and the `sounds/dsip` folder
(stored file paths are updated by a migration). `DSIP_*` environment variables
keep working; `MUNASIP_*` wins when both are set. Browser sessions and saved
preferences carry over. Point your deployment at `ghcr.io/munasip/munasip`.

**Docker Compose:** the Postgres service keeps its existing user and database,
so either keep the old names in `.env`

```env
POSTGRES_USER=dsip
POSTGRES_DB=dsip
```

or rename them once (`ALTER ROLE dsip RENAME TO munasip;` and
`ALTER DATABASE dsip RENAME TO munasip;` while the API is stopped). The Asterisk
config volume is now mounted at `/var/lib/asterisk/munasip`; the API renames the
old `*_dsip.conf` files and the `sounds/dsip` folder on its next start.

## Optional services

```bash
# Asterisk + API login jail
docker compose --profile fail2ban up -d
```

## Development (API / web on the host)

```bash
pnpm install
pnpm --filter @munasip/shared build
docker compose up -d postgres asterisk coturn tts
export DATABASE_URL=postgresql://munasip:munasip_secret_change_me@localhost:5432/munasip
pnpm --filter @munasip/api run db:migrate
pnpm --filter @munasip/api run db:seed
pnpm dev
```

## Next steps

- [FEATURES.md](FEATURES.md) — what the product does  
- [ARCHITECTURE.md](ARCHITECTURE.md) — services and data flow  
- [DEPLOY-VPS.md](DEPLOY-VPS.md) — phones, NAT, firewall  
