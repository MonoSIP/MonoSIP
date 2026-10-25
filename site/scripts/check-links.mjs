import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const links = new Set();
function walk(dir) {
  for (const file of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, file.name);
    if (file.isDirectory()) walk(path);
    else if (file.name.endsWith(".html")) {
      for (const [, url] of readFileSync(path, "utf8").matchAll(
        /href="(https:\/\/[^"<>]+)"/g,
      )) {
        const parsed = new URL(url.replaceAll("&amp;", "&"));
        if (parsed.hostname !== "www.monosip.com") {
          parsed.hash = "";
          links.add(parsed.href);
        }
      }
    }
  }
}
walk("out");
let failed = 0;
for (const url of links) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "MonoSIP-website-link-check" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(`PASS ${response.status} ${url}`);
  } catch (error) {
    console.error(`FAIL ${url}: ${error.message}`);
    failed++;
  }
}
console.log(`${links.size - failed}/${links.size} external links verified.`);
if (failed) process.exitCode = 1;
