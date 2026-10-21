import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionState } from "sip.js";
import { Softphone, sdpWithoutPrivateHostCandidates } from "./softphone.js";

/** Minimal AudioContext double — jsdom has no Web Audio. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  state: AudioContextState = "running";
  destination = {} as AudioDestinationNode;
  oscillators: FakeOscillator[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createGain() {
    const gain = {
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    return gain;
  }
  createOscillator() {
    const osc: FakeOscillator = {
      type: "sine",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(osc);
    return osc;
  }
}
type FakeOscillator = {
  type: string;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

/** Shape of the RFC 2833 INFO body the product sends when no in-band handler exists. */
type DtmfInfoOptions = {
  requestOptions: {
    body: {
      contentType: string;
      content: string;
      contentDisposition?: string;
    };
  };
};

/** Build a session double in a chosen SessionState. */
function fakeSession(state: SessionState, extra: Record<string, unknown> = {}) {
  return { state, bye: vi.fn(async () => {}), ...extra };
}

let originalAudioContext: unknown;

beforeEach(() => {
  FakeAudioContext.instances = [];
  originalAudioContext = (globalThis as { AudioContext?: unknown }).AudioContext;
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  localStorage.clear();
});

afterEach(() => {
  (globalThis as { AudioContext?: unknown }).AudioContext = originalAudioContext;
  vi.restoreAllMocks();
});

describe("Softphone construction", () => {
  it("appends a hidden remote audio element with autoplay enabled", () => {
    const before = document.querySelectorAll("audio").length;
    new Softphone();
    const after = document.querySelectorAll("audio");
    expect(after.length).toBe(before + 2);
    const remote = after[after.length - 2] as HTMLAudioElement;
    expect(remote.autoplay).toBe(true);
    expect(remote.style.display).toBe("none");
    expect(remote.getAttribute("playsinline")).toBe("true");
  });

  it("starts idle with no session", () => {
    const sp = new Softphone();
    expect(sp.status).toBe("idle");
    expect(sp.session).toBeNull();
  });
});

describe("playDtmfTone", () => {
  it("plays the standard DTMF pair for a digit", () => {
    const sp = new Softphone();
    sp.playDtmfTone("5");
    const ctx = FakeAudioContext.instances[0];
    expect(ctx).toBeDefined();
    expect(ctx.oscillators.map((o) => o.frequency.value)).toEqual([770, 1336]);
  });

  it("starts and stops both oscillators", () => {
    const sp = new Softphone();
    sp.playDtmfTone("9", 300);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.oscillators).toHaveLength(2);
    for (const osc of ctx.oscillators) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    }
  });

  it("ignores an unknown digit without creating an audio context", () => {
    const sp = new Softphone();
    sp.playDtmfTone("A");
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it("accepts every key on the keypad", () => {
    const sp = new Softphone();
    for (const key of "0123456789*#") sp.playDtmfTone(key);
    // 12 keys x 2 oscillators, all sharing one lazily-created context.
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].oscillators).toHaveLength(24);
  });
});

describe("setMute / muted", () => {
  it("reports the muted state and disables the audio sender track", async () => {
    const sp = new Softphone();
    const track = { kind: "audio", enabled: true };
    const videoTrack = { kind: "video", enabled: true };
    const peerConnection = {
      getSenders: () => [{ track }, { track: videoTrack }],
    };
    (sp as unknown as { session: unknown }).session = fakeSession(SessionState.Established, {
      sessionDescriptionHandler: { peerConnection },
    });

    sp.setMute(true);
    expect(sp.muted).toBe(true);
    expect(track.enabled).toBe(false);
    // Only the audio sender is touched.
    expect(videoTrack.enabled).toBe(true);

    sp.setMute(false);
    expect(sp.muted).toBe(false);
    expect(track.enabled).toBe(true);
  });

  it("still records muted state with no live session", () => {
    const sp = new Softphone();
    expect(() => sp.setMute(true)).not.toThrow();
    expect(sp.muted).toBe(true);
  });
});

