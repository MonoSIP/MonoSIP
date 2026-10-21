import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = join(root, "site");
const outDir = join(siteDir, "docs");
const SITE = "https://munasip.github.io";

const pages = [
  {
    src: "docs/README.md",
    file: "README.md",
    slug: "",
    nav: "Overview",
    title: "MunaSIP documentation",
    description:
      "Guides for MunaSIP, a self-hosted Asterisk PBX: Docker install, visual IVR, browser softphone, API, security and deployment.",
  },
  {
    src: "docs/INSTALL.md",
    file: "INSTALL.md",
    slug: "install",
    nav: "Install",
    title: "Install MunaSIP with Docker",
    description:
      "Install the self-hosted company PBX from a prebuilt Docker image or Compose. Ports, volumes, lab logins and upgrading.",
  },
  {
    src: "docs/FEATURES.md",
    file: "FEATURES.md",
    slug: "features",
    nav: "Features",
    title: "MunaSIP features for a company PBX",
    description:
      "Extensions, queues, schedules, a visual IVR with API lookups, neural speech, a browser softphone and call logs in one PBX.",
  },
  {
    src: "docs/ARCHITECTURE.md",
    file: "ARCHITECTURE.md",
    slug: "architecture",
    nav: "Architecture",
    title: "MunaSIP architecture",
    description:
      "How MunaSIP is wired: nginx, the React panel, the Fastify API, Asterisk 22, PostgreSQL and embedded text-to-speech.",
  },
  {
    src: "docs/DEPLOY-VPS.md",
    file: "DEPLOY-VPS.md",
    slug: "deploy",
    nav: "Deploy",
    title: "Deploy MunaSIP on a VPS",
    description:
      "Put MunaSIP on a Linux VPS: public hostname, NAT, firewall ports, desk phones and TURN for the browser softphone.",
  },
  {
    src: "docs/USER-PORTAL.md",
    file: "USER-PORTAL.md",
    slug: "user-portal",
    nav: "Portal",
    title: "MunaSIP user portal and softphone",
    description:
      "Each extension gets a browser softphone that stays on the call, plus directory, voicemail, recordings and forwarding.",
  },
  {
    src: "docs/FLOW-DESIGNER.md",
    file: "FLOW-DESIGNER.md",
    slug: "ivr",
    nav: "IVR",
    title: "Visual IVR designer for MunaSIP",
    description:
      "Draw a MunaSIP IVR: menus, API lookups, neural speech, transfers and queues. Test the call, then publish it.",
  },
  {
    src: "docs/DATA-MODEL.md",
    file: "DATA-MODEL.md",
    slug: "data-model",
    nav: "Data model",
    title: "MunaSIP data model",
    description:
      "What MunaSIP stores in PostgreSQL: extensions, queues, call flows, CDR, recordings and system settings.",
  },
  {
    src: "docs/API.md",
    file: "API.md",
    slug: "api",
    nav: "API",
    title: "MunaSIP HTTP API",
    description:
      "HTTP API for the MunaSIP admin panel, the user portal and outside systems: extensions, flows, CDR, webhooks and API keys.",
  },
  {
    src: "docs/SCREENS.md",
    file: "SCREENS.md",
    slug: "screens",
    nav: "Screens",
    title: "MunaSIP admin and portal screens",
    description:
      "What each MunaSIP screen is for: dashboard, extensions, queues, the IVR designer, call logs, reports and settings.",
  },
  {
    src: "docs/TEST-PLAN.md",
    file: "TEST-PLAN.md",
    slug: "test-plan",
    nav: "Test plan",
    title: "MunaSIP test plan",
    description:
      "Checklist for testing a MunaSIP install: admin sign-in, the portal, IVR, live calls, recordings and deployment.",
  },
  {
    src: "docs/SERVER-SECURITY.md",
    file: "SERVER-SECURITY.md",
    slug: "security",
    nav: "Security",
    title: "MunaSIP server security and KVKK",
    description:
      "Harden a MunaSIP host: firewall, SIP exposure, toll-fraud limits, call recording and the KVKK announcement.",
  },
  {
    src: "docs/TTS.md",
    file: "TTS.md",
    slug: "text-to-speech",
    nav: "Speech",
    title: "MunaSIP text-to-speech",
    description:
      "MunaSIP speech uses Edge Neural voices and offline Turkish EMA. Prompts are cached per sentence and spoken on the call.",
  },
  {
    src: "TASKS.md",
    file: "TASKS.md",
    slug: "roadmap",
    nav: "Roadmap",
    title: "MunaSIP roadmap",
    description:
      "What has shipped in MunaSIP: the core PBX and admin panel, the visual IVR and portal, then live monitoring and integrations.",
  },
];

