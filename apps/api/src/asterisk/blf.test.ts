import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ db: {} }));

import { blfEndpointLines, directedPickupLines, extensionHintLine } from "./config-writer.js";

describe("BLF dialplan", () => {
  it("publishes ringing and busy on the extension the phone subscribes to", () => {
    const lines = blfEndpointLines();
    expect(lines).toContain("allow_subscribe=yes");
    expect(lines).toContain("subscribe_context=from-internal");
    expect(lines).toContain("notify_early_inuse_ringing=yes");
    expect(lines).toContain("device_state_busy_at=1");
    expect(lines).toContain("call_group=1");
    expect(lines).toContain("pickup_group=1");
  });

  it("hints the PJSIP endpoint in the subscribe context", () => {
    expect(extensionHintLine("101")).toBe("exten => 101,hint,PJSIP/101");
  });

  it("picks up *8101 by the ringing channel name", () => {
    const lines = directedPickupLines().join("\n");
    expect(lines).toContain("exten => _*8.,1,NoOp(Directed pickup ${EXTEN:2})");
    expect(lines).toContain("PickupChan(PJSIP/${EXTEN:2}-)");
  });
});
