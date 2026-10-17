# Installation

DSip runs as a **Docker Compose** stack. Supported production path: Linux VM (Debian/Ubuntu). Local Mac is fine for the admin panel; desk phones and RTP work best on a real VPS.

## Requirements

| Item | Notes |
| --- | --- |
| Docker Engine + Compose v2 | `docker.io` + `docker-compose-v2` on Debian/Ubuntu |
| ~2–4 vCPU, 4–8 GB RAM | Enough for ~20 extensions |
| Ports | `443` (panel + WSS), `80` (ACME / redirect), SIP/RTP as needed |
| Git | To clone this repository |

## Lab install (localhost)

```bash
git clone https://github.com/diggyen/DSip.git
cd DSip
git checkout v1.2.0   # or main

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

## NineDeploy / remote Docker build

The API Dockerfile expects the **repository root** as build context (it needs `packages/shared` and `pnpm-workspace.yaml`):

```bash
docker build -f apps/api/Dockerfile .
```

A `.ninedeploy` manifest is in the repo root with `build.dockerfile: apps/api/Dockerfile`.  
If the panel still builds with context `apps/api`, clear **baseDir** / subdirectory settings so context is `.` — otherwise `COPY` paths fail.

### NineDeploy (one-click)

The API image is **all-in-one**: Node API + web SPA + embedded Postgres + **Asterisk** (ARI/WSS bound to `127.0.0.1:8088` only; public HTTPS must hit container **port 3000**, softphone via `/asterisk-ws`). Desk-phone UDP SIP usually needs a VPS with published `5060`/RTP — NineDeploy typically only exposes HTTPS→3000.

Press **Deploy**. No panel env is required for a first boot:

- If `DATABASE_URL` is unset, the image starts **embedded Postgres** under `/data/postgres`
- Embedded **Asterisk** starts unless `ASTERISK_ARI_URL` points at another host (Compose sets `http://asterisk:8088`)
- `SESSION_SECRET` / `ENCRYPTION_KEY` / ARI·AMI passwords are generated and stored in `/data/.dsip-secrets`
- Asterisk dialplan/PJSIP config persists under `/data/asterisk`
- `.ninedeploy` mounts persistent volume `/data` (~2.5 GB RAM recommended)

Default admin (change after login): `admin@example.com` / `Admin123!`

**Vault (recommended for a public host such as `dsip.gatex.uk`):**

```env
PUBLIC_HOST=dsip.gatex.uk
PUBLIC_URL=https://dsip.gatex.uk
SIP_DOMAIN=dsip.gatex.uk
SIP_WSS_URL=wss://dsip.gatex.uk/asterisk-ws
EXTERNAL_IP=<public IPv4 of the NineDeploy host>
ADMIN_PASSWORD=<strong password>
```

Optional later: attach a managed Postgres and set `DATABASE_URL` (or `POSTGRES_URL`) in the vault — embedded Postgres is then skipped.

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

## Optional services

```bash
# Asterisk + API login jail
docker compose --profile fail2ban up -d
```

## Development (API / web on the host)

```bash
pnpm install
pnpm --filter @dsip/shared build
docker compose up -d postgres asterisk coturn tts
export DATABASE_URL=postgresql://dsip:dsip_secret_change_me@localhost:5432/dsip
pnpm --filter @dsip/api run db:migrate
pnpm --filter @dsip/api run db:seed
pnpm dev
```

## Next steps

- [FEATURES.md](FEATURES.md) — what the product does  
- [ARCHITECTURE.md](ARCHITECTURE.md) — services and data flow  
- [DEPLOY-VPS.md](DEPLOY-VPS.md) — phones, NAT, firewall  
