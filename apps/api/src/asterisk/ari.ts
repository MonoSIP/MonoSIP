import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { config } from "../config.js";

export type LiveCall = {
  id: string;
  name: string;
  caller: string;
  callee: string;
  state: string;
  startedAt: string;
  /** PJSIP / Local / Snoop / … */
  tech: string;
};

export type ExtensionState = {
  number: string;
  state: "idle" | "ringing" | "busy" | "unavailable" | "dnd";
};

type AriEvent = {
  type: string;
  application?: string;
  channel?: { id: string; caller?: { number?: string }; state?: string };
  digit?: string;
  playback?: { id: string };
  args?: string[];
};

class AriClient extends EventEmitter {
  connected = false;
  calls = new Map<string, LiveCall>();
  extensionStates = new Map<string, ExtensionState>();
  private pollTimer?: NodeJS.Timeout;
  private sockets: WebSocket[] = [];
  private dtmfWaiters = new Map<string, { resolve: (d: string | null) => void; timer: NodeJS.Timeout }>();
  private playbackWaiters = new Map<string, { resolve: () => void; channelId: string }>();
  /** Digits pressed while no waiter (e.g. during menu prompt playback). */
  private dtmfBuffers = new Map<string, string[]>();
  private activePlaybackByChannel = new Map<string, string>();

  private authHeader() {
    return (
      "Basic " +
      Buffer.from(`${config.asterisk.ariUser}:${config.asterisk.ariPassword}`).toString(
        "base64",
      )
    );
  }

  private apiKey() {
    return `${config.asterisk.ariUser}:${config.asterisk.ariPassword}`;
  }