const byFile = new Map(pages.map((page) => [page.file, page]));
let ctx = pages[0];

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = pkg.version;

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function relTo(fromSlug, toSlug) {
  if (toSlug === null) return fromSlug === "" ? "../" : "../../";
  const from = fromSlug === "" ? "docs" : `docs/${fromSlug}`;
  const to = toSlug === "" ? "docs/" : `docs/${toSlug}/`;
  let rel = posix.relative(from, to);
  if (!rel) return "./";
  if (!rel.endsWith("/")) rel += "/";
  return rel;
}

function pageUrl(slug) {
  return slug === "" ? `${SITE}/docs/` : `${SITE}/docs/${slug}/`;
}

function rewriteHref(href) {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#") || href.startsWith("mailto:")) return href;
  const hashAt = href.indexOf("#");
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  if (path === "../site" || path === "../site/") return `${relTo(ctx.slug, null)}${hash}`;
  if (!path.endsWith(".md")) return href;
  const page = byFile.get(path.slice(path.lastIndexOf("/") + 1));
  if (!page) return href;
  if (page.slug === ctx.slug) return `./${hash}`;
  return `${relTo(ctx.slug, page.slug)}${hash}`;
}

function linkLabel(text, href) {
  const path = href.split("#")[0];
  if (path === "../site" || path === "../site/") return "MunaSIP site";
  if (!path.endsWith(".md")) return text;
  const page = byFile.get(path.slice(path.lastIndexOf("/") + 1));
  if (page && (text.endsWith(".md") || text.includes("/"))) return page.nav;
  return text;
}

