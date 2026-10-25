import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "out";
const routes = [
  "/",
  "/download/",
  "/updates/",
  "/brand/",
  "/docs/",
  ...[
    "getting-started",
    "architecture",
    "ivr",
    "softphone",
    "voicemail",
    "integrations",
    "security",
  ].map((p) => `/docs/${p}/`),
];
const fileFor = (path) =>
  join(
    root,
    decodeURIComponent(path).replace(/^\//, ""),
    path.endsWith("/") ? "index.html" : "",
  );
const documents = new Map();
for (const path of routes) {
  const file = fileFor(path);
  assert.ok(existsSync(file), `Missing static route ${path}`);
  const html = readFileSync(file, "utf8");
  assert.ok(
    html.includes(`rel="canonical" href="https://monosip.github.io${path}"`),
    `Canonical mismatch: ${path}`,
  );
  assert.match(html, /<html[^>]+lang="en"/, `Missing language: ${path}`);
  assert.ok(
    html.includes(
      'property="og:image" content="https://monosip.github.io/brand/og-image.png"',
    ),
    `Missing Open Graph image: ${path}`,
  );
  assert.ok(
    html.includes('name="twitter:card" content="summary_large_image"'),
    `Missing social card: ${path}`,
  );
  assert.equal(
    [...html.matchAll(/<h1[\s>]/g)].length,
    1,
    `One h1 required: ${path}`,
  );
  // The requested hosting hostname is allowed; unrelated brand content is not.
  assert.ok(!/oxog/i.test(html), `Old site host present: ${path}`);
  documents.set(path, html);
}
const turkish = routes.map((path) => (path === "/" ? "/tr/" : `/tr${path}`));
for (const path of turkish) {
  const file = fileFor(path);
  assert.ok(existsSync(file), `Missing static route ${path}`);
  const html = readFileSync(file, "utf8");
  assert.ok(
    html.includes(`rel="canonical" href="https://monosip.github.io${path}"`),
    `Canonical mismatch: ${path}`,
  );
  assert.match(
    html,
    /<html[^>]+lang="tr"/,
    `Missing Turkish language: ${path}`,
  );
  assert.equal(
    [...html.matchAll(/<h1[\s>]/g)].length,
    1,
    `One h1 required: ${path}`,
  );
  assert.ok(!/oxog/i.test(html), `Old site host present: ${path}`);
  documents.set(path, html);
}
let links = 0;
for (const [path, html] of documents) {
  for (const [, raw] of html.matchAll(/(?:href|src)="([^"<>]+)"/g)) {
    const value = raw.replaceAll("&amp;", "&");
    if (/^(https?:|mailto:|data:|tel:)/.test(value)) continue;
    const url = new URL(value, `https://monosip.github.io${path}`);
    if (
      url.hash &&
      (!url.pathname.includes(".") || documents.has(url.pathname))
    ) {
      const target = documents.get(url.pathname);
      if (target)
        assert.ok(
          target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),
          `Missing anchor ${value} on ${path}`,
        );
    }
    assert.ok(
      existsSync(fileFor(url.pathname)),
      `Broken local link/asset ${value} on ${path}`,
    );
    links++;
  }
}
assert.ok(existsSync(join(root, ".nojekyll")), "Missing .nojekyll");
assert.equal(
  existsSync(join(root, "CNAME")),
  false,
  "Do not publish a CNAME; the site is https://monosip.github.io",
);
assert.ok(existsSync(join(root, "404.html")), "Missing 404");
const home = documents.get("/");
for (const anchor of [
  "top",
  "main",
  "features",
  "ivr",
  "softphone",
  "panel",
  "install",
])
  assert.ok(home.includes(`id="${anchor}"`), `Legacy anchor ${anchor} missing`);
const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
for (const path of [...routes, ...turkish])
  assert.ok(
    sitemap.includes(`https://monosip.github.io${path}</loc>`),
    `Sitemap missing ${path}`,
  );
assert.ok(
  readFileSync(join(root, "robots.txt"), "utf8").includes(
    "https://monosip.github.io/sitemap.xml",
  ),
);
let size = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else size += statSync(path).size;
  }
}
walk(root);
console.log(
  `PASS: ${routes.length} English and ${turkish.length} Turkish pages; ${links} local links/assets; legacy anchors, canonical URLs, sitemap, robots, 404 and .nojekyll. Export ${(size / 1024 / 1024).toFixed(2)} MiB.`,
);
