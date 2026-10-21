import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit coverage for asterisk/ari.ts — the ARI WebSocket client.
 *
 * `AriClient` is not exported; the module exports only the `ari` singleton, so
 * every case drives the real singleton and resets it via `stop()`.
 *
 * The socket layer is the point of this file: `ws` is replaced with a fake that
 * lets a test fire `open` / `message` / `close` / `error` deterministically, and
 * the reconnect backoff (3 s after close, 5 s after a throw) is driven with fake
 * timers.
 */

/**
 * `vi.mock` factories are hoisted above top-level declarations, so the fake
 * must be created via vi.hoisted or the factory throws "Cannot access before
 * initialization".
 */
const { FakeWebSocket } = vi.hoisted(() => {
  class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    url: string;
    closed = false;
    private handlers: Record<string, Array<(arg?: unknown) => void>> = {};

    constructor(url: string) {
      this.url = url;
      FakeWebSocket.instances.push(this);
    }
    on(ev: string, fn: (arg?: unknown) => void) {
      (this.handlers[ev] ??= []).push(fn);
      return this;
    }
    close() {
      this.closed = true;
    }
    /** Fire an event as the real socket would. */
    fire(ev: string, arg?: unknown) {
      for (const fn of this.handlers[ev] ?? []) fn(arg);
    }
  }
  return { FakeWebSocket };
});

vi.mock("ws", () => ({ default: FakeWebSocket }));

import { ari } from "./ari.js";

const last = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
  // health() hits the ARI REST endpoint on every start().
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
});

afterEach(() => {
  ari.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ari.health", () => {
  it("reports healthy and flips connected on a 2xx", async () => {
    await expect(ari.health()).resolves.toBe(true);
    expect(ari.connected).toBe(true);
  });

  it("reports unhealthy on a non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(ari.health()).resolves.toBe(false);
    expect(ari.connected).toBe(false);
  });

  it("reports unhealthy when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    await expect(ari.health()).resolves.toBe(false);
    expect(ari.connected).toBe(false);
  });
});