  private baseUrl() {
    return config.asterisk.ariUrl.replace(/\/$/, "");
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl()}/ari/asterisk/info`, {
        headers: { Authorization: this.authHeader() },
        signal: AbortSignal.timeout(2500),
      });
      this.connected = res.ok;
      return res.ok;
    } catch {
      this.connected = false;
      return false;
    }
  }

  async start() {
    await this.health();
    this.pollTimer = setInterval(() => void this.poll(), 5000);
    this.connectApps(["dsip-inbound", "dsip-flow", "dsip-outbound"]);
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    for (const s of this.sockets) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
    this.sockets = [];
  }

  private connectApps(apps: string[]) {
    const httpBase = this.baseUrl();
    const wsBase = httpBase.replace(/^http/, "ws");
    for (const app of apps) {
      const url = `${wsBase}/ari/events?api_key=${encodeURIComponent(this.apiKey())}&app=${encodeURIComponent(app)}&subscribeAll=false`;
      this.openSocket(app, url);
    }
  }

  private openSocket(app: string, url: string) {
    try {
      const ws = new WebSocket(url);
      this.sockets.push(ws);
      ws.on("open", () => {
        console.log(`[ari] WS connected app=${app}`);
        this.connected = true;
      });
      ws.on("message", (raw) => {
        try {
          const ev = JSON.parse(String(raw)) as AriEvent;
          this.handleEvent(ev);
        } catch {
          /* ignore */
        }
      });
      ws.on("close", () => {
        this.sockets = this.sockets.filter((s) => s !== ws);
        console.warn(`[ari] WS closed app=${app}, reconnecting…`);
        setTimeout(() => this.openSocket(app, url), 3000);
      });
      ws.on("error", (err) => {
        console.warn(`[ari] WS error app=${app}`, err.message);
      });
    } catch (e) {
      console.warn(`[ari] WS connect failed app=${app}`, e);
      setTimeout(() => this.openSocket(app, url), 5000);
    }
  }

  private handleEvent(ev: AriEvent) {
    if (ev.type === "StasisStart" && ev.channel?.id) {
      this.emit("stasisStart", {
        application: ev.application ?? "",
        channel: ev.channel,
        args: ev.args ?? [],
      });
    }
    if (ev.type === "ChannelDtmfReceived" && ev.channel?.id && ev.digit) {
      console.log(`[ari] DTMF ${ev.digit} on ${ev.channel.id}`);
      const ch = ev.channel.id;
      const w = this.dtmfWaiters.get(ch);
      if (w) {
        clearTimeout(w.timer);
        this.dtmfWaiters.delete(ch);
        w.resolve(ev.digit);
      } else {
        const buf = this.dtmfBuffers.get(ch) ?? [];
        buf.push(ev.digit);
        this.dtmfBuffers.set(ch, buf);
        // Stop menu prompt so we can act on the digit immediately
        const pb = this.activePlaybackByChannel.get(ch);
        if (pb) void this.stopPlayback(pb);
      }
      this.emit("dtmf", { channelId: ch, digit: ev.digit });
    }
    if (
      (ev.type === "PlaybackFinished" || ev.type === "PlaybackFailed") &&
      ev.playback?.id
    ) {
      const w = this.playbackWaiters.get(ev.playback.id);
      if (w) {
        this.playbackWaiters.delete(ev.playback.id);
        w.resolve();
      }
      for (const [ch, pb] of this.activePlaybackByChannel) {
        if (pb === ev.playback.id) this.activePlaybackByChannel.delete(ch);
      }
    }
    if (ev.type === "StasisEnd" && ev.channel?.id) {
      const w = this.dtmfWaiters.get(ev.channel.id);
      if (w) {
        clearTimeout(w.timer);
        this.dtmfWaiters.delete(ev.channel.id);
        w.resolve(null);
      }
      this.dtmfBuffers.delete(ev.channel.id);
      this.activePlaybackByChannel.delete(ev.channel.id);
    }
    // Channel fully gone (after dialplan Dial/Hangup too) — finalize deferred CDR
    if (
      (ev.type === "ChannelDestroyed" || ev.type === "ChannelHangupRequest") &&
      ev.channel?.id
    ) {
      if (ev.type === "ChannelDestroyed") {
        this.emit("channelDestroyed", ev.channel.id);
      }
    }
  }

  private async poll() {
    const ok = await this.health();
    if (!ok) return;
    try {
      const res = await fetch(`${this.baseUrl()}/ari/channels`, {
        headers: { Authorization: this.authHeader() },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return;
      const channels = (await res.json()) as Array<{
        id: string;
        name?: string;
        state: string;
        caller?: { number?: string };
        connected?: { number?: string };
        creationtime?: string;
        dialplan?: { app_name?: string; app_data?: string };
      }>;

      // Hang up orphan snoop channels whose spy target is gone
      const byId = new Map(channels.map((c) => [c.id, c]));
      for (const ch of channels) {
        const name = ch.name ?? "";
        if (!name.startsWith("Snoop/")) continue;
        // Snoop/<targetId>-NNNNNN
        const m = name.match(/^Snoop\/([^-]+)-/);
        const targetId = m?.[1];
        const target = targetId ? byId.get(targetId) : undefined;
        const targetGone = !target || (target.name ?? "").startsWith("Snoop/");
        const waiting =
          ch.dialplan?.app_name === "Stasis" &&
          String(ch.dialplan?.app_data ?? "").includes("snoop-wait");
        if (waiting && targetGone) {
          console.log(`[ari] hanging orphan snoop ${ch.id} (${name})`);
          void this.hangup(ch.id);
        }
      }

      this.calls.clear();
      for (const ch of channels) {
        const name = ch.name ?? ch.id;
        // Hide snoop helper channels from the admin "active calls" list
        if (name.startsWith("Snoop/")) continue;
        const tech = name.split("/")[0] ?? "";
        this.calls.set(ch.id, {
          id: ch.id,
          name,
          caller: ch.caller?.number ?? "",
          callee: ch.connected?.number ?? "",
          state: ch.state,
          startedAt: ch.creationtime ?? new Date().toISOString(),
          tech,
        });
      }
      this.emit("calls", [...this.calls.values()]);
    } catch {
      /* ignore poll errors */
    }
  }

  async answer(channelId: string) {
    await fetch(`${this.baseUrl()}/ari/channels/${channelId}/answer`, {
      method: "POST",
      headers: { Authorization: this.authHeader() },
    });
  }

  async hangup(channelId: string) {
    await fetch(`${this.baseUrl()}/ari/channels/${channelId}`, {
      method: "DELETE",
      headers: { Authorization: this.authHeader() },
    });
  }

  /** Hang up every Snoop/* channel (cleanup after failed spy attempts). */
  async hangupOrphanSnoops(): Promise<number> {
    try {
      const res = await fetch(`${this.baseUrl()}/ari/channels`, {
        headers: { Authorization: this.authHeader() },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return 0;
      const channels = (await res.json()) as Array<{ id: string; name?: string }>;
      let n = 0;
      for (const ch of channels) {
        if (!(ch.name ?? "").startsWith("Snoop/")) continue;
        const byId = await fetch(`${this.baseUrl()}/ari/channels/${ch.id}`, {
          method: "DELETE",
          headers: { Authorization: this.authHeader() },
        });
        if (byId.ok || byId.status === 204) {
          n++;
          continue;
        }
        // Fallback: some Asterisk builds need the channel name
        const byName = await fetch(
          `${this.baseUrl()}/ari/channels/${encodeURIComponent(ch.name!)}`,
          { method: "DELETE", headers: { Authorization: this.authHeader() } },
        );
        if (byName.ok || byName.status === 204) n++;
      }
      return n;
    } catch {
      return 0;
    }
  }

  /** Start channel recording (WAV under Asterisk recording dir). */
  /**
   * Record a call without blocking it. ARI `channels/{id}/record` is a channel
   * operation like playback: while it runs, later plays queue behind it — the IVR's
   * "Calling extension…" prompt never started and transfers stalled in silence.
   * Record a snoop channel instead (both directions, parked in Stasis via
   * `snoop-wait`); it follows the caller through dialplan and ends at hangup.
   */
  async record(channelId: string, name: string): Promise<string | null> {
    const snoopParams = new URLSearchParams({ spy: "both", app: "dsip-flow", appArgs: "snoop-wait" });
    const snoopRes = await fetch(`${this.baseUrl()}/ari/channels/${channelId}/snoop?${snoopParams}`, {
      method: "POST",
      headers: { Authorization: this.authHeader() },
    });
    if (!snoopRes.ok) {
      console.warn("[ari] record snoop failed", await snoopRes.text());
      return null;
    }
    const snoop = (await snoopRes.json()) as { id?: string };
    if (!snoop.id) return null;
    const params = new URLSearchParams({
      name,
      format: "wav",
      beep: "false",
      terminateOn: "none",
      ifExists: "overwrite",
    });
    const res = await fetch(
      `${this.baseUrl()}/ari/channels/${snoop.id}/record?${params}`,
      {
        method: "POST",
        headers: { Authorization: this.authHeader() },
      },
    );
    if (!res.ok) {
      console.warn("[ari] record failed", await res.text());
      return null;
    }
    const body = (await res.json()) as { name?: string };
    return body.name ?? name;
  }

  /** Snoop a live channel (spy/whisper/barge) and bridge the listener. */
  async chanspy(opts: {
    spyChannelId: string;
    listenerEndpoint: string;
    mode?: "spy" | "whisper" | "barge";
  }) {
    const ext = opts.listenerEndpoint.replace(/^PJSIP\//i, "");
    if (!(await this.isEndpointOnline(ext))) {
      throw new Error(
        `Spy listener ${ext} is not registered. Open softphone as ${ext} (or pick an online extension).`,
      );
    }

    // Don't spy on snoop helper channels or already-gone targets
    const targetRes = await fetch(`${this.baseUrl()}/ari/channels/${opts.spyChannelId}`, {
      headers: { Authorization: this.authHeader() },
      signal: AbortSignal.timeout(2500),
    });
    if (!targetRes.ok) throw new Error("Call channel no longer exists");
    const target = (await targetRes.json()) as { name?: string };
    if ((target.name ?? "").startsWith("Snoop/")) {
      throw new Error("Cannot spy on a snoop channel — refresh live calls");
    }

    const spy = "both";
    const whisper =
      opts.mode === "whisper" ? "out" : opts.mode === "barge" ? "both" : "none";
    const snoopParams = new URLSearchParams({
      spy,
      whisper,
      app: "dsip-flow",
      appArgs: "snoop-wait",
    });
    const snoopRes = await fetch(
      `${this.baseUrl()}/ari/channels/${opts.spyChannelId}/snoop?${snoopParams}`,
      { method: "POST", headers: { Authorization: this.authHeader() } },
    );
    if (!snoopRes.ok) {
      throw new Error(`Snoop failed: ${await snoopRes.text()}`);
    }
    const snoop = (await snoopRes.json()) as { id: string };

    let bridgeId: string | undefined;
    try {
      const bridgeRes = await fetch(`${this.baseUrl()}/ari/bridges?type=mixing`, {
        method: "POST",
        headers: { Authorization: this.authHeader() },
      });
      if (!bridgeRes.ok) throw new Error(`Bridge create failed: ${await bridgeRes.text()}`);
      const bridge = (await bridgeRes.json()) as { id: string };
      bridgeId = bridge.id;
      await this.addToBridge(bridge.id, snoop.id);

      const origParams = new URLSearchParams({
        endpoint: opts.listenerEndpoint,
        app: "dsip-flow",
        appArgs: `bridge,${bridge.id}`,
        timeout: "30",
        callerId: `"DSip Spy" <${ext}>`,
      });
      const orig = await fetch(`${this.baseUrl()}/ari/channels?${origParams}`, {
        method: "POST",
        headers: { Authorization: this.authHeader() },
      });
      if (!orig.ok) {
        const errText = await orig.text();
        throw new Error(
          /Allocation failed/i.test(errText)
            ? `Spy listener ${ext} could not be called (offline or busy). Register softphone as ${ext}.`
            : `Spy originate failed: ${errText}`,
        );
      }
      return { snoopId: snoop.id, bridgeId: bridge.id, listener: await orig.json() };
    } catch (e) {
      // Always clean up snoop/bridge so live-calls list does not fill with orphans
      void this.hangup(snoop.id);
      if (bridgeId) {
        void fetch(`${this.baseUrl()}/ari/bridges/${bridgeId}`, {
          method: "DELETE",
          headers: { Authorization: this.authHeader() },
        }).catch(() => undefined);
      }
      throw e;
    }
  }

  async play(channelId: string, media: string): Promise<string | null> {
    const params = new URLSearchParams({ media, lang: "en" });
    const res = await fetch(
      `${this.baseUrl()}/ari/channels/${channelId}/play?${params}`,
      {
        method: "POST",
        headers: { Authorization: this.authHeader() },
      },
    );
    if (!res.ok) {
      console.warn(`[ari] play failed ${media} → ${res.status} ${await res.text()}`);
      return null;
    }
    const body = (await res.json()) as { id?: string };
    return body.id ?? null;
  }

  async playAndWait(
    channelId: string,
    media: string,
    timeoutMs = 30000,
    /** interruptible: a DTMF digit stops this playback (digit stays buffered). */
    opts: { interruptible?: boolean } = {},
  ): Promise<boolean> {
    let id = await this.play(channelId, media);
    if (!id) {
      // One retry after brief settle (ICE / media path)
      await new Promise((r) => setTimeout(r, 400));
      id = await this.play(channelId, media);
    }
    if (!id) return false;
    if (opts.interruptible) this.activePlaybackByChannel.set(channelId, id);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.playbackWaiters.delete(id!);
        resolve();
      }, timeoutMs);
      this.playbackWaiters.set(id, {
        channelId,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
    if (opts.interruptible && this.activePlaybackByChannel.get(channelId) === id) {
      this.activePlaybackByChannel.delete(channelId);
    }
    return true;
  }

  clearDtmfBuffer(channelId: string) {
    this.dtmfBuffers.delete(channelId);
  }

  async stopPlayback(playbackId: string) {
    try {
      await fetch(`${this.baseUrl()}/ari/playbacks/${playbackId}`, {
        method: "DELETE",
        headers: { Authorization: this.authHeader() },
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      /* ignore */
    }
  }

  /** A digit arrived that nobody has read yet (type-ahead / barge-in). */
  hasBufferedDtmf(channelId: string): boolean {
    return (this.dtmfBuffers.get(channelId)?.length ?? 0) > 0;
  }

  waitDtmf(channelId: string, timeoutMs = 5000): Promise<string | null> {
    const buffered = this.dtmfBuffers.get(channelId);
    if (buffered && buffered.length > 0) {
      const d = buffered.shift()!;
      if (buffered.length === 0) this.dtmfBuffers.delete(channelId);
      else this.dtmfBuffers.set(channelId, buffered);
      return Promise.resolve(d);
    }
    return new Promise((resolve) => {
      const prev = this.dtmfWaiters.get(channelId);
      if (prev) {
        clearTimeout(prev.timer);
        prev.resolve(null);
      }
      const timer = setTimeout(() => {
        this.dtmfWaiters.delete(channelId);
        resolve(null);
      }, timeoutMs);
      this.dtmfWaiters.set(channelId, { resolve, timer });
    });
  }

  /**
   * Collect multiple DTMF digits (directory / multi-digit entry).
   * Stops on maxDigits, `#`, or inter-digit silence after the first digit.
   */
  async waitDtmfDigits(
    channelId: string,
    opts: { maxDigits?: number; firstTimeoutMs?: number; interDigitMs?: number } = {},
  ): Promise<string> {
    const maxDigits = opts.maxDigits ?? 6;
    const firstTimeoutMs = opts.firstTimeoutMs ?? 8000;
    const interDigitMs = opts.interDigitMs ?? 2500;
    let out = "";
    for (let i = 0; i < maxDigits; i++) {
      const d = await this.waitDtmf(channelId, i === 0 ? firstTimeoutMs : interDigitMs);
      if (!d) break;
      if (d === "#") break;
      if (d === "*") {
        out = "";
        continue;
      }
      out += d;
    }
    return out;
  }

