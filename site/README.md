# MunaSIP website

Static product page. `.github/workflows/pages.yml` copies this folder to the
[MunaSIP/munasip.github.io](https://github.com/MunaSIP/munasip.github.io) repository on every change; GitHub Pages serves it from there.

**Live:** https://munasip.github.io/

```bash
# preview locally
python3 -m http.server 8765 --directory site
# → http://localhost:8765
```

Docs are rendered into `site/docs/` as `/docs/install/` and the other guides by `node scripts/build-site-docs.mjs`, which also writes `robots.txt` and `sitemap.xml`.