describe("ari.start — socket wiring", () => {
  it("opens one socket per application with an authenticated ws:// URL", async () => {
    await ari.start();
    expect(FakeWebSocket.instances).toHaveLength(3);
    for (const app of ["dsip-inbound", "dsip-flow", "dsip-outbound"]) {
      expect(FakeWebSocket.instances.some((w) => w.url.includes(`app=${app}`))).toBe(true);
    }
    const url = FakeWebSocket.instances[0]!.url;
    expect(url.startsWith("ws://")).toBe(true);
    expect(url).toContain("/ari/events?");
    // Credentials travel as an api_key query param, never in a header.
    expect(url).toContain("api_key=");
    expect(url).toContain("subscribeAll=false");
  });

  it("marks the client connected once a socket opens", async () => {
    await ari.start();
    // start() also calls health(), which sets `connected` from the REST probe,
    // so reset it to isolate the socket-open path.
    ari.connected = false;
    last().fire("open");
    expect(ari.connected).toBe(true);
  });

  it("reconnects 3s after a socket closes", async () => {
    await ari.start();
    expect(FakeWebSocket.instances).toHaveLength(3);

    last().fire("close");
    // Nothing happens before the backoff elapses.
    expect(FakeWebSocket.instances).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(2999);
    expect(FakeWebSocket.instances).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it("reconnects to the same app URL after a close", async () => {
    await ari.start();
    const original = last().url;
    last().fire("close");
    await vi.advanceTimersByTimeAsync(3000);
    expect(last().url).toBe(original);
  });

  it("survives a socket error without throwing", async () => {
    await ari.start();
    expect(() => last().fire("error", new Error("ECONNRESET"))).not.toThrow();
    // An error alone does not schedule a reconnect; close does.
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it("stop() closes every socket and stops polling", async () => {
    await ari.start();
    const sockets = [...FakeWebSocket.instances];
    ari.stop();
    expect(sockets.every((s) => s.closed)).toBe(true);
    // The poll interval is cleared, so advancing time opens nothing new.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });
});

describe("ari event handling", () => {
  beforeEach(async () => {
    await ari.start();
  });

  it("emits stasisStart for a StasisStart frame", async () => {
    const seen: unknown[] = [];
    ari.on("stasisStart", (ev) => seen.push(ev));
    last().fire(
      "message",
      JSON.stringify({
        type: "StasisStart",
        application: "dsip-flow",
        channel: { id: "ch-1" },
        args: ["main"],
      }),
    );
    expect(seen).toEqual([
      { application: "dsip-flow", channel: { id: "ch-1" }, args: ["main"] },
    ]);
  });

  it("ignores a malformed frame instead of throwing", async () => {
    expect(() => last().fire("message", "{not json")).not.toThrow();
  });

  it("ignores a frame with no channel id", async () => {
    const seen: unknown[] = [];
    ari.on("stasisStart", (ev) => seen.push(ev));
    last().fire("message", JSON.stringify({ type: "StasisStart" }));
    expect(seen).toHaveLength(0);
  });

  it("emits extension.state without keeping a stale copy", () => {
    const seen: unknown[] = [];
    ari.on("extension.state", (ev) => seen.push(ev));
    ari.setExtensionState("101", "dnd");
    expect(seen).toEqual([{ number: "101", state: "dnd" }]);
    expect((ari as unknown as { extensionStates?: unknown }).extensionStates).toBeUndefined();
  });
});

/** Route fetch by URL so health/poll/commands can each return their own body. */
function routeFetch(routes: Array<[RegExp, () => Response]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      for (const [re, make] of routes) if (re.test(url)) return make();
      return new Response("{}", { status: 200 });
    }),
  );
}

/** Run something that awaits an internal sleep under fake timers. */
async function withTimers<T>(fn: () => Promise<T>, ms = 500): Promise<T> {
  const running = fn();
  await vi.advanceTimersByTimeAsync(ms);
  return running;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = () => vi.mocked(globalThis.fetch) as unknown as ReturnType<typeof vi.fn>;

describe("ari REST commands", () => {
  it("answer POSTs to the channel answer endpoint", async () => {
    await ari.answer("ch-1");
    const [url, init] = fetchMock().mock.calls[0]!;
    expect(String(url)).toContain("/ari/channels/ch-1/answer");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("hangup DELETEs the channel", async () => {
    await ari.hangup("ch-2");
    const [url, init] = fetchMock().mock.calls[0]!;
    expect(String(url)).toContain("/ari/channels/ch-2");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("play returns the playback id and encodes media", async () => {
    routeFetch([[/\/play\?/, () => json({ id: "pb-7" })]]);
    await expect(ari.play("ch-3", "sound:hello")).resolves.toBe("pb-7");
    expect(String(fetchMock().mock.calls[0]![0])).toContain("media=sound%3Ahello");
  });

  it("play returns null when Asterisk rejects the request", async () => {
    routeFetch([[/\/play\?/, () => new Response("no such media", { status: 404 })]]);
    await expect(ari.play("ch-3", "sound:missing")).resolves.toBeNull();
  });

  it("record records a snoop channel, never the call channel itself", async () => {
    routeFetch([
      [/\/channels\/ch-4\/snoop\?/, () => json({ id: "snoop-9" })],
      [/\/record\?/, () => json({ name: "MixMonitor/rec-1" })],
    ]);
    await expect(ari.record("ch-4", "rec-1")).resolves.toBe("MixMonitor/rec-1");
    const urls = fetchMock().mock.calls.map((c) => String(c[0]));
    // A record operation on ch-4 would queue every later playback behind it.
    expect(urls.some((u) => u.includes("/channels/ch-4/record"))).toBe(false);
    expect(urls[0]).toContain("spy=both");
    expect(urls[0]).toContain("appArgs=snoop-wait");
    expect(urls[1]).toContain("/channels/snoop-9/record?");
    expect(urls[1]).toContain("format=wav");
    expect(urls[1]).toContain("ifExists=overwrite");
  });

  it("record returns null when the snoop cannot be created", async () => {
    routeFetch([[/\/snoop\?/, () => new Response("gone", { status: 404 })]]);
    await expect(ari.record("ch-4", "rec-1")).resolves.toBeNull();
  });

  it("record returns null on failure", async () => {
    routeFetch([
      [/\/snoop\?/, () => json({ id: "snoop-9" })],
      [/\/record\?/, () => new Response("busy", { status: 500 })],
    ]);
    await expect(ari.record("ch-4", "rec-1")).resolves.toBeNull();
  });

  it("addToBridge POSTs the channel onto the bridge", async () => {
    // 204 forbids a response body, so pass null.
    routeFetch([[/addChannel\?/, () => new Response(null, { status: 204 })]]);
    await expect(ari.addToBridge("br-1", "ch-5")).resolves.toBe(true);
    expect(String(fetchMock().mock.calls[0]![0])).toContain("/ari/bridges/br-1/addChannel?channel=ch-5");
  });

  it("originate returns the created channel body", async () => {
    routeFetch([[/\/ari\/channels\?/, () => json({ id: "ch-new" })]]);
    await expect(
      ari.originate({ endpoint: "PJSIP/101", extension: "1000", callerId: "DSip <100>" }),
    ).resolves.toEqual({ id: "ch-new" });
    const url = String(fetchMock().mock.calls[0]![0]);
    expect(url).toContain("endpoint=PJSIP%2F101");
    expect(url).toContain("callerId=DSip");
  });

  it("originate throws with the Asterisk error text", async () => {
    routeFetch([[/\/ari\/channels\?/, () => new Response("Allocation failed", { status: 503 })]]);
    await expect(
      ari.originate({ endpoint: "PJSIP/101", extension: "1000" }),
    ).rejects.toThrow(/Originate failed: Allocation failed/);
  });

  it.each([
    ["online", true],
    ["offline", false],
    ["unknown", false],
  ])("isEndpointOnline maps ARI state %s to %s", async (state, expected) => {
    routeFetch([[/endpoints\/PJSIP/, () => json({ state })]]);
    await expect(ari.isEndpointOnline("101")).resolves.toBe(expected);
  });

  it("isEndpointOnline is false on a non-2xx and on a thrown request", async () => {
    routeFetch([[/endpoints\/PJSIP/, () => new Response("", { status: 404 })]]);
    await expect(ari.isEndpointOnline("101")).resolves.toBe(false);

    routeFetch([[/endpoints\/PJSIP/, () => Promise.reject(new Error("down")) as never]]);
    await expect(ari.isEndpointOnline("101")).resolves.toBe(false);
  });

  it("redirect continues the dialplan with context and extension", async () => {
    routeFetch([[/\/continue\?/, () => new Response("", { status: 200 })]]);
    await withTimers(() => ari.redirect("ch-6", "101", "from-internal"));
    const url = String(fetchMock().mock.calls[0]![0]);
    expect(url).toContain("context=from-internal");
    expect(url).toContain("extension=101");
    expect(url).toContain("priority=1");
  });

  it("redirect hangs up the channel when continue is refused", async () => {
    routeFetch([[/\/continue\?/, () => new Response("bad", { status: 500 })]]);
    const hangup = vi.spyOn(ari, "hangup").mockResolvedValue(undefined);
    await withTimers(() => ari.redirect("ch-7", "101"));
    expect(hangup).toHaveBeenCalledWith("ch-7");
    hangup.mockRestore();
  });

  it("redirect hangs up when the request throws outright", async () => {
    routeFetch([[/\/continue\?/, () => Promise.reject(new Error("ECONNRESET")) as never]]);
    const hangup = vi.spyOn(ari, "hangup").mockResolvedValue(undefined);
    await withTimers(() => ari.redirect("ch-8", "101"));
    expect(hangup).toHaveBeenCalledWith("ch-8");
    hangup.mockRestore();
  });
});

describe("ari.hangupOrphanSnoops", () => {
  it("hangs up only Snoop/ channels and reports the count", async () => {
    routeFetch([
      [
        /\/ari\/channels$/,
        () =>
          json([
            { id: "c1", name: "PJSIP/101-0001" },
            { id: "c2", name: "Snoop/c9-000001" },
            { id: "c3", name: "Snoop/c9-000002" },
          ]),
      ],
      ]);
    // This routine issues its own DELETE fetches rather than calling
    // ari.hangup(), so the assertion has to be made on the wire calls.
    await expect(ari.hangupOrphanSnoops()).resolves.toBe(2);
    const deletes = fetchMock().mock.calls.filter(
      ([, init]) => (init as RequestInit).method === "DELETE",
    );
    expect(deletes).toHaveLength(2);
    const targets = deletes.map(([url]) => String(url));
    expect(targets.some((u) => u.endsWith("/c2"))).toBe(true);
    expect(targets.some((u) => u.endsWith("/c3"))).toBe(true);
    expect(targets.some((u) => u.endsWith("/c1"))).toBe(false);
  });

  it("returns 0 when the channel list cannot be read", async () => {
    routeFetch([[/\/ari\/channels$/, () => new Response("", { status: 500 })]]);
    await expect(ari.hangupOrphanSnoops()).resolves.toBe(0);
  });

  it("returns 0 when the request throws", async () => {
    routeFetch([[/\/ari\/channels$/, () => Promise.reject(new Error("down")) as never]]);
    await expect(ari.hangupOrphanSnoops()).resolves.toBe(0);
  });

  it("falls back to deleting by channel name when the DELETE-by-id fails", async () => {
    routeFetch([
      [
        /\/ari\/channels$/,
        () => json([{ id: "c2", name: "Snoop/c9-000001" }]),
      ],
      // By-id delete is refused (some Asterisk builds need the name instead),
      // the by-name delete then succeeds.
      [/\/ari\/channels\/c2/, () => new Response("no", { status: 500 })],
      [
        /\/ari\/channels\/Snoop%2Fc9-000001/,
        () => new Response(null, { status: 204 }),
      ],
    ]);
    await expect(ari.hangupOrphanSnoops()).resolves.toBe(1);
    const urls = fetchMock().mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes("/ari/channels/Snoop%2Fc9-000001"))).toBe(true);
  });

  it("does not count the channel when both id and name deletes fail", async () => {
    routeFetch([
      [/\/ari\/channels$/, () => json([{ id: "c2", name: "Snoop/c9-000001" }])],
      [/\/ari\/channels\//, () => new Response("no", { status: 500 })],
    ]);
    await expect(ari.hangupOrphanSnoops()).resolves.toBe(0);
  });
});

describe("ari.poll", () => {
  /** Let the 5 s poll interval fire and settle. */
  async function pollOnce() {
    const running = ari.start();
    await vi.advanceTimersByTimeAsync(0);
    await running;
    await vi.advanceTimersByTimeAsync(5000);
  }

  it("populates the calls map and emits it", async () => {
    routeFetch([
      [
        /\/ari\/channels$/,
        () =>
          json([
            {
              id: "p1",
              name: "PJSIP/101-000001",
              state: "Up",
              caller: { number: "1000" },
              connected: { number: "101" },
              creationtime: "2026-01-01T00:00:00Z",
            },
          ]),
      ],
    ]);
    const seen: unknown[] = [];
    ari.on("calls", (c) => seen.push(c));

    await pollOnce();

    expect(ari.calls.get("p1")).toMatchObject({
      id: "p1",
      caller: "1000",
      callee: "101",
      state: "Up",
      tech: "PJSIP",
      startedAt: "2026-01-01T00:00:00Z",
    });
    expect(seen.length).toBeGreaterThan(0);
  });

  it("hides Snoop/ helper channels from the admin call list", async () => {
    routeFetch([
      [
        /\/ari\/channels$/,
        () =>
          json([
            { id: "p1", name: "PJSIP/101-000001", state: "Up" },
            { id: "s1", name: "Snoop/p1-000009", state: "Up", dialplan: { app_name: "Stasis", app_data: "snoop-wait" } },
          ]),
      ],
    ]);
    await pollOnce();
    expect(ari.calls.has("p1")).toBe(true);
    expect(ari.calls.has("s1")).toBe(false);
  });

  it("hangs up an orphan snoop whose target is gone", async () => {
    routeFetch([
      [
        /\/ari\/channels$/,
        () =>
          json([
            { id: "s1", name: "Snoop/gone-000009", state: "Up", dialplan: { app_name: "Stasis", app_data: "snoop-wait" } },
          ]),
      ],
    ]);
    const hangup = vi.spyOn(ari, "hangup").mockResolvedValue(undefined);

    await pollOnce();
    expect(hangup).toHaveBeenCalledWith("s1");
    hangup.mockRestore();
  });

  it("leaves a live snoop alone when its target still exists", async () => {
    routeFetch([
      [
        /\/ari\/channels$/,
        () =>
          json([
            { id: "p1", name: "PJSIP/101-000001", state: "Up" },
            { id: "s1", name: "Snoop/p1-000009", state: "Up", dialplan: { app_name: "Stasis", app_data: "snoop-wait" } },
          ]),
      ],
    ]);
    const hangup = vi.spyOn(ari, "hangup").mockResolvedValue(undefined);

    await pollOnce();
    expect(hangup).not.toHaveBeenCalled();
    hangup.mockRestore();
  });

  it("keeps the last-known call list when Asterisk is unreachable", async () => {
    // poll() returns early when health() fails, so the last-known list is
    // deliberately preserved rather than blanked.
    ari.calls.clear();
    ari.calls.set("stale", {
      id: "stale",
      name: "PJSIP/101-000001",
      caller: "1000",
      callee: "101",
      state: "Up",
      startedAt: "2026-01-01T00:00:00Z",
      tech: "PJSIP",
    });
    routeFetch([[/asterisk\/info/, () => new Response("", { status: 500 })]]);
    await pollOnce();
    expect(ari.calls.has("stale")).toBe(true);
  });
});
  describe("ari.chanspy", () => {
  const spy = { spyChannelId: "t1", listenerEndpoint: "PJSIP/101" };

  /** Routes for a fully successful spy attempt; override one at a time. */
  function spyRoutes(): Array<[RegExp, () => Response]> {
    return [
      [/endpoints\/PJSIP\/101/, () => json({ state: "online" })],
      // Target channel lookup. Anchored with $ — an unanchored pattern also
      // matches /ari/channels/t1/snoop?... and would return the wrong body.
      [/\/ari\/channels\/t1$/, () => json({ name: "PJSIP/101-0001" })],
      [/\/snoop\?/, () => json({ id: "sp-1" })],
      [/\/ari\/bridges\?type=mixing/, () => json({ id: "br-1" })],
      [/\/addChannel\?/, () => new Response(null, { status: 204 })],
      [/\/ari\/channels\?/, () => json({ id: "ch-listener" })],
    ];
  }

  it("bridges an online listener and returns the snoop/bridge ids", async () => {
    routeFetch(spyRoutes());
    await expect(ari.chanspy(spy)).resolves.toEqual({
      snoopId: "sp-1",
      bridgeId: "br-1",
      listener: { id: "ch-listener" },
    });
  });

  it("strips a case-insensitive PJSIP/ prefix before checking registration", async () => {
    routeFetch(spyRoutes());
    await ari.chanspy({ spyChannelId: "t1", listenerEndpoint: "pjsip/101" });
    const endpointUrl = fetchMock()
      .mock.calls.map(([u]) => String(u))
      .find((u) => u.includes("/endpoints/"))!;
    // If the prefix were not stripped the URL would be /PJSIP/pjsip/101.
    expect(endpointUrl).toContain("/ari/endpoints/PJSIP/101");
    expect(endpointUrl).not.toContain("PJSIP/pjsip");
  });

  it("refuses when the listener endpoint is not registered", async () => {
    routeFetch([[/endpoints\/PJSIP\/101/, () => json({ state: "offline" })]]);
    await expect(ari.chanspy(spy)).rejects.toThrow(
      /Spy listener 101 is not registered/,
    );
    // Nothing was snooped.
    expect(fetchMock().mock.calls.some(([u]) => String(u).includes("/snoop"))).toBe(false);
  });

  it("rejects when the target channel has gone away", async () => {
    routeFetch([
      [/endpoints\/PJSIP\/101/, () => json({ state: "online" })],
      [/\/ari\/channels\/t1$/, () => new Response("gone", { status: 404 })],
    ]);
    await expect(ari.chanspy(spy)).rejects.toThrow("Call channel no longer exists");
  });

  it("refuses to snoop a snoop helper channel", async () => {
    routeFetch([
      [/endpoints\/PJSIP\/101/, () => json({ state: "online" })],
      [/\/ari\/channels\/t1$/, () => json({ name: "Snoop/other-0001" })],
    ]);
    await expect(ari.chanspy(spy)).rejects.toThrow(/Cannot spy on a snoop channel/);
  });

  it("surfaces a snoop failure", async () => {
    routeFetch([
      [/endpoints\/PJSIP\/101/, () => json({ state: "online" })],
      [/\/ari\/channels\/t1$/, () => json({ name: "PJSIP/101-0001" })],
      [/\/snoop\?/, () => new Response("no such channel", { status: 400 })],
    ]);
    await expect(ari.chanspy(spy)).rejects.toThrow(/Snoop failed: no such channel/);
  });

  it.each([
    ["spy", "none"],
    ["whisper", "out"],
    ["barge", "both"],
  ])("maps mode %s to whisper=%s", async (mode, whisper) => {
    routeFetch(spyRoutes());
    await ari.chanspy({ ...spy, mode: mode as "spy" | "whisper" | "barge" });
    const snoopUrl = fetchMock()
      .mock.calls.map(([u]) => String(u))
      .find((u) => u.includes("/snoop?"));
    expect(snoopUrl).toContain(`whisper=${whisper}`);
    expect(snoopUrl).toContain("spy=both");
  });

  it("labels the listener leg as a DSip Spy call", async () => {
    routeFetch(spyRoutes());
    await ari.chanspy(spy);
    const origUrl = fetchMock()
      .mock.calls.map(([u]) => String(u))
      .find((u) => u.includes("endpoint="));
    // URLSearchParams encodes spaces as "+", not %20.
    expect(origUrl).toContain("callerId=%22DSip+Spy%22+%3C101%3E");
    expect(origUrl).toContain("appArgs=bridge%2Cbr-1");
  });

  it("translates an allocation failure into an actionable error", async () => {
    routeFetch([
      [/endpoints\/PJSIP\/101/, () => json({ state: "online" })],
      [/\/ari\/channels\/t1$/, () => json({ name: "PJSIP/101-0001" })],
      [/\/snoop\?/, () => json({ id: "sp-1" })],
      [/\/ari\/bridges\?type=mixing/, () => json({ id: "br-1" })],
      [/\/addChannel\?/, () => new Response(null, { status: 204 })],
      [/\/ari\/channels\?/, () => new Response("Allocation failed", { status: 403 })],
    ]);
    await expect(ari.chanspy(spy)).rejects.toThrow(
      /Spy listener 101 could not be called \(offline or busy\)/,
    );
  });

  it("reports a generic originate failure distinctly", async () => {
    routeFetch([
      [/endpoints\/PJSIP\/101/, () => json({ state: "online" })],
      [/\/ari\/channels\/t1$/, () => json({ name: "PJSIP/101-0001" })],
      [/\/snoop\?/, () => json({ id: "sp-1" })],
      [/\/ari\/bridges\?type=mixing/, () => json({ id: "br-1" })],
      [/\/addChannel\?/, () => new Response(null, { status: 204 })],
      [/\/ari\/channels\?/, () => new Response("channel limit", { status: 503 })],
    ]);
    await expect(ari.chanspy(spy)).rejects.toThrow(/Spy originate failed: channel limit/);
  });

  it("cleans up the snoop channel and bridge when a later step fails", async () => {
    routeFetch([
      [/endpoints\/PJSIP\/101/, () => json({ state: "online" })],
      [/\/ari\/channels\/t1$/, () => json({ name: "PJSIP/101-0001" })],
      [/\/snoop\?/, () => json({ id: "sp-1" })],
      [/\/ari\/bridges\?type=mixing/, () => json({ id: "br-1" })],
      [/\/addChannel\?/, () => new Response(null, { status: 204 })],
      [/\/ari\/channels\?/, () => new Response("nope", { status: 503 })],
    ]);
    const hangup = vi.spyOn(ari, "hangup").mockResolvedValue(undefined);

    await expect(ari.chanspy(spy)).rejects.toThrow();

    // Orphan cleanup is what stops the live-calls list filling with snoop/bridge
    // pairs that have no listener.
    expect(hangup).toHaveBeenCalledWith("sp-1");
    await vi.advanceTimersByTimeAsync(0);
    expect(
      fetchMock()
        .mock.calls.map(([u, i]) => [String(u), (i as RequestInit)?.method])
        .some(([u, m]) => u.includes("/ari/bridges/br-1") && m === "DELETE"),
    ).toBe(true);
    hangup.mockRestore();
  });

  it("hangs up the snoop channel when bridge creation itself fails", async () => {
    routeFetch([
      [/endpoints\/PJSIP\/101/, () => json({ state: "online" })],
      [/\/ari\/channels\/t1$/, () => json({ name: "PJSIP/101-0001" })],
      [/\/snoop\?/, () => json({ id: "sp-1" })],
      [/\/ari\/bridges\?type=mixing/, () => new Response("no bridges", { status: 500 })],
    ]);
    const hangup = vi.spyOn(ari, "hangup").mockResolvedValue(undefined);

    await expect(ari.chanspy(spy)).rejects.toThrow(/Bridge create failed: no bridges/);
    // No bridgeId was assigned, so only the snoop channel is cleaned up.
    expect(hangup).toHaveBeenCalledWith("sp-1");
    await vi.advanceTimersByTimeAsync(0);
    expect(
      fetchMock()
        .mock.calls.map(([u]) => String(u))
        .some((u) => /\/ari\/bridges\/br-1/.test(u)),
    ).toBe(false);
    hangup.mockRestore();
  });
});

describe("ari.playAndWait", () => {
  /** `play()` POSTs here; `ids` lets a test fail the first N attempts. */
  function playRoute(ids: Array<string | null>) {
    let n = 0;
    routeFetch([
      [
        /\/play\?/,
        () => {
          const id = ids[n++] ?? null;
          return id ? json({ id }) : new Response("no media", { status: 404 });
        },
      ],
    ]);
  }
  const playCalls = () =>
    fetchMock().mock.calls.filter(([u]) => String(u).includes("/play?")).length;

  beforeEach(async () => {
    await ari.start(); // a socket is needed to deliver the playback event
  });

  it("retries once after a 400ms settle when the first play returns no id", async () => {
    playRoute([null, "pb-1"]);

    const running = ari.playAndWait("ch-1", "sound:hi", 30_000);
    await vi.advanceTimersByTimeAsync(0); // first play fails, 400ms settle armed
    expect(playCalls()).toBe(1);

    // Nothing happens until the settle window elapses.
    await vi.advanceTimersByTimeAsync(399);
    expect(playCalls()).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(playCalls()).toBe(2);

    last().fire(
      "message",
      JSON.stringify({ type: "PlaybackFinished", playback: { id: "pb-1" } }),
    );
    await expect(running).resolves.toBe(true);
  });

  it("returns false when both play attempts fail", async () => {
    playRoute([null, null]);

    const running = ari.playAndWait("ch-1", "sound:hi", 30_000);
    await vi.advanceTimersByTimeAsync(400);

    await expect(running).resolves.toBe(false);
    expect(playCalls()).toBe(2);
  });

  it("does not retry when the first play succeeds", async () => {
    playRoute(["pb-1"]);

    const running = ari.playAndWait("ch-1", "sound:hi", 30_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(playCalls()).toBe(1);

    last().fire(
      "message",
      JSON.stringify({ type: "PlaybackFinished", playback: { id: "pb-1" } }),
    );
    await expect(running).resolves.toBe(true);
    // No further play attempt regardless of how long we then wait.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(playCalls()).toBe(1);
  });

  it.each(["PlaybackFinished", "PlaybackFailed"])(
    "resolves the waiter on %s",
    async (eventType) => {
      playRoute(["pb-1"]);

      const running = ari.playAndWait("ch-1", "sound:hi", 30_000);
      await vi.advanceTimersByTimeAsync(0);

      last().fire(
        "message",
        JSON.stringify({ type: eventType, playback: { id: "pb-1" } }),
      );
      // Both outcomes resolve — a failed playback must not leave the caller
      // blocked for the full timeout.
      await expect(running).resolves.toBe(true);
    },
  );

  it("resolves true when the wait times out with no playback event", async () => {
    playRoute(["pb-1"]);

    const running = ari.playAndWait("ch-1", "sound:hi", 1_000);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);

    // The timeout path resolves rather than rejecting, so a silent Asterisk
    // cannot throw out of the caller.
    await expect(running).resolves.toBe(true);
  });

  it("ignores a playback event for a different playback id", async () => {
    playRoute(["pb-1"]);

    const running = ari.playAndWait("ch-1", "sound:hi", 1_000);
    await vi.advanceTimersByTimeAsync(0);

    last().fire(
      "message",
      JSON.stringify({ type: "PlaybackFinished", playback: { id: "other" } }),
    );
    // The real waiter is still pending, so only its own timeout can settle it.
    let settled = false;
    void running.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(running).resolves.toBe(true);
  });
});

describe("ari DTMF waiters", () => {
  beforeEach(async () => {
    await ari.start();
  });

  it("resolves a waiter when a digit frame arrives", async () => {
    const waiting = ari.waitDtmf("ch-9", 5000);
    last().fire(
      "message",
      JSON.stringify({ type: "ChannelDtmfReceived", channel: { id: "ch-9" }, digit: "7" }),
    );
    await expect(waiting).resolves.toBe("7");
  });

  it("resolves null on timeout", async () => {
    const waiting = ari.waitDtmf("ch-10", 3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(waiting).resolves.toBeNull();
  });

  it("drains digits buffered before the waiter was registered", async () => {
    // A digit pressed while no waiter existed is buffered, and a later waiter
    // consumes it immediately instead of waiting for the wire.
    last().fire(
      "message",
      JSON.stringify({ type: "ChannelDtmfReceived", channel: { id: "ch-11" }, digit: "4" }),
    );
    await expect(ari.waitDtmf("ch-11", 1000)).resolves.toBe("4");
  });

  it("collects multiple digits up to maxDigits", async () => {
    const waiting = ari.waitDtmfDigits("ch-12", { maxDigits: 3, firstTimeoutMs: 5000 });
    for (const d of ["1", "2"]) {
      last().fire(
        "message",
        JSON.stringify({ type: "ChannelDtmfReceived", channel: { id: "ch-12" }, digit: d }),
      );
    }
    last().fire(
      "message",
      JSON.stringify({ type: "ChannelDtmfReceived", channel: { id: "ch-12" }, digit: "3" }),
    );
    await expect(waiting).resolves.toBe("123");
  });
});