  async setChannelVar(channelId: string, variable: string, value: string): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.baseUrl()}/ari/channels/${channelId}/variable?variable=${encodeURIComponent(variable)}&value=${encodeURIComponent(value)}`,
        {
          method: "POST",
          headers: { Authorization: this.authHeader() },
          signal: AbortSignal.timeout(3000),
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Play a prompt and collect the first DTMF (including digits pressed during playback).
   */
  async playCollectDtmf(
    channelId: string,
    media: string,
    timeoutAfterMs = 12000,
    /** false keeps digits typed before the prompt started (type-ahead). */
    opts: { clear?: boolean } = {},
  ): Promise<string | null> {
    if (opts.clear !== false) this.clearDtmfBuffer(channelId);
    let id = await this.play(channelId, media);
    if (!id) {
      await new Promise((r) => setTimeout(r, 300));
      id = await this.play(channelId, media);
    }
    if (id) {
      this.activePlaybackByChannel.set(channelId, id);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.playbackWaiters.delete(id!);
          resolve();
        }, 60_000);
        this.playbackWaiters.set(id, {
          channelId,
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
        });
      });
      this.activePlaybackByChannel.delete(channelId);
    }
    // Digit may have arrived during play (buffered) or arrive after
    return this.waitDtmf(channelId, timeoutAfterMs);
  }

  async addToBridge(bridgeId: string, channelId: string) {
    const res = await fetch(
      `${this.baseUrl()}/ari/bridges/${bridgeId}/addChannel?channel=${channelId}`,
      {
        method: "POST",
        headers: { Authorization: this.authHeader() },
      },
    );
    return res.ok;
  }

  /**
   * Keep receiving a channel's events after it leaves Stasis (continue/redirect or
   * hangup). Without this ChannelDestroyed never reaches the app, so IVR/inbound
   * CDRs (closed on ChannelDestroyed) stayed open with no end time.
   */
  async subscribeChannel(app: string, channelId: string): Promise<void> {
    try {
      const params = new URLSearchParams({ eventSource: `channel:${channelId}` });
      await fetch(`${this.baseUrl()}/ari/applications/${encodeURIComponent(app)}/subscription?${params}`, {
        method: "POST",
        headers: { Authorization: this.authHeader() },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      /* best effort — CDR falls back to the dialplan hook where one exists */
    }
  }

  async isEndpointOnline(extension: string): Promise<boolean> {
    return (await this.endpointState(extension)).online;
  }

  /** Registration plus in-call state: `busy` = the endpoint already has a live channel. */
  async endpointState(extension: string): Promise<{ online: boolean; busy: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl()}/ari/endpoints/PJSIP/${extension}`, {
        headers: { Authorization: this.authHeader() },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return { online: false, busy: false };
      const body = (await res.json()) as { state?: string; channel_ids?: string[] };
      // online | offline | unknown
      return { online: body.state === "online", busy: (body.channel_ids ?? []).length > 0 };
    } catch {
      return { online: false, busy: false };
    }
  }

  async redirect(channelId: string, extension: string, context = "from-internal") {
    try {
      // Prefer dialplan continue (Dial(PJSIP/n)) — avoid ARI bridge deadlock with active Stasis
      console.log(`[ari] redirect start ${channelId} → ${extension}@${context}`);
      await sleep(100);
      // Asterisk ARI query param is "extension" (see channels.json api-docs)
      const cont = new URLSearchParams({
        context,
        extension,
        priority: "1",
      });
      const res = await fetch(
        `${this.baseUrl()}/ari/channels/${channelId}/continue?${cont}`,
        {
          method: "POST",
          headers: { Authorization: this.authHeader() },
          signal: AbortSignal.timeout(5000),
        },
      );
      const body = await res.text();
      console.log(`[ari] continue status=${res.status} ${body}`);
      if (!res.ok) await this.hangup(channelId);
    } catch (e) {
      console.error("[ari] redirect error", e);
      await this.hangup(channelId);
    }
  }

  async originate(opts: {
    endpoint: string;
    extension: string;
    context?: string;
    callerId?: string;
  }) {
    const params = new URLSearchParams({
      endpoint: opts.endpoint,
      extension: opts.extension,
      context: opts.context ?? "from-internal",
      callerId: opts.callerId ?? "DSip",
      timeout: "30",
    });
    const res = await fetch(`${this.baseUrl()}/ari/channels?${params}`, {
      method: "POST",
      headers: { Authorization: this.authHeader() },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Originate failed: ${text}`);
    }
    return res.json();
  }

  setExtensionState(number: string, state: ExtensionState["state"]) {
    this.extensionStates.set(number, { number, state });
    this.emit("extension.state", { number, state });
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const ari = new AriClient();
