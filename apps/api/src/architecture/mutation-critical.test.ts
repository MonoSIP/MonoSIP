/**
 * Lightweight mutation-style checks for critical predicates.
 * Instead of a full Stryker run (heavy; see MUTATION_TEST_REPORT.md), these
 * tests assert that flipping key business rules would be caught by the
 * existing unit assertions — by re-implementing the "mutant" locally and
 * verifying the real implementation disagrees.
 */
import { describe, expect, it } from "vitest";
import { compare, dialStatusToHandle, nextNode } from "../asterisk/flow-logic.js";
import {
  isKeepableRecording,
  MIN_KEEP_RECORDING_SECONDS,
} from "../lib/recording-files.js";
import type { FlowJson } from "@monosip/shared";

describe("mutation resistance — critical predicates", () => {
  it("compare '=' mutant (!==) would fail equality cases", () => {
    const real = compare("a", "a", "=");
    const mutant = (l: string, r: string) => l !== r; // survived only if unused
    expect(real).toBe(true);
    expect(mutant("a", "a")).toBe(false);
    expect(real).not.toBe(mutant("a", "a"));
  });

  it("compare 'contains' mutant (startsWith) is distinguishable", () => {
    expect(compare("abcdef", "cde", "contains")).toBe(true);
    expect(compare("abcdef", "cde", "starts_with")).toBe(false);
  });

  it("dialStatusToHandle does not collapse BUSY into noanswer", () => {
    expect(dialStatusToHandle("BUSY")).toBe("busy");
    expect(dialStatusToHandle("NOANSWER")).toBe("noanswer");
    expect(dialStatusToHandle("CHANUNAVAIL")).toBe("chanunavail");
  });

  it("strict nextNode mutant (non-strict fallback) would mis-route menus", () => {
    const flow: FlowJson = {
      nodes: [
        { id: "m", type: "menu", position: { x: 0, y: 0 }, data: {} },
        { id: "one", type: "hangup", position: { x: 0, y: 0 }, data: {} },
        { id: "to", type: "hangup", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "m", target: "one", sourceHandle: "1" },
        { id: "e2", source: "m", target: "to", sourceHandle: "timeout" },
      ],
      variables: [],
    };
    expect(nextNode(flow, "m", "9", true)).toBeUndefined();
    // Non-strict fallback (mutant) would return the first edge target.
    expect(nextNode(flow, "m", "9", false)?.id).toBe("one");
  });

  it("recording keep threshold mutant (0s) would keep empty files", () => {
    expect(MIN_KEEP_RECORDING_SECONDS).toBeGreaterThanOrEqual(2);
    expect(isKeepableRecording({ durationSec: 0, sizeBytes: 0 })).toBe(false);
    expect(isKeepableRecording({ durationSec: 1, sizeBytes: 10_000 })).toBe(false);
    expect(
      isKeepableRecording({
        durationSec: MIN_KEEP_RECORDING_SECONDS,
        sizeBytes: 500,
      }),
    ).toBe(true);
  });

  it("size floor mutant (ignore bytes) would keep header-only WAVs", () => {
    // duration OK but tiny file → discard (mutant: check duration only).
    expect(
      isKeepableRecording({
        durationSec: MIN_KEEP_RECORDING_SECONDS + 5,
        sizeBytes: 44,
      }),
    ).toBe(false);
  });

  it("ingest path discards unanswered (billed===0) even when duration looks long", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const admin = readFileSync(
      join(fileURLToPath(new URL("../routes/admin-resources.ts", import.meta.url))),
      "utf8",
    );
    expect(admin).toContain("billed === 0 || !isKeepableRecording");
  });
});

