import { describe, expect, it } from "vitest";
import { mapTrunkMonitorStatus, normalizeTrunkStatus } from "./ami.js";

describe("normalizeTrunkStatus", () => {
  it("maps healthy states to registered", () => {
    expect(normalizeTrunkStatus("Avail")).toBe("registered");
    expect(normalizeTrunkStatus("Available")).toBe("registered");
    expect(normalizeTrunkStatus("Reachable")).toBe("registered");
    expect(normalizeTrunkStatus("Registered")).toBe("registered");
  });

  it("does not treat Unavailable/Unreachable as registered", () => {
    expect(normalizeTrunkStatus("Unavailable")).toBe("unreachable");
    expect(normalizeTrunkStatus("Unreachable")).toBe("unreachable");
    expect(normalizeTrunkStatus("UNAVAILABLE")).toBe("unreachable");
  });

  it("keeps idle/in-use device states", () => {
    expect(normalizeTrunkStatus("Not in use")).toBe("not-in-use");
    expect(normalizeTrunkStatus("In use")).toBe("in-use");
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

describe("mapTrunkMonitorStatus", () => {
  it("marks idle and registered trunks as up", () => {
    expect(mapTrunkMonitorStatus("registered")).toBe("up");
    expect(mapTrunkMonitorStatus("not-in-use")).toBe("up");
    expect(mapTrunkMonitorStatus("in-use")).toBe("up");
  });

  it("marks unavailable/unreachable as down", () => {
    expect(mapTrunkMonitorStatus("unreachable")).toBe("down");
    expect(mapTrunkMonitorStatus("unavailable")).toBe("down");
  });

  it("keeps unknown separate from down", () => {
    expect(mapTrunkMonitorStatus("unknown")).toBe("unknown");
  });
});
