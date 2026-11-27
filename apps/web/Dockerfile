FROM node:26.13.1-bookworm-slim AS build
WORKDIR /app
# Node 26 no longer ships corepack — install pnpm via npm (same as root Dockerfile).
RUN npm install -g pnpm@12.14.0
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm install --filter @monosip/web... --frozen-lockfile=false \
  && pnpm --filter @monosip/shared build \
  && pnpm --filter @monosip/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
