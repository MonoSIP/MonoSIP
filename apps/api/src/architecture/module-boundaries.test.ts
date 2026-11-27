/**
 * Architectural regression: folder-level dependency direction and cycles.
 * Complements `.dependency-cruiser.cjs` with an in-suite graph check that needs
 * no extra binary in the unit-test path.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(fileURLToPath(new URL("..", import.meta.url)));
const FOLDERS = ["asterisk", "db", "jobs", "lib", "routes"] as const;
type Folder = (typeof FOLDERS)[number];

/** Allowed A→B edges (same-folder always allowed). */
const ALLOWED: Record<Folder, readonly Folder[]> = {
  routes: ["lib", "db", "asterisk"],
  jobs: ["lib", "db", "asterisk"],
  asterisk: ["lib", "db"],
  lib: ["db", "asterisk"], // intentional: presence/announce/queue-tts touch ARI
  db: ["lib", "asterisk"], // seed writes dialplan via config-writer
};

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "test" || name === "architecture") continue;
      out.push(...listTs(p));
    } else if (
      name.endsWith(".ts") &&
      !name.includes(".test.") &&
      !name.includes(".int.test.")
    ) {
      out.push(p);
    }
  }
  return out;
}

function folderOf(abs: string): Folder | null {
  const rel = relative(SRC, abs).replace(/\\/g, "/");
  const top = rel.split("/")[0];
  return (FOLDERS as readonly string[]).includes(top) ? (top as Folder) : null;
}

function parseImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const hits: string[] = [];
  for (const m of text.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)) {
    hits.push(m[1]!);
  }
  return hits;
}

function resolveImport(fromFile: string, spec: string): string | null {
  // Strip .js extension used in ESM imports; resolve relative to fromFile.
  const cleaned = spec.replace(/\.js$/, "");
  const base = join(fromFile, "..", cleaned);
  for (const cand of [`${base}.ts`, join(base, "index.ts")]) {
    try {
      statSync(cand);
      return cand;
    } catch {
      /* continue */
    }
  }
  return null;
}

type Edge = { from: Folder; to: Folder; file: string; spec: string };

function collectEdges(): Edge[] {
  const edges: Edge[] = [];
  for (const folder of FOLDERS) {
    for (const file of listTs(join(SRC, folder))) {
      const from = folderOf(file);
      if (!from) continue;
      for (const spec of parseImports(file)) {
        const target = resolveImport(file, spec);
        if (!target) continue;
        const to = folderOf(target);
        if (!to || to === from) continue;
        edges.push({ from, to, file: relative(SRC, file), spec });
      }
    }
  }
  return edges;
}

function hasCycle(edges: Edge[]): string[] | null {
  const adj = new Map<Folder, Set<Folder>>();
  for (const f of FOLDERS) adj.set(f, new Set());
  for (const e of edges) adj.get(e.from)!.add(e.to);

  const visiting = new Set<Folder>();
  const done = new Set<Folder>();
  const stack: Folder[] = [];

  function dfs(n: Folder): string[] | null {
    if (visiting.has(n)) {
      const i = stack.indexOf(n);
      return [...stack.slice(i), n];
    }
    if (done.has(n)) return null;
    visiting.add(n);
    stack.push(n);
    for (const m of adj.get(n) ?? []) {
      const c = dfs(m);
      if (c) return c;
    }
    stack.pop();
    visiting.delete(n);
    done.add(n);
    return null;
  }

  for (const f of FOLDERS) {
    const c = dfs(f);
    if (c) return c;
  }
  return null;
}

describe("module boundaries", () => {
  const edges = collectEdges();

  it("forbids unexpected folder-level cycles (db↔lib is the sole known soft cycle)", () => {
    // File-level madge reports zero cycles. Folder-level still shows db↔lib because
    // seed/reset-admin import crypto/audit while nearly all lib modules import db/client.
    // That is accepted for a monolith; new cycles (e.g. routes↔asterisk) must fail.
    const cycle = hasCycle(edges);
    if (cycle === null) return;
    // Cycle path ends by repeating the start node (e.g. db→lib→db).
    const nodes = [...new Set(cycle.slice(0, -1))].sort();
    expect(nodes).toEqual(["db", "lib"]);
  });


  it("only uses allowed cross-folder edges", () => {
    const violations = edges.filter((e) => !ALLOWED[e.from].includes(e.to));
    expect(violations).toEqual([]);
  });

  it("asterisk never imports routes or jobs", () => {
    const bad = edges.filter(
      (e) => e.from === "asterisk" && (e.to === "routes" || e.to === "jobs"),
    );
    expect(bad).toEqual([]);
  });

  it("lib never imports routes", () => {
    expect(edges.filter((e) => e.from === "lib" && e.to === "routes")).toEqual([]);
  });

  it("jobs never import routes", () => {
    expect(edges.filter((e) => e.from === "jobs" && e.to === "routes")).toEqual([]);
  });

  it("documents intentional lib↔asterisk coupling points", () => {
    const libToAst = edges.filter((e) => e.from === "lib" && e.to === "asterisk");
    const files = [...new Set(libToAst.map((e) => e.file))].sort();
    // Keep this list tight: new reverse edges must be deliberate.
    expect(files).toEqual([
      "lib/announce-call.ts",
      "lib/presence.ts",
      "lib/queue-announce-tts.ts",
    ]);
  });
});
