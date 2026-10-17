# Build with repository root as context:
#   docker build -f apps/api/Dockerfile .
# Compose: context: .  dockerfile: apps/api/Dockerfile
# NineDeploy: build.dockerfile apps/api/Dockerfile, context = repo root (no baseDir=apps/api)
#
# All-in-one runtime: Asterisk (andrius/asterisk:22) + Node API + web SPA + embedded Postgres.
# Compose still runs a separate asterisk service and sets ASTERISK_ARI_URL=http://asterisk:8088
# so the embedded PBX is skipped in that mode.

FROM node:24-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# Vite lives in web devDependencies — full install even if NODE_ENV=production.
RUN pnpm install --filter @dsip/api... --filter @dsip/web... --frozen-lockfile=false --prod=false \
  && pnpm --filter @dsip/shared build \
  && pnpm --filter @dsip/web build

# --- Runtime: Asterisk base + Node + Postgres ---
FROM andrius/asterisk:22

USER root
ARG TARGETARCH
ARG NODE_VERSION=24.11.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl openssl ffmpeg python3 \
    postgresql postgresql-client \
    xz-utils \
  && NODE_ARCH="$TARGETARCH" \
  && if [ "$NODE_ARCH" = "amd64" ]; then NODE_ARCH=x64; fi \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
       | tar -xJ -C /usr/local --strip-components=1 \
  && npm install -g pnpm@12.14.0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app /app

# DSip Asterisk conf (same as docker/asterisk sidecar)
COPY docker/asterisk/conf/ /etc/asterisk/

RUN mkdir -p /var/lib/asterisk/dsip /data/asterisk /data/recordings /data/uploads \
  && cp /app/apps/api/docker-entrypoint.sh /entrypoint.sh \
  && chmod +x /entrypoint.sh \
       /app/apps/api/scripts/bootstrap-runtime.sh \
       /app/apps/api/scripts/start-asterisk.sh

WORKDIR /app/apps/api
ENV WEB_DIST=/app/apps/web/dist \
    ASTERISK_ARI_URL=http://127.0.0.1:8088 \
    ASTERISK_AMI_HOST=127.0.0.1 \
    ASTERISK_CONFIG_DIR=/data/asterisk \
    RECORDINGS_DIR=/data/recordings \
    UPLOADS_DIR=/data/uploads \
    DSIP_DATA_DIR=/data

EXPOSE 3000 5060/udp 5060/tcp 8088 10000-10100/udp
ENTRYPOINT ["/entrypoint.sh"]
