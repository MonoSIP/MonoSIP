/**
 * SIP / call-state architecture checks: documented states, cleanup hooks,
 * and ARI app subscription surface. Complements runtime unit tests.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const AST = join(fileURLToPath(new URL("../asterisk", import.meta.url)));
const ARI = readFileSync(join(AST, "ari.ts"), "utf8");
const FLOW = readFileSync(join(AST, "flow-runtime.ts"), "utf8");
const CDR = readFileSync(
  join(fileURLToPath(new URL("../lib/cdr.ts", import.meta.url))),
  "utf8",
);

/** Application-level live call states tracked in ARI client (stringly typed). */
const LIVE_CALL_STATE_FIELD = "state: string";

describe("SIP / call state architecture", () => {
  it("subscribes to the three Stasis apps used by dialplan", () => {
    expect(ARI).toContain('connectApps(["monosip-inbound", "monosip-flow", "monosip-outbound"])');
  });

  it("tracks live calls in an in-memory Map rebuilt from ARI channel poll", () => {
    expect(ARI).toContain("calls = new Map<string, LiveCall>()");
    expect(ARI).toMatch(/ChannelDestroyed|channelDestroyed/i);
    // Live map is replaced each poll from /ari/channels (orphans drop naturally).
    expect(ARI).toMatch(/this\.calls\s*=\s*next|this\.calls\.clear\(|this\.calls\.delete/);
  });

  it("exports LiveCall.state as a string (Asterisk channel state passthrough)", () => {
    expect(ARI).toContain(LIVE_CALL_STATE_FIELD);
  });

  it("extension presence states are a closed enum", () => {
    expect(ARI).toContain(
      'state: "idle" | "ringing" | "busy" | "unavailable" | "dnd"',
    );
  });

  it("flow-runtime cleans pendingTransfers and records CDR end paths", () => {
    expect(FLOW).toContain("pendingTransfers");
    expect(FLOW).toContain("pendingTransfers.delete");
    expect(FLOW).toMatch(/ChannelDestroyed|channel destroyed/i);
    expect(FLOW).toContain("MAX_FLOW_STEPS");
  });

  it("CDR helper owns start/answer/end transitions", () => {
    expect(CDR).toMatch(/export async function (cdrStart|startCdr|openCdr|beginCdr)/i);
    // Accept any of the known export names used historically.
    const hasStart = /export async function \w*[Cc]dr\w*/.test(CDR);
    expect(hasStart).toBe(true);
    expect(CDR).toMatch(/answeredAt|billsec|endedAt/);
  });

  it("DTMF and playback waiters are channel-keyed Maps (leak risk if not cleared)", () => {
    expect(ARI).toContain("dtmfWaiters = new Map");
    expect(ARI).toContain("playbackWaiters = new Map");
    expect(ARI).toContain("dtmfBuffers = new Map");
  });

  it("ari.stop clears poll timer and sockets", () => {
    expect(ARI).toContain("clearInterval(this.pollTimer)");
    expect(ARI).toContain("this.sockets = []");
  });
});
