# All-in-one image — deployable on ANY Docker-based platform.
# Build from the repository root (the universal default: root Dockerfile + root context):
#   docker build -t monosip .
# Most PaaS (Render, Railway, Fly.io, Coolify, Dokploy, DO App Platform, NineDeploy, …)
# auto-detect this root Dockerfile and use the repo root as context — no extra config.
# Runtime needs: a persistent volume at /data, TCP 3000 published, and (for softphone
# audio) UDP 10000-10100 published + EXTERNAL_IP set. See docs/INSTALL.md.
#
# All-in-one runtime: Asterisk (andrius/asterisk:22) + Node API + web SPA + embedded Postgres.
# Compose still runs a separate asterisk service and sets ASTERISK_ARI_URL=http://asterisk:8088
# so the embedded PBX is skipped in that mode.

FROM node:26.12.1-bookworm-slim AS builder
WORKDIR /app
# Node 26 no longer ships corepack. Install pnpm the same way the runtime stage does.
RUN npm install -g pnpm@12.14.0

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# Vite lives in web devDependencies — full install even if NODE_ENV=production.
RUN pnpm install --filter @monosip/api... --filter @monosip/web... --frozen-lockfile=false --prod=false \
  && pnpm --filter @monosip/shared build \
  && pnpm --filter @monosip/web build

# --- Runtime: Asterisk base + Node + Postgres ---
FROM andrius/asterisk:22
LABEL org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/MonoSIP/MonoSIP"

USER root
ARG TARGETARCH
ARG NODE_VERSION=26.12.1

# Pin major Postgres so image rebuilds do not silently break /data/postgres clusters.
# python3-pip + libsndfile: embedded TTS (Edge / EMA) — no sidecar.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl openssl ffmpeg python3 python3-pip python3-venv \
    espeak-ng libsndfile1 \
    postgresql-17 postgresql-client-17 \
    xz-utils \
  && NODE_ARCH="$TARGETARCH" \
  && if [ "$NODE_ARCH" = "amd64" ]; then NODE_ARCH=x64; fi \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
       | tar -xJ -C /usr/local --strip-components=1 \
  && npm install -g pnpm@12.14.0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app /app

# MonoSIP Asterisk conf (same as docker/asterisk sidecar)
COPY docker/asterisk/conf/ /etc/asterisk/

# Embedded TTS sources (server + deps). Models are baked below so offline synth works
# on first boot without Hugging Face / GitHub at runtime.
COPY docker/tts/requirements.txt /app/docker/tts/requirements.txt
COPY docker/tts/server.py /app/docker/tts/server.py
ENV HF_HOME=/models/hf \
    TTS_ENGINE=auto \
    TTS_ENABLE_EMA=1 \
    TTS_URL=http://127.0.0.1:5500 \
    TTS_EMBEDDED=1
# CPU torch first (default Linux wheel pulls CUDA). EMA's normalizer-tr is amd64-only;
# build/deploy the all-in-one image on linux/amd64 for production (NineDeploy VPS).
RUN pip3 install --no-cache-dir --break-system-packages \
      torch --index-url https://download.pytorch.org/whl/cpu \
  && pip3 install --no-cache-dir --break-system-packages -r /app/docker/tts/requirements.txt \
  && mkdir -p /models/hf \
  && python3 -c "from ema_lightning import EMA; EMA().say('Merhaba', sample_rate=8000)" \
  && echo "Embedded TTS (EMA) cached"

# Do NOT create /data in the image layer — NineDeploy mounts a persistent volume at
# /data. Pre-creating /data in the image can leave an empty overlay that looks like a
# "DB reset" on every redeploy when the volume is not (or is incorrectly) attached.
RUN mkdir -p /var/lib/asterisk/monosip \
  && cp /app/apps/api/docker-entrypoint.sh /entrypoint.sh \
  && chmod +x /entrypoint.sh \
       /app/apps/api/scripts/bootstrap-runtime.sh \
       /app/apps/api/scripts/start-asterisk.sh \
       /app/apps/api/scripts/start-tts.sh

WORKDIR /app/apps/api
ENV WEB_DIST=/app/apps/web/dist \
    ASTERISK_ARI_URL=http://127.0.0.1:8088 \
    ASTERISK_AMI_HOST=127.0.0.1 \
    ASTERISK_CONFIG_DIR=/data/asterisk \
    RECORDINGS_DIR=/data/recordings \
    UPLOADS_DIR=/data/uploads \
    MONOSIP_DATA_DIR=/data

# NineDeploy publishes the first/configured HTTP port — only expose the API.
# Asterisk ARI/WSS stay on 127.0.0.1:8088 inside the container (see start-asterisk.sh).
# Softphone WebRTC also needs host UDP 10000-10100 published + EXTERNAL_IP in vault.
EXPOSE 3000
EXPOSE 10000-10100/udp
ENTRYPOINT ["/entrypoint.sh"]
