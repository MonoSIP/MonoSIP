# GitHub Pages deployment

Website source: the `site/` folder in **[MunaSIP/MunaSIP](https://github.com/MunaSIP/MunaSIP)**.
Public URL: **https://munasip.github.io/**.

`.github/workflows/pages.yml` installs this folder, runs `pnpm build` and `pnpm check:export`, then copies `site/out/` to [MunaSIP/munasip.github.io](https://github.com/MunaSIP/munasip.github.io). The organization Pages site is that repository, served at the domain root.

The export does not include a `CNAME`. Do not add one unless the Pages hostname itself changes.
