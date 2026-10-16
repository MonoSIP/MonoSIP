# DSip website

Static product page for GitHub Pages or any static host.

```bash
# preview locally
python3 -m http.server 8765 --directory site
# → http://localhost:8765
```

**GitHub Pages:** Settings → Pages → Deploy from branch → folder `/site` (or `/docs` if you move these files). Relative links to `../docs/*.md` work on GitHub’s file browser; for Pages, prefer linking to the repo `docs/` paths on `github.com/diggyen/DSip/blob/main/docs/...`.
