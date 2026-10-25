# Cloudflare deployment

Website source: the `site/` folder in **[MonoSIP/MonoSIP](https://github.com/MonoSIP/MonoSIP)**.
Public URL: **https://www.monosip.com**.

Connect that repository in Cloudflare Workers. The build reads `site/wrangler.jsonc` and serves the static export.

- Root directory: `site`
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Node.js: `26.12.1` (`site/.node-version`)
- Package manager: pnpm `12.14.0`
- Output: `out/`, declared as the asset directory in `wrangler.jsonc`

Attach `www.monosip.com` as the custom domain in Cloudflare. Do not add a `CNAME` file to the export.
