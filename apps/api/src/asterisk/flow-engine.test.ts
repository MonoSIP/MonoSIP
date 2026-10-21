import { describe, expect, it } from "vitest";
import type { FlowJson } from "@munasip/shared";
import { simulateFlow, validateFlow } from "./flow-engine.js";

function ivrFlow(): FlowJson {
  return {
    nodes: [
      { id: "s", type: "start", position: { x: 0, y: 0 }, data: {} },
      { id: "m", type: "menu", position: { x: 0, y: 0 }, data: { prompt: "1 sales 2 support", retries: 1 } },
      {
        id: "c",
        type: "condition",
        position: { x: 0, y: 0 },
        data: { op: "area_code", variable: "", value: "212" },
      },
      { id: "t1", type: "transfer", position: { x: 0, y: 0 }, data: { destType: "extension", destId: "101" } },
      { id: "t2", type: "transfer", position: { x: 0, y: 0 }, data: { destType: "extension", destId: "102" } },
      { id: "th", type: "hangup", position: { x: 0, y: 0 }, data: {} },
      { id: "ti", type: "hangup", position: { x: 0, y: 0 }, data: {} },
      { id: "tf", type: "hangup", position: { x: 0, y: 0 }, data: {} },
      { id: "tq", type: "queue", position: { x: 0, y: 0 }, data: { queueNumber: "300" } },
    ],
    edges: [
      { id: "e0", source: "s", target: "m" },
      { id: "e1", source: "m", target: "c", sourceHandle: "1" },
      { id: "e2", source: "m", target: "tq", sourceHandle: "2" },
      { id: "et", source: "m", target: "th", sourceHandle: "timeout" },
      { id: "ei", source: "m", target: "ti", sourceHandle: "invalid" },
      { id: "ct", source: "c", target: "t1", sourceHandle: "true" },
      { id: "cf", source: "c", target: "t2", sourceHandle: "false" },
      { id: "t1n", source: "t1", target: "tf", sourceHandle: "noanswer" },
      { id: "t1b", source: "t1", target: "tf", sourceHandle: "busy" },
      { id: "t1u", source: "t1", target: "tf", sourceHandle: "chanunavail" },
      { id: "t2n", source: "t2", target: "tf", sourceHandle: "noanswer" },
      { id: "t2b", source: "t2", target: "tf", sourceHandle: "busy" },
      { id: "t2u", source: "t2", target: "tf", sourceHandle: "chanunavail" },
    ],
  };
}

describe("validateFlow", () => {
  it("accepts a complete IVR", () => {
    expect(validateFlow(ivrFlow())).toEqual([]);
  });

  it("requires start and menu timeout", () => {
    const f = ivrFlow();
    f.nodes = f.nodes.filter((n) => n.type !== "start");
    expect(validateFlow(f).some((e) => e.includes("Missing start"))).toBe(true);

    const f2 = ivrFlow();
    f2.edges = f2.edges.filter((e) => e.sourceHandle !== "timeout");
    expect(validateFlow(f2).some((e) => e.includes('missing "timeout"'))).toBe(true);
  });

  it("rejects unknown condition op", () => {
    const f = ivrFlow();
    const c = f.nodes.find((n) => n.id === "c")!;
    c.data = { ...c.data, op: "wat" };
    expect(validateFlow(f).some((e) => e.includes("unknown op"))).toBe(true);
  });

  it("allows queue without flow exits", () => {
    const f: FlowJson = {
      nodes: [
        { id: "s", type: "start", position: { x: 0, y: 0 }, data: {} },
        { id: "q", type: "queue", position: { x: 0, y: 0 }, data: { queueNumber: "300" } },
      ],
      edges: [{ id: "e", source: "s", target: "q" }],
    };
    expect(validateFlow(f)).toEqual([]);
  });
});

describe("simulateFlow", () => {
  it("routes valid DTMF to transfer via area_code", async () => {
    const steps = await simulateFlow(ivrFlow(), {
      caller: "02121234567",
      did: "850",
      dtmfSequence: ["1"],
    });
    expect(steps.some((s) => s.type === "condition" && s.message.includes("true"))).toBe(true);
    expect(steps.at(-1)?.type).toBe("transfer");
    expect(steps.at(-1)?.message).toContain("101");
  });

  it("uses invalid after retries exhausted", async () => {
    const steps = await simulateFlow(ivrFlow(), {
      caller: "100",
      did: "850",
      dtmfSequence: ["9", "8"],
    });
    expect(steps.some((s) => s.type === "menu" && s.message === "DTMF invalid")).toBe(true);
    expect(steps.at(-1)?.nodeId).toBe("ti");
  });

  it("accepts digit after one bad attempt", async () => {
    const steps = await simulateFlow(ivrFlow(), {
      caller: "100",
      did: "850",
      dtmfSequence: ["9", "2"],
    });
    expect(steps.some((s) => s.message === "DTMF 2")).toBe(true);
    expect(steps.at(-1)?.type).toBe("queue");
  });

  it("times out when no DTMF", async () => {
    const steps = await simulateFlow(ivrFlow(), { caller: "100", did: "850", dtmfSequence: [] });
    expect(steps.some((s) => s.message === "DTMF timeout")).toBe(true);
    expect(steps.at(-1)?.nodeId).toBe("th");
  });
});