function inline(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "`") {
      const end = src.indexOf("`", i + 1);
      if (end !== -1) {
        out += `<code>${esc(src.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }
    if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end !== -1) {
        out += `<strong>${inline(src.slice(i + 2, end))}</strong>`;
        i = end + 2;
        continue;
      }
    }
    if (src[i] === "*") {
      const end = src.indexOf("*", i + 1);
      if (end !== -1 && !src.startsWith("**", end)) {
        out += `<em>${inline(src.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }
    if (src[i] === "[") {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        const href = rewriteHref(m[2]);
        out += `<a href="${esc(href)}">${inline(linkLabel(m[1], m[2]))}</a>`;
        i += m[0].length;
        continue;
      }
    }
    const next = src.slice(i + 1).search(/[`*\[]/);
    const end = next === -1 ? src.length : i + 1 + next;
    out += esc(src.slice(i, end));
    i = end;
  }
  return out;
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[^;]+;/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function splitRow(line) {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|")) body = body.slice(0, -1);
  const cells = [];
  let cur = "";
  let code = false;
  for (const ch of body) {
    if (ch === "`") code = !code;
    if (ch === "|" && !code) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isRule(line) {
  return /^(-{3,}|\*{3,})\s*$/.test(line);
}

function isHeading(line) {
  return /^#{1,6} /.test(line);
}

function isList(line) {
  return /^(- \[[ xX]\] |- |\d+\. )/.test(line);
}

function render(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const used = new Map();
  const blocks = [];
  let i = 0;
  const headingId = (text) => {
    const base = slug(text) || "section";
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (isHeading(line)) {
      const level = line.match(/^#+/)[0].length;
      const text = line.slice(level + 1).trim();
      const id = headingId(inline(text).replace(/<[^>]+>/g, ""));
      blocks.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }
    if (isRule(line)) {
      blocks.push("<hr>");
      i += 1;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const sep = rows[1]?.every((cell) => /^:?-{3,}:?$/.test(cell));
      const head = sep ? rows[0] : null;
      const body = sep ? rows.slice(2) : rows;
      const th = head ? `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` : "";
      const tb = `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      blocks.push(`<div class="doc-table">${th ? `<table>${th}${tb}</table>` : `<table>${tb}</table>`}</div>`);
      continue;
    }
    if (isList(line)) {
      const ordered = /^\d+\. /.test(line);
      const items = [];
      while (i < lines.length && isList(lines[i]) && /^\d+\. /.test(lines[i]) === ordered) {
        const raw = lines[i].trim();
        i += 1;
        const extra = [];
        while (i < lines.length && /^ {2,}\S/.test(lines[i]) && !lines[i].trim().startsWith("```")) {
          extra.push(lines[i].trim());
          i += 1;
        }
        const rest = extra.length ? ` ${extra.map((part) => inline(part)).join(" ")}` : "";
        const task = /^- \[([ xX])\] (.*)$/.exec(raw);
        if (task) {
          const done = task[1].toLowerCase() === "x";
          items.push(
            `<li class="task${done ? " done" : ""}"><span class="box" aria-hidden="true"></span><span>${inline(task[2])}${rest}</span></li>`,
          );
        } else if (ordered) {
          const m = /^(\d+)\. (.*)$/.exec(raw);
          items.push(`<li value="${m[1]}">${inline(m[2])}${rest}</li>`);
        } else {
          items.push(`<li>${inline(raw.replace(/^- /, ""))}${rest}</li>`);
        }
      }
      const tag = ordered ? "ol" : "ul";
      blocks.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !isHeading(lines[i]) &&
      !isRule(lines[i]) &&
      !lines[i].trim().startsWith("|") &&
      !isList(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    const parts = [];
    for (const part of para) {
      const hard = / {2}$/.test(part);
      const html = inline(part.trim());
      parts.push(hard ? `${html}<br>` : html);
    }
    blocks.push(`<p>${parts.join(" ")}</p>`);
  }
  return blocks.join("\n");
}

const navKey = {
  "": "docs.overview",
  install: "docs.install",
  features: "docs.features",
  architecture: "docs.architecture",
  deploy: "docs.deploy",
  "user-portal": "docs.portal",
  ivr: "docs.ivr",
  "data-model": "docs.data",
  api: "docs.api",
  screens: "docs.screens",
  "test-plan": "docs.tests",
  security: "docs.security",
  "text-to-speech": "docs.speech",
  roadmap: "docs.roadmap",
};

function crumbs(page) {
  const home = relTo(page.slug, null);
  const docs = page.slug === "" ? "./" : relTo(page.slug, "");
  const items = [
    `<a href="${home}" data-i18n="crumb.home">Home</a>`,
    page.slug === ""
      ? `<span aria-current="page" data-i18n="nav.docs">Documentation</span>`
      : `<a href="${docs}" data-i18n="nav.docs">Documentation</a>`,
  ];
  if (page.slug !== "") {
    const key = navKey[page.slug] ?? "";
    items.push(`<span aria-current="page" data-i18n="${key}">${esc(page.nav)}</span>`);
  }
  return `<nav class="crumbs" data-i18n-aria="crumb.label" aria-label="Breadcrumb">${items.join('<span aria-hidden="true">/</span>')}</nav>`;
}

function jsonLd(page) {
  const url = pageUrl(page.slug);
  const trail = [
    { name: "Home", item: `${SITE}/` },
    { name: "Documentation", item: `${SITE}/docs/` },
  ];
  if (page.slug !== "") trail.push({ name: page.nav, item: url });
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: trail.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: crumb.item,
        })),
      },
      {
        "@type": "TechArticle",
        headline: page.title,
        description: page.description,
        url,
        inLanguage: "en",
        mainEntityOfPage: url,
        author: { "@type": "Organization", name: "MunaSIP", url: `${SITE}/` },
        publisher: { "@type": "Organization", name: "MunaSIP", url: `${SITE}/` },
      },
    ],
  };
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}

