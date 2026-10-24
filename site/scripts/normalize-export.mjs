import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// Next.js #85374: Windows static export uses path.relative() backslashes for
// RSC segment filenames. The client requests the same names with dots instead.
// Only create the missing flat aliases. Linux output is already correct.
const root = "out";
let count = 0;
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const source = join(directory, entry.name);
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("__next.")) {
      visit(source);
      continue;
    }
    function flatten(dir, parts) {
      for (const file of readdirSync(dir, { withFileTypes: true })) {
        const nested = join(dir, file.name);
        const segments = [...parts, file.name];
        if (file.isDirectory()) flatten(nested, segments);
        else if (file.name.endsWith(".txt")) {
          const target = join(directory, segments.join("."));
          if (
            existsSync(target) &&
            !readFileSync(nested).equals(readFileSync(target))
          )
            throw new Error(`Conflicting RSC alias: ${target}`);
          copyFileSync(nested, target);
          count++;
        }
      }
    }
    flatten(source, [entry.name]);
  }
}
visit(root);
const turkishRoot = join(root, "tr");
let language = 0;
if (existsSync(turkishRoot)) {
  function mark(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) mark(path);
      else if (entry.name.endsWith(".html")) {
        const html = readFileSync(path, "utf8");
        const next = html.replace('<html lang="en"', '<html lang="tr"');
        if (next !== html) {
          writeFileSync(path, next);
          language++;
        }
      }
    }
  }
  mark(turkishRoot);
}
console.log(
  `Static export: normalized ${count} Windows RSC segment aliases (Next.js #85374); marked ${language} Turkish pages.`,
);
