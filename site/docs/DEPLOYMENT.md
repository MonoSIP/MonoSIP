# GitHub Pages

Website source: the `site/` folder in **[MonoSIP/MonoSIP](https://github.com/MonoSIP/MonoSIP)**.
Public URL: **https://www.monosip.com**.

Pushing `main` runs `.github/workflows/pages.yml`. The workflow builds this folder and publishes the static export with GitHub Pages.

- Node.js: `26.12.1` (`site/.node-version`)
- Package manager: pnpm `12.14.0`
- Build: `pnpm install --frozen-lockfile && pnpm build`
- Output: `out/`
- Pages source: GitHub Actions
- Custom domain: `www.monosip.com`, from `public/CNAME`

DNS for `www` is a CNAME record pointing at `monosip.github.io`.
