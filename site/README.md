# MonoSIP website

The English product site for the open-source [MonoSIP PBX](https://github.com/MonoSIP/MonoSIP). Next.js App Router and TypeScript, statically exported from this folder.

Public address: **https://www.monosip.com**. Source repository: **[MonoSIP/MonoSIP](https://github.com/MonoSIP/MonoSIP)**, folder `site/`. GitHub Pages serves the static export. See [deployment](docs/DEPLOYMENT.md).

## Local development

Use **Node 26.12.1** and **pnpm 12.14.0**; `.node-version`, package metadata and CI agree.

```sh
npm install --global pnpm@12.14.0
pnpm install --frozen-lockfile
pnpm dev
```

Development opens at <http://127.0.0.1:3000/>. To inspect the real static output:

```sh
pnpm build
pnpm preview
```

Preview serves `out/`, with directory-index routes and real HTTP 404 responses. Hosting requires no application backend.

The implementation machine has a workspace-local, ignored Node runtime under `.tools/`. PowerShell example:

```powershell
$env:Path = (Join-Path $PWD '.tools/node-v26.12.1-win-x64') + ';' + $env:Path
npm exec --yes --package=pnpm@12.14.0 -- pnpm dev
```

## Verification

```sh
pnpm peers check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm check:export
pnpm exec playwright install chromium
pnpm test
pnpm check:links
```

Browser checks cover twelve routes at 375, 768, 1024, 1440, 1920, 2560 and 3840px in both themes: viewport overflow, resources, theme persistence/system changes, reduced motion, ripple lifecycle, mobile navigation, keyboard screen tabs, release-to-install navigation, clipboard success/failure, direct links and refresh. axe checks all pages and the appearance panel for WCAG A/AA semantics and contrast. Reports and screenshots are ignored local artifacts.

`check:export` validates canonical URLs, section anchors, local links/assets, sitemap, robots, `.nojekyll` and 404. `check:links` separately verifies external destinations with live HEAD requests.

Windows builds currently reproduce [Next #85374](https://github.com/vercel/next.js/issues/85374). A post-export script creates the flat RSC segment filenames requested by the client. Framework source is untouched; correct Linux output is unchanged.

## Content and design

- Home, downloads, release updates, brand assets, documentation index and seven full guides, including voicemail and forwarding. The reference directory links twelve official documents to the pinned release source.
- Release v1.8.0 is the pinned snapshot. Image, source archive, Compose commands and guide references use the central release value in `src/lib/site.ts`.
- SVG logos, social PNG and Apple icon live in `public/brand/`. The website presents ten theme-aware SVG interface mockups instead of screenshots, including the voicemail inbox, with call flows, audio waves and activity indicators. They use illustrative sample data.
- Locally served Outfit and JetBrains Mono, with Latin/Turkish coverage. Central variables include the requested Quicksand token; no unnecessary third font is loaded.
- Shared fluid container up to 1440px, centralized spacing and 4/6/8px component corners, light/dark tokens.
- Light, Dark and System appearance tiles with native radio behavior, persistent preferences and an early theme script.
- Mouse-icon control for pointer response and bounded click ripples. Turning mouse effects off removes their listeners/frames while continuous background and diagram animations keep running. Reduced motion and hidden tabs pause all effects; offscreen diagram motion pauses.
- Call-route SVG, Compose service map, clear example labels and a screen gallery. No live PBX calls or microphone requests.

## Structure

```text
src/app/           Routes, metadata, sitemap, robots and CSS tokens
src/components/    Preferences, navigation, SVGs, gallery and code controls
src/lib/           Product facts, guide content and navigation
public/brand/      Vector marks, favicon and sharing images
public/images/     WebP product captures
src/components/product-mockup.tsx  Animated SVG interface concepts
scripts/           Preview server, export normalization and link checks
tests/             Production-export browser verification
```

Update the release and download links in `src/lib/site.ts`, then review article facts against the official product sources.

## Deployment and ownership

GitHub Pages builds `site/` from [MonoSIP/MonoSIP](https://github.com/MonoSIP/MonoSIP) and serves https://www.monosip.com. The custom domain is `www.monosip.com` in `public/CNAME`.

MonoSIP is MIT licensed. Original product and brand copyright: **2026 diggyen**. See the [official project](https://github.com/MonoSIP/MonoSIP) for current development and contribution guidance.
