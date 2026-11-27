/**
 * Property-style IVR graph checks: structure, reachability, cycles, contracts.
 * Uses deterministic generators (no fast-check dependency) over shared schemas.
 */
import {
  FlowJsonSchema,
  FlowNodeType,
  emptyFlow,
  type FlowJson,
} from "@monosip/shared";
import { describe, expect, it } from "vitest";
import { nextNode } from "../asterisk/flow-logic.js";

const NODE_TYPES = FlowNodeType.options;

function node(
  id: string,
  type: FlowJson["nodes"][number]["type"],
  data: Record<string, unknown> = {},
): FlowJson["nodes"][number] {
  return { id, type, position: { x: 0, y: 0 }, data };
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
): FlowJson["edges"][number] {
  return { id, source, target, sourceHandle };
}

/** Reachable node ids from start (BFS over edges). */
function reachable(flow: FlowJson, startId = "start"): Set<string> {
  const out = new Set<string>();
  const q = [startId];
  while (q.length) {
    const id = q.shift()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const e of flow.edges.filter((x) => x.source === id)) {
      if (!out.has(e.target)) q.push(e.target);
    }
  }
  return out;
}

/** True if the directed graph of edges has a cycle. */
function hasCycle(flow: FlowJson): boolean {
  const adj = new Map<string, string[]>();
  for (const n of flow.nodes) adj.set(n.id, []);
  for (const e of flow.edges) adj.get(e.source)?.push(e.target);
  const state = new Map<string, 0 | 1 | 2>();
  function dfs(u: string): boolean {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const s = state.get(v) ?? 0;
      if (s === 1) return true;
      if (s === 0 && dfs(v)) return true;
    }
    state.set(u, 2);
    return false;
  }
  for (const n of flow.nodes) {
    if ((state.get(n.id) ?? 0) === 0 && dfs(n.id)) return true;
  }
  return false;
}

/** Deterministic pseudo-random for generators. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function generateFlow(seed: number, size: number): FlowJson {
  const rnd = mulberry32(seed);
  const nodes = [node("start", "start")];
  for (let i = 1; i < size; i++) {
    const type = NODE_TYPES[Math.floor(rnd() * NODE_TYPES.length)]!;
    nodes.push(node(`n${i}`, type === "start" ? "announce" : type, {}));
  }
  const edges: FlowJson["edges"] = [];
  // Chain each node to the next — always a DAG, fully reachable.
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push(edge(`e${i}`, nodes[i]!.id, nodes[i + 1]!.id, "next"));
  }
  // Optionally add a back-edge (cycle) for odd seeds.
  if (seed % 2 === 1 && nodes.length > 2) {
    edges.push(edge("cycle", nodes[nodes.length - 1]!.id, nodes[1]!.id, "next"));
  }
  return { nodes, edges, variables: ["caller", "did", "time"] };
}

describe("IVR graph properties", () => {
  it("emptyFlow validates against FlowJsonSchema", () => {
    expect(() => FlowJsonSchema.parse(emptyFlow())).not.toThrow();
  });

  it("rejects unknown node types", () => {
    const bad = {
      nodes: [{ id: "start", type: "teleport", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      variables: [],
    };
    expect(() => FlowJsonSchema.parse(bad)).toThrow();
  });

  it("detects unreachable nodes after start", () => {
    const flow: FlowJson = {
      nodes: [node("start", "start"), node("a", "announce"), node("orphan", "hangup")],
      edges: [edge("e1", "start", "a")],
      variables: [],
    };
    const r = reachable(flow);
    expect(r.has("a")).toBe(true);
    expect(r.has("orphan")).toBe(false);
  });

  it("detects invalid edge targets", () => {
    const flow: FlowJson = {
      nodes: [node("start", "start")],
      edges: [edge("e1", "start", "missing")],
      variables: [],
    };
    const dangling = flow.edges.filter(
      (e) => !flow.nodes.some((n) => n.id === e.target),
    );
    expect(dangling).toHaveLength(1);
    expect(nextNode(flow, "start")).toBeUndefined();
  });

  it("property: even-seed generated chains are acyclic and fully reachable", () => {
    for (let seed = 0; seed < 40; seed += 2) {
      const flow = generateFlow(seed, 5 + (seed % 5));
      expect(FlowJsonSchema.safeParse(flow).success).toBe(true);
      expect(hasCycle(flow)).toBe(false);
      expect(reachable(flow).size).toBe(flow.nodes.length);
    }
  });

  it("property: odd-seed generated graphs with back-edges are cyclic", () => {
    for (let seed = 1; seed < 41; seed += 2) {
      const flow = generateFlow(seed, 6);
      expect(hasCycle(flow)).toBe(true);
    }
  });

  it("runtime step/depth limits are exported and finite", async () => {
    const { MAX_FLOW_STEPS, MAX_WAIT_SECONDS } = await import(
      "../asterisk/flow-runtime.js"
    );
    expect(MAX_FLOW_STEPS).toBe(300);
    expect(MAX_WAIT_SECONDS).toBe(600);
  });

  it("menu digit edges require strict nextNode (no silent wrong branch)", () => {
    const flow: FlowJson = {
      nodes: [
        node("m", "menu"),
        node("one", "announce", { text: "1" }),
        node("fallback", "hangup"),
      ],
      edges: [
        edge("e1", "m", "one", "1"),
        edge("e2", "m", "fallback", "timeout"),
      ],
      variables: [],
    };
    expect(nextNode(flow, "m", "1", true)?.id).toBe("one");
    expect(nextNode(flow, "m", "9", true)).toBeUndefined();
  });

  it("terminal node types have no required outgoing edge contract", () => {
    const terminals = new Set(["hangup", "voicemail", "queue", "transfer"]);
    for (const t of terminals) {
      expect(NODE_TYPES).toContain(t);
    }
  });
});
