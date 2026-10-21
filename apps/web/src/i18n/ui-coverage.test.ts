import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import uiTr from "./ui.tr.json";

/** Copy that is intentionally identical in every language (protocols, samples, ids). */
const TECHNICAL = new Set([
  "$.data.agent",
  "1,1234,timeout",
  "API",
  "Europe/Istanbul",
  "TCP",
  "TLS",
  "UDP",
  "URL",
  "ulaw,alaw,g722",
  '{"api1":{"agent":"101"}}',
]);

const SRC = path.resolve(__dirname, "..");
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? sources(path.join(dir, d.name))
      : /\.tsx?$/.test(d.name) && !/\.test\./.test(d.name)
        ? [path.join(dir, d.name)]
        : [],
  );
}

describe("ui.tr.json", () => {
  it("translates every tr(\"…\") string used in the app", () => {
    const missing: string[] = [];
    for (const file of sources(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\btr\(\s*("(?:[^"\\]|\\.)*")/g)) {
        const key = JSON.parse(m[1]!) as string;
        if (!(key in uiTr) && !TECHNICAL.has(key)) missing.push(`${path.relative(SRC, file)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps {{placeholders}} in translations", () => {
    for (const [en, trText] of Object.entries(uiTr as Record<string, string>)) {
      const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(",");
      expect(vars(trText), en).toBe(vars(en));
    }
  });
});
