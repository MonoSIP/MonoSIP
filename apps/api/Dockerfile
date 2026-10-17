# Build with repository root as context:
#   docker build -f apps/api/Dockerfile .
# Compose: context: .  dockerfile: apps/api/Dockerfile
# NineDeploy: set build.dockerfile to apps/api/Dockerfile and do NOT set baseDir to apps/api
FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate \
  && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN pnpm install --filter @dsip/api... --frozen-lockfile=false \
  && pnpm --filter @dsip/shared build

# Entrypoint is already in the tree from COPY apps/api — do not COPY apps/api/... again
# (that path breaks when the build context is wrongly set to apps/api).
RUN cp /app/apps/api/docker-entrypoint.sh /entrypoint.sh && chmod +x /entrypoint.sh

WORKDIR /app/apps/api
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
