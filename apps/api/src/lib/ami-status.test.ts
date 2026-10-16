import { describe, expect, it } from "vitest";
import { normalizeTrunkStatus } from "./ami.js";

describe("normalizeTrunkStatus", () => {
  it("maps healthy states to registered", () => {
    expect(normalizeTrunkStatus("Avail")).toBe("registered");
    expect(normalizeTrunkStatus("Registered")).toBe("registered");
  });

  it("maps AMI errors to unreachable within 32 chars", () => {
    const s = normalizeTrunkStatus(
      "ami-error:Unable to retrieve endpoint trunk_abc12345 from Asterisk AMI",
    );
    expect(s).toBe("unreachable");
    expect(s.length).toBeLessThanOrEqual(32);
  });

  it("truncates unknown long values", () => {
    expect(normalizeTrunkStatus("x".repeat(100)).length).toBe(32);
  });
});
