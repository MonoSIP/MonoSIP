# MunaSIP website

The English product site for the open-source [MunaSIP PBX](https://github.com/MunaSIP/MunaSIP). Next.js App Router and TypeScript, statically exported from this folder.

Public address: **https://munasip.github.io/**. `.github/workflows/pages.yml` builds `site/` and publishes the export to [MunaSIP/munasip.github.io](https://github.com/MunaSIP/munasip.github.io).

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

`check:export` validates canonical URLs, old anchors, local links/assets, sitemap, robots, `.nojekyll` and 404. `check:links` separately verifies external destinations with live HEAD requests.

Windows builds currently reproduce [Next #85374](https://github.com/vercel/next.js/issues/85374). A post-export script creates the flat RSC segment filenames requested by the client. Framework source is untouched; correct Linux output is unchanged.

## Content and design

- Home, downloads, release updates, brand assets, documentation index and seven full guides, including voicemail and forwarding. The reference directory links twelve official documents to the pinned release source.
- Release v1.7.5 and post-release main-branch changes are clearly separated. Image, source archive, Compose commands and guide references use the central release value in `src/lib/site.ts`.
- Original SVG logos, social PNG, Apple icon and legacy project captures preserved at their old URLs. The website presents ten theme-aware SVG interface mockups instead of screenshots, including the voicemail inbox, with call flows, audio waves and activity indicators. They use illustrative sample data.
- Locally served Outfit and JetBrains Mono, with Latin/Turkish coverage. Central variables include the requested Quicksand token; no unnecessary third font is loaded.
- Shared fluid container up to 1440px, centralized spacing and 4/6/8px component corners, light/dark tokens.
- Light, Dark and System appearance tiles with native radio behavior, persistent preferences and an early theme script.
- Mouse-icon control for pointer response and bounded click ripples. Turning mouse effects off removes their listeners/frames while continuous background and diagram animations keep running. Reduced motion and hidden tabs pause all effects; offscreen diagram motion pauses.
- Original call-route SVG, Compose service map, clear example labels and a genuine screen gallery. No live PBX calls or microphone requests.
- [Research record](docs/RESEARCH.md) covers official sources, corrected legacy claims, hosting, design references and version compatibility decisions.

## Structure

```text
src/app/           Routes, metadata, sitemap, robots and CSS tokens
src/components/    Preferences, navigation, SVGs, gallery and code controls
src/lib/           Product facts, guide content and navigation
public/brand/      Original vector marks, favicon and sharing images
public/images/     Original WebP product captures
src/components/product-mockup.tsx  Animated SVG interface concepts
legacy/            Preserved original website source (not deployed)
scripts/           Preview server, export normalization and link checks
tests/             Production-export browser verification
../.github/workflows/pages.yml  Builds this folder and publishes the export
```

Update the release and download links in `src/lib/site.ts`, then review article facts against the official product sources.

## Deployment and ownership

A push to `main` that changes `site/` builds this folder and copies the static export to `MunaSIP/munasip.github.io`. That repository is what GitHub Pages serves at https://munasip.github.io/. There is no custom-domain CNAME in the export.

MunaSIP is MIT licensed. Original product and brand copyright: **2026 diggyen**. See the [official project](https://github.com/MunaSIP/MunaSIP) for current development and contribution guidance.
