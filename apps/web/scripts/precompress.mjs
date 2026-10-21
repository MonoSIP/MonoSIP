// Writes .br and .gz next to every text asset in dist/, so the API's static
// server (preCompressed) answers with a compressed file instead of the raw one.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const TEXT = /\.(js|css|html|svg|json|txt|webmanifest)$/;
let raw = 0;
let br = 0;
let files = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) walk(file);
    else if (TEXT.test(name) && statSync(file).size > 1024) compress(file);
  }
}

function compress(file) {
  const data = readFileSync(file);
  const b = brotliCompressSync(data, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
    },
  });
  writeFileSync(`${file}.br`, b);
  writeFileSync(`${file}.gz`, gzipSync(data, { level: 9 }));
  raw += data.length;
  br += b.length;
  files += 1;
}

walk(dist);
console.log(`precompress: ${files} files, ${Math.round(raw / 1024)} KB → ${Math.round(br / 1024)} KB brotli`);
