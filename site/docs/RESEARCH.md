# Source and design review

## Repository refresh — 22 October 2026

The official repository was fetched again at `18e42f6` (main). The latest published release is [v1.7.5](https://github.com/MunaSIP/MunaSIP/releases/tag/v1.7.5), commit `3f9deec1c3de77a5aeb4d8ac0f3d60153f01d418`. Its release notes and tagged portal/trunk/readiness sources support the voicemail inbox, provider caller ID and database/Asterisk/dialplan health gate. The `1.7.5` GHCR manifest returns HTTP 200 with digest `sha256:eca7e22917c0ba8696b7ba0ea33f2a26aa2f26ea6fc5513eb63e7a0d6966c968`.

Post-tag changes were reviewed separately: inline mailbox waveforms and counts, saved greetings, missed-call acknowledgement, portal layout/settings updates, and softphone disconnection/re-registration. The updates page labels these as main-branch work, not part of the v1.7.5 release snapshot. Main publishes the `main` image tag; release tags publish version tags and `latest`.

The refresh adds a release page, voicemail guide and SVG concept, eight feature categories, an eight-tab gallery and twelve pinned upstream references. Source-tag links replace moving main-branch guide references. The layout cap is now 1440px for a more compact presentation. Existing motion preferences, deep links, original media URLs and branding remain supported.

## Original implementation review

Reviewed 21 October 2026. Product claims come from official MunaSIP sources.

## Repository and hosting investigation

- Product: [MunaSIP/MunaSIP](https://github.com/MunaSIP/MunaSIP), revision `e8b6183afde8fff50e16d4a7a62a892f78986417`.
- Current stable release: [v1.6.0](https://github.com/MunaSIP/MunaSIP/releases/tag/v1.6.0). No native installer assets. The Docker workflow publishes `linux/amd64` to GHCR.
- Website: [MunaSIP/munasip.github.io](https://github.com/MunaSIP/munasip.github.io), original revision `9c670e33329dee6e628145525e2684fb0ed9a489`.
- Pages API: `main:/`, legacy publishing, `cname: null`, HTTPS enforced. This describes the original site at <https://munasip.github.io/>.
- The product repository also mentions `munasip.gatex.uk` in its homepage metadata. This is not the Pages custom-domain configuration. That original domain investigation did not require a CNAME.
- The product repository's `.github/workflows/pages.yml` copies `site/` into the website repository and removes other files. It would have to be retired for a migration of that original repository. The user subsequently selected a separate repository, so that publisher is left unchanged.
- Product copyright: 2026 diggyen, MIT. The original revision included an exclusive-maintenance policy; current upstream revision `d72b1ba570a649f06be020c637fa3f8f75e910a5` removed it. Current site text does not claim that earlier contribution restriction still applies.

## Official source map

All paths below refer to the product revision above.

| Subject                                               | Sources                                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Purpose and small-office positioning                  | `README.md`, release v1.6.0                                                                                                    |
| Install, platform, persistence                        | `docs/INSTALL.md`, `docs/DEPLOY-VPS.md`, `Dockerfile`, `docker-compose.yml`, `.github/workflows/docker.yml`                    |
| Feature scope and exclusions                          | `docs/FEATURES.md`, `TASKS.md`                                                                                                 |
| Architecture and trust boundaries                     | `docs/ARCHITECTURE.md`                                                                                                         |
| IVR nodes, variables, error exits and version locking | `docs/FLOW-DESIGNER.md`                                                                                                        |
| Portal and mobile limitations                         | `docs/USER-PORTAL.md`                                                                                                          |
| Speech connectivity                                   | `docs/TTS.md`, `docker/tts/server.py`                                                                                          |
| Integration endpoints and webhook events              | `docs/API.md`, `apps/api/src/routes/`                                                                                          |
| Security behavior                                     | `docs/SERVER-SECURITY.md`, `apps/api/src/routes/auth.ts`, `apps/api/src/lib/auth.ts`, `apps/api/src/asterisk/config-writer.ts` |
| Archive support                                       | `apps/api/src/jobs/archive.ts`                                                                                                 |
| Ownership and licensing                               | `.github/MAINTENANCE.md`, `LICENSE`                                                                                            |
| Brand and application images                          | Existing website `brand/`, `images/` and product `site/`                                                                       |

## Corrected or qualified claims

- A browser reload ends a call; moving between portal pages preserves it. The old website conflates these operations.
- Current `loginAdmin` checks `admin.totpEnabled`: TOTP is optional. An older security note describes it as required.
- Current extensions use one portal/SIP password. Older notes describe separate hidden random SIP secrets.
- EMA supplies offline Turkish speech. Edge needs outbound connectivity, and English has no offline engine. No blanket claim that every operation stays local.
- Runtime sources and Docker use Asterisk 22, despite older Asterisk 24 task wording.
- Source-provided screenshots are retained. Some captures show the earlier DSip name; they are not asserted to be fresh v1.6.0 captures.
- No first-party desktop/mobile installer, ARM image, team chat, video meeting or automatic high-availability claim.
- No invented benchmarks, users, logos, testimonials, uptime claims or compliance certifications.
- Integration scenarios are examples, not bundled CRM connectors.

## URL and brand continuity

`/#top`, `/#main`, `/#features`, `/#ivr`, `/#softphone`, `/#panel` and `/#install` retain working targets. Original `/brand/*.svg`, `/brand/og-image.png`, Apple icon and `/images/*.webp` URLs keep their original files via `public/`. Original source remains in Git history. Product, license and official documentation links keep canonical destinations.

## Design references

All eight opening compositions were reviewed in a browser. The CobaltDB appearance panel was opened to inspect its Light/Dark/System preview tiles, selection check and native radio focus.

| Reference                      | Principle applied                                                       |
| ------------------------------ | ----------------------------------------------------------------------- |
| <https://dockrouter.com>       | An interactive routing illustration, reinterpreted as call destinations |
| <https://uwaserver.com>        | A strong headline paired with a comprehensible technical diagram        |
| <https://nothingdns.com>       | A restrained, continuous decorative network layer                       |
| <https://cobaltdb.dev>         | Appearance preview tiles, Light/Dark/System choices and clear selection |
| <https://guardianwaf.com>      | Explicitly illustrative states and source-grounded explanations         |
| <https://anubis.watch>         | Product-specific visual identity rather than generic stock imagery      |
| <https://cachestorm.com>       | Large technical visuals and clear typography                            |
| <https://openloadbalancer.dev> | A labelled path through system components                               |

Reference sites were not copied as templates. Unrelated studio-brand sections are excluded. Reference-site responsive behavior was not exhaustively tested; this implementation receives its own seven-width, two-theme matrix.

## Current stable tooling and compatibility

Official npm dist-tags/peer metadata, framework docs and GitHub Actions releases were checked at implementation time.

- Node 26.12.1, pnpm 12.14.0, Next 16.4.2, React/React DOM 19.3.1.
- TypeScript 7.0.2 is newest stable, but typescript-eslint 8.72.0 supports `>=4.8.4 <6.1.0`. Use the newest compatible stable TypeScript 6.0.3.
- ESLint 10.13.0 with direct Next 16.4.2, typescript-eslint 8.72.0 and React Hooks 7.1.1 plugins. `eslint-config-next` pulls plugins whose peer ranges exclude ESLint 10; direct plugins avoid deprecated ESLint 9.39.5. axe verifies runtime accessibility.
- Playwright 1.64.1, axe 4.14.0, Prettier 3.9.10, variable Fontsource packages 5.3.0. Exact direct versions and transitive lockfile are included.
- Official Actions, pinned to resolved SHAs: checkout 7.0.1, setup-node 7.1.0, configure-pages 6.0.0, upload-pages-artifact 5.0.0, deploy-pages 5.0.1.
- Reproduced [Next #85374](https://github.com/vercel/next.js/issues/85374): Windows exports nested RSC paths while the client requests flat names. A narrow post-export script creates the missing aliases without modifying framework source; correct Linux output needs no changes.

References: [Next static export](https://nextjs.org/docs/app/guides/static-exports), [React versions](https://react.dev/versions), [TypeScript installation](https://www.typescriptlang.org/download/).

## User-selected hosting destination

The site now lives in the MunaSIP repository (`site/`) and is published to https://munasip.github.io/. Canonical URLs use that host.
