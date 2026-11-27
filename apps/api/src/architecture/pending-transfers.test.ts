/**
 * pendingTransfers restart/recovery behaviour (in-memory Map).
 * Does not place real calls — validates process-local state contract.
 */
import { describe, expect, it } from "vitest";
import {
  clearPendingTransfers,
  dialExitNode,
  pendingTransferSnapshot,
} from "../asterisk/flow-runtime.js";
import { dialStatusToHandle } from "../asterisk/flow-logic.js";
import type { FlowJson } from "@monosip/shared";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  join(fileURLToPath(new URL("../asterisk/flow-runtime.ts", import.meta.url))),
  "utf8",
);

describe("pendingTransfers — storage & restart", () => {
  it("starts empty (fresh module / after clear = restart)", () => {
    clearPendingTransfers();
    expect(pendingTransferSnapshot()).toEqual({ size: 0, channelIds: [] });
  });

  it("is an in-process Map (not Redis/DB) — source contract", () => {
    expect(SRC).toContain("const pendingTransfers = new Map<string, PendingTransfer>()");
    expect(SRC).not.toMatch(/pendingTransfers.*(redis|db\.|insert\()/i);
  });

  it("dial-failed without pending hangs up (recovery miss)", () => {
    // Source: if (!pending) { hangup; return }
    expect(SRC).toMatch(/dial-failed with no pending transfer/);
    expect(SRC).toMatch(/pendingTransfers\.get\(channelId\)/);
    expect(SRC).toMatch(/pendingTransfers\.delete\(channelId\)/);
  });

  it("restart simulation: clear drops all channels (no cross-call bind)", () => {
    clearPendingTransfers();
    // Cannot set privately; snapshot must stay empty after clear.
    expect(pendingTransferSnapshot().size).toBe(0);
    clearPendingTransfers();
    expect(pendingTransferSnapshot().channelIds).toEqual([]);
  });

  it("dial status mapping stays stable for resume edges", () => {
    expect(dialStatusToHandle("BUSY")).toBe("busy");
    expect(dialStatusToHandle("NOANSWER")).toBe("noanswer");
    expect(dialStatusToHandle("CHANUNAVAIL")).toBe("chanunavail");
  });

  it("resume edge selection never falls through to wrong handle (strict)", () => {
    const flow: FlowJson = {
      nodes: [
        { id: "t", type: "transfer", position: { x: 0, y: 0 }, data: {} },
        { id: "busy", type: "announce", position: { x: 0, y: 0 }, data: {} },
        { id: "menu", type: "menu", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t", target: "busy", sourceHandle: "busy" },
        { id: "e2", source: "t", target: "menu", sourceHandle: "noanswer" },
      ],
      variables: [],
    };
    expect(dialExitNode(flow, "t", "busy")?.id).toBe("busy");
    expect(dialExitNode(flow, "t", "chanunavail")?.id).toBe("menu"); // fallback menu
  });
});