describe("setHold / onHold", () => {
  it("delegates to the session handler when available", async () => {
    const sp = new Softphone();
    const hold = vi.fn(async () => {});
    (sp as unknown as { session: unknown }).session = fakeSession(SessionState.Established, {
      sessionDescriptionHandler: { hold },
    });

    await sp.setHold(true);
    expect(sp.onHold).toBe(true);
    expect(hold).toHaveBeenCalledWith(true);
  });

  it("falls back to disabling senders when the handler has no hold()", async () => {
    const sp = new Softphone();
    const track = { kind: "audio", enabled: true };
    const peerConnection = { getSenders: () => [{ track }] };
    (sp as unknown as { session: unknown }).session = fakeSession(SessionState.Established, {
      sessionDescriptionHandler: { peerConnection },
    });

    await sp.setHold(true);
    expect(sp.onHold).toBe(true);
    expect(track.enabled).toBe(false);
  });

  it("is a no-op unless the call is established", async () => {
    const sp = new Softphone();
    (sp as unknown as { session: unknown }).session = fakeSession(SessionState.Terminated);
    await sp.setHold(true);
    expect(sp.onHold).toBe(false);
  });
});

describe("transfer", () => {
  it("rejects when there is no established call", async () => {
    const sp = new Softphone();
    await expect(sp.transfer("123", "example.com")).rejects.toThrow(
      "No active established call to transfer",
    );
  });

  it("rejects an empty destination after sanitising", async () => {
    const sp = new Softphone();
    (sp as unknown as { session: unknown }).session = fakeSession(SessionState.Established);
    // Letters and punctuation are stripped, leaving nothing to dial.
    await expect(sp.transfer("abc", "example.com")).rejects.toThrow("Enter transfer destination");
  });

  it("REFERs the sanitised target and clears the session on success", async () => {
    const sp = new Softphone();
    const refer = vi.fn(async (_uri: { toString(): string }) => {});
    (sp as unknown as { session: unknown }).session = fakeSession(SessionState.Established, {
      refer,
    });
    const onSession = vi.fn();
    sp.onSession = onSession;

    await sp.transfer("+90 532 111 22 33", "example.com");
    expect(refer).toHaveBeenCalledTimes(1);
    const uri = refer.mock.calls[0][0] as { toString(): string };
    expect(uri.toString()).toContain("905321112233");
    expect(sp.session).toBeNull();
    expect(onSession).toHaveBeenCalledWith(null);
  });

  it("rejects when the session cannot REFER", async () => {
    const sp = new Softphone();
    (sp as unknown as { session: unknown }).session = fakeSession(SessionState.Established);
    await expect(sp.transfer("1001", "example.com")).rejects.toThrow(
      "Transfer not supported by this session",
    );
  });
});

describe("sendDtmf", () => {
  it("is a no-op unless the call is established", async () => {
    const sp = new Softphone();
    const info = vi.fn(async (_opts: DtmfInfoOptions) => {});
    (sp as unknown as { session: unknown }).session = fakeSession(SessionState.Terminated, { info });
    await sp.sendDtmf("1");
    expect(info).not.toHaveBeenCalled();
  });

  it("uses the in-band handler when sip.js provides one", async () => {
    const sp = new Softphone();
    const sendDtmfInBand = vi.fn(() => true);
    const info = vi.fn(async (_opts: DtmfInfoOptions) => {});
    (sp as unknown as { session: unknown }).session = fakeSession(SessionState.Established, {
      sessionDescriptionHandler: { sendDtmf: sendDtmfInBand },
      info,
    });

    await sp.sendDtmf("7");
    expect(sendDtmfInBand).toHaveBeenCalledWith("7");
    expect(info).not.toHaveBeenCalled();
  });

  it("falls back to an RFC 2833 INFO body", async () => {
    const sp = new Softphone();
    const info = vi.fn(async (_opts: DtmfInfoOptions) => {});
    (sp as unknown as { session: unknown }).session = fakeSession(SessionState.Established, {
      sessionDescriptionHandler: {},
      info,
    });

    await sp.sendDtmf("7");
    expect(info).toHaveBeenCalledTimes(1);
    const arg = info.mock.calls[0][0] as {
      requestOptions: {
        body: { contentType: string; content: string; contentDisposition?: string };
      };
    };
    expect(arg.requestOptions.body.contentType).toBe("application/dtmf-relay");
    expect(arg.requestOptions.body.content).toContain("Signal=7");
  });
});

