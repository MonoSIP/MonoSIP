# MunaSIP website

Static product page. `.github/workflows/pages.yml` copies this folder to the
[MunaSIP/munasip.github.io](https://github.com/MunaSIP/munasip.github.io) repository on every change; GitHub Pages serves it from there.

**Live:** https://munasip.github.io/

```bash
# preview locally
python3 -m http.server 8765 --directory site
# → http://localhost:8765
```

Docs links on the page point at `github.com/MunaSIP/MunaSIP/blob/main/docs/...` so they work on Pages.