function pageShell(page, body) {
  const asset = page.slug === "" ? ".." : "../..";
  const home = relTo(page.slug, null);
  const docsHome = page.slug === "" ? "./" : relTo(page.slug, "");
  const links = [
    ["#softphone", "Softphone", "nav.softphone"],
    ["#features", "Features", "nav.features"],
    ["#ivr", "IVR", "nav.ivr"],
    ["#panel", "Panel", "nav.panel"],
    ["#install", "Install", "nav.install"],
  ];
  const sectionNav = links
    .map(([hash, label, key]) => `<a href="${home}${hash}" data-i18n="${key}">${label}</a>`)
    .join("\n          ");
  const side = pages
    .map((item) => {
      const href = item.slug === page.slug ? "./" : relTo(page.slug, item.slug);
      const current = item.slug === page.slug ? ' aria-current="page"' : "";
      const key = navKey[item.slug] ?? "";
      return `<a href="${href}"${current} data-i18n="${key}">${esc(item.nav)}</a>`;
    })
    .join("\n          ");
  const canonical = pageUrl(page.slug);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="theme-color" content="#047857" />
    <link rel="apple-touch-icon" href="${asset}/brand/apple-touch-icon.png" />
    <link rel="icon" type="image/svg+xml" href="${asset}/brand/munasip-mark.svg" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${esc(page.title)}" />
    <meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:image" content="${SITE}/brand/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${asset}/styles.css" />
    <script type="application/ld+json">${jsonLd(page)}</script>
    <script>document.documentElement.classList.add("js")</script>
  </head>
  <body>
    <div class="flow-map" aria-hidden="true"><svg></svg></div>
    <a class="skip" href="#doc" data-i18n="skip.doc">Skip to content</a>
    <header class="nav" id="top">
      <div class="wrap nav-row">
        <a class="brand" href="${home}">
          <img class="brand-mark" src="${asset}/brand/munasip-mark.svg" width="32" height="32" alt="" />
          <span class="brand-name">MünaSIP</span>
          <span class="brand-ver">v${esc(version)}</span>
        </a>
        <nav class="nav-links" data-i18n-aria="nav.sections" aria-label="Sections">
          ${sectionNav}
          <a href="${docsHome}" data-i18n="nav.docs"${page.slug === "" ? ' aria-current="page"' : ""}>Docs</a>
        </nav>
        <div class="nav-actions">
          <div class="lang-switch" role="group" data-i18n-aria="lang.label" aria-label="Language">
            <button type="button" data-set-lang="en" aria-pressed="true">EN</button>
            <button type="button" data-set-lang="tr" aria-pressed="false">TR</button>
          </div>
          <a class="btn btn-ghost btn-sm nav-docs" href="${docsHome}" data-i18n="nav.docs">Docs</a>
          <a class="btn btn-ghost btn-sm nav-github" href="https://github.com/MunaSIP/MunaSIP">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" fill="currentColor"/></svg>
            GitHub
          </a>
        </div>
      </div>
    </header>
    <main id="doc">
      <div class="wrap doc-layout">
        <nav class="doc-nav" data-i18n-aria="docs.nav" aria-label="Documentation">
          ${side}
        </nav>
        <article class="doc">
          ${crumbs(page)}
          ${body}
        </article>
      </div>
    </main>
    <footer class="footer">
      <div class="wrap footer-row">
        <a class="brand" href="${home}"><img class="brand-mark" src="${asset}/brand/munasip-mark.svg" width="32" height="32" alt="" /><span class="brand-name">MünaSIP</span></a>
        <span class="muted"><span data-i18n="footer.blurb">Self-hosted company PBX</span> · <a href="${docsHome}" data-i18n="nav.docs">Docs</a> · <a href="https://github.com/MunaSIP/MunaSIP/blob/main/LICENSE" data-i18n="footer.mit">MIT License</a></span>
        <a href="#top" class="muted" data-i18n="footer.top">Back to top ↑</a>
      </div>
    </footer>
    <script src="${asset}/i18n.js" defer></script>
    <script src="${asset}/script.js" defer></script>
  </body>
</html>
`;
}

function day(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

const built = [];
for (const page of pages) {
  ctx = page;
  const md = await readFile(join(root, page.src), "utf8");
  const fences = (md.match(/^```/gm) ?? []).length;
  let body = render(md);
  const closed = (body.match(/<pre>/g) ?? []).length;
  if (fences % 2 !== 0 || closed !== fences / 2) {
    throw new Error(`${page.src}: code fence mismatch (${fences} markers, ${closed} blocks)`);
  }
  const headings = (md.replace(/```[\s\S]*?```/g, "").match(/^#{1,6} /gm) ?? []).length;
  const found = (body.match(/<h[1-6] /g) ?? []).length;
  if (headings !== found) throw new Error(`${page.src}: heading mismatch ${headings} vs ${found}`);
  body = body.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, `<h1 id="${slug(page.title)}">${esc(page.title)}</h1>`);
  built.push({ page, body, modified: (await stat(join(root, page.src))).mtimeMs });
}

await mkdir(outDir, { recursive: true });
for (const name of await readdir(outDir)) {
  await rm(join(outDir, name), { recursive: true });
}
for (const item of built) {
  const html = pageShell(item.page, item.body);
  if (item.page.slug === "") await writeFile(join(outDir, "index.html"), html);
  else {
    const dir = join(outDir, item.page.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), html);
  }
}

const homeModified = day((await stat(join(siteDir, "index.html"))).mtimeMs);
const urls = [
  `  <url><loc>${SITE}/</loc><lastmod>${homeModified}</lastmod></url>`,
  ...built.map(
    (item) => `  <url><loc>${pageUrl(item.page.slug)}</loc><lastmod>${day(item.modified)}</lastmod></url>`,
  ),
];
await writeFile(
  join(siteDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
);
await writeFile(join(siteDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`wrote ${built.length} docs pages, sitemap and robots.txt`);
