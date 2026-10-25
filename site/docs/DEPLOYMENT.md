# GitHub Pages deployment

Website source: the `site/` folder in **[MonoSIP/MonoSIP](https://github.com/MonoSIP/MonoSIP)**.
Public URL: **https://monosip.github.io/**.

`.github/workflows/pages.yml` installs this folder, runs `pnpm build` and `pnpm check:export`, then copies `site/out/` to [MonoSIP/monosip.github.io](https://github.com/MonoSIP/monosip.github.io). The organization Pages site is that repository, served at the domain root.

The export does not include a `CNAME`. Do not add one unless the Pages hostname itself changes.
