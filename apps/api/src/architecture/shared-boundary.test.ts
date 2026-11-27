/**
 * Shared package + web/api import boundary locks.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(fileURLToPath(new URL("../../../../", import.meta.url)));

function listFiles(dir: string, pred: (n: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      out.push(...listFiles(p, pred));
    } else if (pred(name)) out.push(p);
  }
  return out;
}

describe("shared package boundary", () => {
  it("web production code has exactly one @monosip/shared import file today", () => {
    const files = listFiles(join(ROOT, "apps/web/src"), (n) =>
      /\.(ts|tsx)$/.test(n) && !n.includes(".test."),
    );
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      if (/from\s+["']@monosip\/shared["']/.test(text)) {
        hits.push(relative(ROOT, f));
      }
    }
    expect(hits).toEqual(["apps/web/src/pages/admin/TrunksPage.tsx"]);
  });

  it("web never imports apps/api source internals", () => {
    const files = listFiles(join(ROOT, "apps/web/src"), (n) => /\.(ts|tsx)$/.test(n));
    const bad: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      if (
        /from\s+["'][^"']*apps\/api/.test(text) ||
        /from\s+["']\.\.\/\.\.\/api\//.test(text)
      ) {
        bad.push(relative(ROOT, f));
      }
    }
    expect(bad).toEqual([]);
  });

  it("shared package never imports apps/*", () => {
    const files = listFiles(join(ROOT, "packages/shared/src"), (n) => n.endsWith(".ts"));
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text).not.toMatch(/from\s+["'][^"']*apps\//);
    }
  });

  it("api consumes shared for contracts (smoke: schema + flow imports exist)", () => {
    const admin = readFileSync(
      join(ROOT, "apps/api/src/routes/admin-resources.ts"),
      "utf8",
    );
    expect(admin).toMatch(/@monosip\/shared/);
    const flow = readFileSync(
      join(ROOT, "apps/api/src/asterisk/flow-logic.ts"),
      "utf8",
    );
    expect(flow).toMatch(/@monosip\/shared/);
  });
});