describe("disconnect", () => {
  it("clears transport state and reports idle", async () => {
    const sp = new Softphone();
    const unregister = vi.fn(async () => {});
    const stop = vi.fn(async () => {});
    const internal = sp as unknown as {
      registerer: unknown;
      ua: unknown;
      session: unknown;
    };
    internal.registerer = { unregister };
    internal.ua = { stop };
    internal.session = fakeSession(SessionState.Established);
    const onStatus = vi.fn();
    sp.onStatus = onStatus;

    await sp.disconnect();
    expect(unregister).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    expect(internal.ua).toBeNull();
    expect(internal.registerer).toBeNull();
    expect(sp.session).toBeNull();
    // setStatus always forwards its optional `detail` argument.
    expect(onStatus).toHaveBeenCalledWith("idle", undefined);
  });

  it("suppresses the status callback when silent", async () => {
    const sp = new Softphone();
    const onStatus = vi.fn();
    sp.onStatus = onStatus;
    await sp.disconnect(true);
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("still tears down when unregister rejects", async () => {
    const sp = new Softphone();
    const internal = sp as unknown as { ua: unknown; registerer: unknown };
    internal.registerer = { unregister: vi.fn(async () => Promise.reject(new Error("gone"))) };
    internal.ua = { stop: vi.fn(async () => {}) };

    await expect(sp.disconnect()).resolves.toBeUndefined();
    expect(internal.ua).toBeNull();
  });
});

describe("requestNotifyPermission", () => {
  it("reports unsupported when Notification is absent", async () => {
    const original = globalThis.Notification;
    // @ts-expect-error — deliberately removing the global for this assertion
    delete globalThis.Notification;
    await expect(Softphone.requestNotifyPermission()).resolves.toBe("unsupported");
    globalThis.Notification = original;
  });

  it("returns an already-granted permission without prompting", async () => {
    const requestPermission = vi.fn(async () => "granted");
    class FakeNotification {
      static permission = "granted";
      static requestPermission = requestPermission;
    }
    const original = globalThis.Notification;
    globalThis.Notification = FakeNotification as unknown as typeof Notification;

    await expect(Softphone.requestNotifyPermission()).resolves.toBe("granted");
    expect(requestPermission).not.toHaveBeenCalled();
    globalThis.Notification = original;
  });
});

describe("setOutputDevice", () => {
  it("ignores an empty device id", async () => {
    const sp = new Softphone();
    await sp.setOutputDevice("");
    expect((sp as unknown as { preferredSpeakerId: string }).preferredSpeakerId).toBe("");
  });

  it("clears the preference and resets the sink when setSinkId fails", async () => {
    const sp = new Softphone();
    const remote = document.querySelectorAll("audio")[document.querySelectorAll("audio").length - 2];
    const calls: string[] = [];
    (remote as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId = (
      (id: string) => {
        calls.push(id);
        return id ? Promise.reject(new Error("stale")) : Promise.resolve();
      }
    ) as never;

    await sp.setOutputDevice("sink-1");
    expect((sp as unknown as { preferredSpeakerId: string }).preferredSpeakerId).toBe("");
    expect(calls).toEqual(["sink-1", ""]);
  });

  it("keeps the preference when the sink is applied", async () => {
    const sp = new Softphone();
    const audios = document.querySelectorAll("audio");
    const remote = audios[audios.length - 2] as HTMLAudioElement & {
      setSinkId: (id: string) => Promise<void>;
    };
    remote.setSinkId = vi.fn(async () => {}) as never;

    await sp.setOutputDevice("sink-2");
    expect((sp as unknown as { preferredSpeakerId: string }).preferredSpeakerId).toBe("sink-2");
  });
});

describe("loadPreferredDevices", () => {
  /** Install a mediaDevices double returning the given device ids. */
  function stubDevices(inputIds: string[], outputIds: string[]) {
    const make = (kind: string, deviceId: string) => ({ kind, deviceId, groupId: "g" });
    const devices = [
      ...inputIds.map((id) => make("audioinput", id)),
      ...outputIds.map((id) => make("audiooutput", id)),
    ];
    (navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
      enumerateDevices: vi.fn(async () => devices),
      // The probe stream must expose getTracks() — the product stops each track
      // before enumerating.
      getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: () => {} }] })),
    };
    return devices;
  }

  it("drops saved ids that the browser no longer enumerates", async () => {
    localStorage.setItem(
      "munasip.audioDevices",
      JSON.stringify({ mic: "gone-mic", speaker: "spk-1", ring: "gone-ring" }),
    );
    stubDevices(["mic-1"], ["spk-1"]);

    const sp = new Softphone();
    await sp.loadPreferredDevices();

    const internal = sp as unknown as {
      preferredMicId: string;
      preferredSpeakerId: string;
      preferredRingId: string;
    };
    expect(internal.preferredMicId).toBe("");
    expect(internal.preferredSpeakerId).toBe("spk-1");
    expect(internal.preferredRingId).toBe("");
    expect(JSON.parse(localStorage.getItem("munasip.audioDevices") ?? "{}")).toEqual({
      mic: "",
      speaker: "spk-1",
      ring: "",
    });
  });

  it("keeps ids that are still present", async () => {
    localStorage.setItem(
      "munasip.audioDevices",
      JSON.stringify({ mic: "mic-1", speaker: "spk-1", ring: "ring-1" }),
    );
    stubDevices(["mic-1"], ["spk-1", "ring-1"]);

    const sp = new Softphone();
    await sp.loadPreferredDevices();

    const internal = sp as unknown as {
      preferredMicId: string;
      preferredSpeakerId: string;
      preferredRingId: string;
    };
    expect(internal.preferredMicId).toBe("mic-1");
    expect(internal.preferredSpeakerId).toBe("spk-1");
    expect(internal.preferredRingId).toBe("ring-1");
  });

  it("survives corrupt stored JSON and clears preferences", async () => {
    localStorage.setItem("munasip.audioDevices", "{not json");
    stubDevices(["mic-1"], ["spk-1"]);

    const sp = new Softphone();
    await expect(sp.loadPreferredDevices()).resolves.toBeUndefined();
    expect((sp as unknown as { preferredMicId: string }).preferredMicId).toBe("");
  });
});

describe("sdpWithoutPrivateHostCandidates", () => {
  const sdp = [
    "v=0",
    "c=IN IP4 192.168.1.20",
    "a=candidate:1 1 UDP 1 192.168.1.20 40000 typ host",
    "a=candidate:2 1 UDP 2 203.0.113.8 40000 typ srflx raddr 192.168.1.20 rport 40000",
    "a=candidate:3 1 UDP 3 198.51.100.4 50000 typ relay raddr 203.0.113.8 rport 40000",
  ].join("\r\n");

  it("drops host candidates when a public candidate is present", () => {
    const out = sdpWithoutPrivateHostCandidates(sdp);
    expect(out).not.toContain("typ host");
    expect(out).toContain("typ srflx");
    expect(out).toContain("typ relay");
  });

  it("keeps host candidates when they are the only path", () => {
    const lan = "a=candidate:1 1 UDP 1 192.168.1.20 40000 typ host";
    expect(sdpWithoutPrivateHostCandidates(lan)).toBe(lan);
  });
});