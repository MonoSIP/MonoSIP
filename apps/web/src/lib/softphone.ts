import {
  UserAgent,
  Registerer,
  RegistererState,
  Invitation,
  Inviter,
  SessionState,
  TransportState,
  type Session,
} from "sip.js";
import i18n from "i18next";

export type SoftphoneStatus = "idle" | "connecting" | "registered" | "error";

/** High-level call UI state for the dial pad. */
export type CallPhase = "idle" | "dialing" | "ringing" | "active" | "ended";

export type CallPhaseInfo = {
  seconds: number;
  peer?: string;
  reason?: "local" | "remote" | "failed";
};

const DTMF_FREQ: Record<string, [number, number]> = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
};

function sipWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/asterisk-ws`;
}

const AUDIO_DEVICES_KEY = "dsip.audioDevices";

export class Softphone {
  status: SoftphoneStatus = "idle";
  session: Session | null = null;
  callPhase: CallPhase = "idle";
  private ua: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private intentionalStop = false;
  private callStartedAt: number | null = null;
  private callPeer = "";
  private mediaWatchTimer: ReturnType<typeof setTimeout> | null = null;
  private rtpWarned = false;
  onStatus?: (s: SoftphoneStatus, detail?: string) => void;
  onSession?: (s: Session | null) => void;
  onCallPhase?: (phase: CallPhase, info?: CallPhaseInfo) => void;
  /** Fired when remote RTP never arrives (typical missing host UDP 10000–10100). */
  onMediaWarning?: (code: "no_rtp") => void;
  private remoteAudio = document.createElement("audio");
  private audioCtx: AudioContext | null = null;
  private trackHandler: ((ev: RTCTrackEvent) => void) | null = null;
  private boundPc: RTCPeerConnection | null = null;
  private ringOsc: { stop: () => void } | null = null;
  private preferredMicId = "";
  private preferredSpeakerId = "";
  private preferredRingId = "";
  private ringAudio = document.createElement("audio");

  constructor() {
    this.remoteAudio.autoplay = true;
    this.remoteAudio.setAttribute("playsinline", "true");
    this.remoteAudio.style.display = "none";
    document.body.appendChild(this.remoteAudio);
    this.ringAudio.autoplay = false;
    this.ringAudio.setAttribute("playsinline", "true");
    this.ringAudio.style.display = "none";
    document.body.appendChild(this.ringAudio);
  }

  /** Load saved devices; drop stale IDs that Chrome no longer lists. */
  async loadPreferredDevices(): Promise<void> {
    let mic = "";
    let speaker = "";
    let ring = "";
    try {
      const saved = JSON.parse(localStorage.getItem(AUDIO_DEVICES_KEY) ?? "{}") as {
        mic?: string;
        speaker?: string;
        ring?: string;
      };
      mic = saved.mic ?? "";
      speaker = saved.speaker ?? "";
      ring = saved.ring ?? "";
    } catch {
      /* ignore */
    }
    try {
      // Permission unlocks device labels / stable enumeration
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = new Set(all.filter((d) => d.kind === "audioinput").map((d) => d.deviceId));
      const outputs = new Set(all.filter((d) => d.kind === "audiooutput").map((d) => d.deviceId));
      if (mic && !inputs.has(mic)) mic = "";
      if (speaker && !outputs.has(speaker)) speaker = "";
      if (ring && !outputs.has(ring)) ring = "";
      localStorage.setItem(AUDIO_DEVICES_KEY, JSON.stringify({ mic, speaker, ring }));
    } catch {
      // No mic / permission denied — clear preferences so dial uses defaults
      mic = "";
      speaker = "";
      ring = "";
    }
    this.preferredMicId = mic;
    this.preferredSpeakerId = speaker;
    this.preferredRingId = ring;
    if (speaker) {
      await this.setOutputDevice(speaker).catch(() => undefined);
    }
    await this.applyRingSink().catch(() => undefined);
  }

  private async applyRingSink() {
    const id = this.preferredRingId || this.preferredSpeakerId;
    if (!id) return;
    const el = this.ringAudio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (typeof el.setSinkId !== "function") return;
    try {
      await el.setSinkId(id);
    } catch {
      /* ignore */
    }
  }

  private audioConstraints(): MediaTrackConstraints | boolean {
    // Prefer plain deviceId string — `{ ideal: … }` throws OverconstrainedError
    // ("Invalid constraint") on Safari and some Chromium embeds.
    if (this.preferredMicId) {
      return { deviceId: this.preferredMicId };
    }
    return true;
  }

  /** SIP.js getUserMedia constraints — always permissive; mic preference applied via replaceTrack. */
  private sipMediaConstraints(): MediaStreamConstraints {
    return { audio: true, video: false };
  }

  private clearPreferredMic() {
    this.preferredMicId = "";
    try {
      const saved = JSON.parse(localStorage.getItem(AUDIO_DEVICES_KEY) ?? "{}") as Record<
        string,
        string
      >;
      saved.mic = "";
      localStorage.setItem(AUDIO_DEVICES_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }

  private ensureAudioCtx(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /** Local DTMF keypad beep (not in-band SIP DTMF). */
  playDtmfTone(digit: string, durationMs = 160) {
    const freqs = DTMF_FREQ[digit];
    if (!freqs) return;
    try {
      const ctx = this.ensureAudioCtx();
      const t0 = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
      gain.connect(ctx.destination);
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        osc.connect(gain);
        osc.start(t0);
        osc.stop(t0 + durationMs / 1000 + 0.02);
      }
    } catch {
      /* ignore autoplay / AudioContext errors */
    }
  }

  private startLocalRingback() {
    this.stopLocalRingback();
    try {
      const ctx = this.ensureAudioCtx();
      void this.applyRingSink();
      // Route ring tones through ringAudio sink when setSinkId is available
      let dest: AudioNode = ctx.destination;
      try {
        const ringDest = (ctx as AudioContext & { createMediaStreamDestination?: () => MediaStreamAudioDestinationNode })
          .createMediaStreamDestination?.();
        if (ringDest && (this.preferredRingId || this.preferredSpeakerId)) {
          this.ringAudio.srcObject = ringDest.stream;
          void this.ringAudio.play().catch(() => undefined);
          dest = ringDest;
        }
      } catch {
        dest = ctx.destination;
      }
      let stopped = false;
      const tick = () => {
        if (stopped) return;
        const t0 = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.value = 0.06;
        gain.connect(dest);
        for (const f of [440, 480]) {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = f;
          osc.connect(gain);
          osc.start(t0);
          osc.stop(t0 + 1.0);
        }
      };
      tick();
      const id = window.setInterval(tick, 4000);
      this.ringOsc = {
        stop: () => {
          stopped = true;
          this.ringAudio.pause();
          this.ringAudio.srcObject = null;
          clearInterval(id);
        },
      };
    } catch {
      /* ignore */
    }
  }

  private stopLocalRingback() {
    this.ringOsc?.stop();
    this.ringOsc = null;
  }

  /** Prefer PCMU/PCMA so Asterisk can play WAV prompts (no Opus transcoder in image). */
  private preferPcmuCodecs(pc: RTCPeerConnection) {
    try {
      const caps = RTCRtpSender.getCapabilities?.("audio");
      if (!caps?.codecs?.length) return;
      const prefer = ["audio/PCMU", "audio/PCMA", "audio/G722"];
      const ranked = [
        ...prefer.flatMap((mime) =>
          caps.codecs.filter((c) => c.mimeType.toLowerCase() === mime.toLowerCase()),
        ),
        ...caps.codecs.filter(
          (c) => !prefer.some((mime) => c.mimeType.toLowerCase() === mime.toLowerCase()),
        ),
      ];
      for (const tx of pc.getTransceivers()) {
        if (tx.sender.track?.kind === "audio" || tx.receiver.track?.kind === "audio") {
          tx.setCodecPreferences?.(ranked);
        }
      }
    } catch {
      /* older browsers */
    }
  }

  /** Reorder m=audio payload types so PCMU/PCMA come first in SDP. */
  private preferPcmuSdpModifier = async (
    description: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> => {
    if (!description.sdp) return description;
    const lines = description.sdp.split(/\r?\n/);
    const mIdx = lines.findIndex((l) => l.startsWith("m=audio "));
    if (mIdx < 0) return description;
    const ptToName = new Map<string, string>();
    for (const l of lines) {
      const m = l.match(/^a=rtpmap:(\d+)\s+([^\s/]+)/i);
      if (m) ptToName.set(m[1]!, m[2]!.toUpperCase());
    }
    const parts = lines[mIdx]!.split(" ");
    const header = parts.slice(0, 3);
    const pts = parts.slice(3);
    const rank = (pt: string) => {
      const n = ptToName.get(pt) ?? "";
      if (n === "PCMU") return 0;
      if (n === "PCMA") return 1;
      if (n === "G722") return 2;
      if (n === "OPUS") return 9;
      return 5;
    };
    pts.sort((a, b) => rank(a) - rank(b));
    lines[mIdx] = [...header, ...pts].join(" ");
    return { ...description, sdp: lines.join("\r\n") };
  };

  private attachRemoteMedia(session: Session) {
    const sdh = session.sessionDescriptionHandler as
      | { peerConnection?: RTCPeerConnection }
      | undefined;
    const pc = sdh?.peerConnection;
    if (!pc) return;

    if (this.boundPc && this.trackHandler) {
      this.boundPc.removeEventListener("track", this.trackHandler);
    }

    this.preferPcmuCodecs(pc);

    const applyStream = () => {
      const remote = new MediaStream();
      pc.getReceivers().forEach((r) => {
        if (r.track && r.track.kind === "audio") remote.addTrack(r.track);
      });
      this.remoteAudio.srcObject = remote;
      void this.remoteAudio.play().catch(() => undefined);
    };

    this.trackHandler = (ev: RTCTrackEvent) => {
      if (ev.track.kind !== "audio") return;
      this.stopLocalRingback();
      const stream = (this.remoteAudio.srcObject as MediaStream | null) ?? new MediaStream();
      if (!stream.getTracks().includes(ev.track)) stream.addTrack(ev.track);
      this.remoteAudio.srcObject = stream;
      void this.remoteAudio.play().catch(() => undefined);
    };
    pc.addEventListener("track", this.trackHandler);
    this.boundPc = pc;
    applyStream();
  }

  async connect(opts: {
    extension: string;
    password: string;
    domain: string;
    websocketUrl?: string;
    displayName: string;
  }) {
    this.intentionalStop = false;
    await this.disconnect(true);
    this.setStatus("connecting");

    // Vault/NineDeploy often leaves SIP domain as localhost — use the page host.
    const domain =
      !opts.domain ||
      opts.domain === "localhost" ||
      opts.domain === "127.0.0.1"
        ? window.location.hostname
        : opts.domain;

    const uri = UserAgent.makeURI(`sip:${opts.extension}@${domain}`);
    if (!uri) throw new Error("Invalid SIP URI");

    const wsServer =
      opts.websocketUrl &&
      !opts.websocketUrl.includes("localhost") &&
      !opts.websocketUrl.includes("127.0.0.1")
        ? opts.websocketUrl
        : sipWsUrl();

    // Prefer API ICE (TURNS@443 + time-limited creds). Fall back to STUN / VITE_TURN_*.
    let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    try {
      const iceRes = await fetch("/api/v1/ice-servers", { credentials: "include" });
      if (iceRes.ok) {
        const body = (await iceRes.json()) as { iceServers?: RTCIceServer[] };
        if (body.iceServers?.length) iceServers = body.iceServers;
      }
    } catch {
      /* keep STUN */
    }
    const turnUrl = (import.meta.env.VITE_TURN_URL as string | undefined)?.trim();
    if (turnUrl && !iceServers.some((s) => String(s.urls).includes("turn"))) {
      iceServers.push({
        urls: turnUrl,
        username: (import.meta.env.VITE_TURN_USERNAME as string | undefined) || "dsip",
        credential: (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined) || "turnpass",
      });
    }

    this.ua = new UserAgent({
      uri,
      authorizationUsername: opts.extension,
      authorizationPassword: opts.password,
      displayName: opts.displayName,
      transportOptions: {
        server: wsServer,
        connectionTimeout: 15,
        keepAliveInterval: 30,
        keepAliveDebounce: 10,
      },
      sessionDescriptionHandlerFactoryOptions: {
        // Keep getUserMedia constraints minimal — device picks happen in setInputDevice.
        constraints: this.sipMediaConstraints(),
        peerConnectionConfiguration: {
          iceServers,
        },
      },
      logLevel: "warn",
    });

    this.ua.delegate = {
      onInvite: (invitation) => {
        // Already on a call: answer 486 so the caller's Dial sees BUSY (IVR busy
        // exit) instead of the new call replacing the live session.
        if (this.session && this.session.state !== SessionState.Terminated) {
          void invitation.reject({ statusCode: 486, reasonPhrase: "Busy Here" }).catch(() => undefined);
          return;
        }
        // Incoming call (e.g. queue member ring)
        this.session = invitation;
        const from =
          invitation.remoteIdentity?.uri?.user ||
          invitation.remoteIdentity?.displayName ||
          "";
        this.callPeer = String(from);
        this.callStartedAt = null;
        this.setCallPhase("ringing", { seconds: 0, peer: this.callPeer });
        this.onSession?.(invitation);
        invitation.stateChange.addListener((state) => this.handleState(state));
        this.startLocalRingback();
        void this.remoteAudio.play().catch(() => undefined);
        this.notifyIncoming(invitation);
      },
    };

    this.ua.transport.stateChange.addListener((state) => {
      if (state === TransportState.Disconnected && !this.intentionalStop) {
        this.setStatus("error", "Transport disconnected");
      }
    });

    try {
      await this.ua.start();
      this.registerer = new Registerer(this.ua, { expires: 300 });
      this.registerer.stateChange.addListener((state) => {
        if (state === RegistererState.Registered) this.setStatus("registered");
        if (state === RegistererState.Unregistered && !this.intentionalStop) {
          this.setStatus("idle");
        }
      });
      await this.registerer.register();
      if (this.registerer.state === RegistererState.Registered) {
        this.setStatus("registered");
      }
    } catch (e) {
      if (this.intentionalStop) return;
      this.setStatus("error");
      const msg = (e as Error).message || String(e);
      if (msg.includes("1006") || msg.includes("WebSocket closed")) {
        throw new Error(
          `SIP WebSocket failed (${wsServer}). Accept the HTTPS certificate for this site, then refresh. Details: ${msg}`,
        );
      }
      throw e;
    }
  }

  async dial(target: string, domain: string) {
    if (!this.ua) throw new Error("Not connected");
    const cleaned = target.replace(/[^\d*#]/g, "");
    if (!cleaned) throw new Error("Enter a number");
    this.ensureAudioCtx();
    await this.ensureMicAccess();
    const targetUri = UserAgent.makeURI(`sip:${cleaned}@${domain}`);
    if (!targetUri) throw new Error("Invalid target");
    const sdhOpts = (this.ua as unknown as {
      options?: { sessionDescriptionHandlerFactoryOptions?: { constraints?: unknown } };
    }).options?.sessionDescriptionHandlerFactoryOptions;
    if (sdhOpts) {
      sdhOpts.constraints = this.sipMediaConstraints();
    }
    const inviter = new Inviter(this.ua, targetUri);
    this.session = inviter;
    this.callPeer = cleaned;
    this.callStartedAt = Date.now();
    this.rtpWarned = false;
    this.setCallPhase("dialing", { seconds: 0, peer: cleaned });
    this.onSession?.(inviter);
    inviter.stateChange.addListener((state) => this.handleState(state));
    this.startLocalRingback();
    try {
      await inviter.invite({
        sessionDescriptionHandlerModifiers: [this.preferPcmuSdpModifier],
      });
    } catch (e) {
      this.stopLocalRingback();
      this.session = null;
      this.onSession?.(null);
      throw this.friendlyMediaError(e);
    }
    if (this.preferredMicId) {
      await this.setInputDevice(this.preferredMicId).catch(() => undefined);
    }
    // Unlock autoplay after user gesture
    void this.remoteAudio.play().catch(() => undefined);
    if (this.preferredSpeakerId) {
      await this.setOutputDevice(this.preferredSpeakerId).catch(() => undefined);
    }
  }

  async answer() {
    this.ensureAudioCtx();
    await this.ensureMicAccess();
    if (this.ua) {
      const sdhOpts = (this.ua as unknown as {
        options?: { sessionDescriptionHandlerFactoryOptions?: { constraints?: unknown } };
      }).options?.sessionDescriptionHandlerFactoryOptions;
      if (sdhOpts) sdhOpts.constraints = this.sipMediaConstraints();
    }
    if (this.session && "accept" in this.session) {
      try {
        await (
          this.session as {
            accept: (opts?: {
              sessionDescriptionHandlerModifiers?: Array<
                (d: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>
              >;
            }) => Promise<void>;
          }
        ).accept({
          sessionDescriptionHandlerModifiers: [this.preferPcmuSdpModifier],
        });
        if (this.preferredMicId) {
          await this.setInputDevice(this.preferredMicId).catch(() => undefined);
        }
      } catch (e) {
        throw this.friendlyMediaError(e);
      }
    }
  }

  /** Probe mic; fall back to system default on stale/invalid device constraints. */
  private async ensureMicAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: this.audioConstraints(),
      });
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      if (this.preferredMicId) this.clearPreferredMic();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      throw this.friendlyMediaError(e);
    }
  }

  private friendlyMediaError(e: unknown): Error {
    const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : "";
    const msg = e instanceof Error ? e.message : String(e);
    if (name === "NotFoundError" || /requested device not found/i.test(msg)) {
      return new Error(
        i18n.t("softphone.micNotFound", {
          defaultValue:
            "No microphone found. Enable a microphone in your system settings, or pick a default under Settings → Audio devices and save.",
        }),
      );
    }
    if (name === "NotAllowedError" || /permission|denied/i.test(msg)) {
      return new Error(
        i18n.t("softphone.micDenied", {
          defaultValue: "Microphone permission is required. Allow microphone access from the browser address bar.",
        }),
      );
    }
    if (
      name === "OverconstrainedError" ||
      /overconstrained|invalid constraint/i.test(msg)
    ) {
      this.clearPreferredMic();
      return new Error(
        i18n.t("softphone.micInvalid", {
          defaultValue:
            "The saved microphone setting is not valid in this browser. Choose “System default” under Settings → Audio devices, save, then try again.",
        }),
      );
    }
    return e instanceof Error ? e : new Error(msg);
  }

  async hangup() {
    this.stopLocalRingback();
    this.clearMediaWatch();
    if (!this.session) {
      this.setCallPhase("idle");
      return;
    }
    const seconds = this.callStartedAt
      ? Math.max(0, Math.floor((Date.now() - this.callStartedAt) / 1000))
      : 0;
    const peer = this.callPeer;
    switch (this.session.state) {
      case SessionState.Initial:
      case SessionState.Establishing:
        if (this.session instanceof Invitation) {
          // Declining a ringing incoming call → 486 Busy Here (DIALSTATUS=BUSY).
          await this.session.reject({ statusCode: 486, reasonPhrase: "Busy Here" }).catch(() => undefined);
        } else if ("cancel" in this.session) {
          await (this.session as { cancel: () => Promise<void> }).cancel();
        }
        break;
      case SessionState.Established:
        await this.session.bye();
        break;
      default:
        break;
    }
    this.session = null;
    this.callStartedAt = null;
    this.callPeer = "";
    this.rtpWarned = false;
    this.setCallPhase("ended", { seconds, peer, reason: "local" });
    this.onSession?.(null);
    setTimeout(() => {
      if (this.callPhase === "ended") this.setCallPhase("idle");
    }, 2500);
  }

  private localMuted = false;
  private held = false;

  setMute(mute: boolean) {
    this.localMuted = mute;
    const sdh = this.session?.sessionDescriptionHandler as
      | { peerConnection?: RTCPeerConnection }
      | undefined;
    sdh?.peerConnection?.getSenders().forEach((s) => {
      if (s.track?.kind === "audio") s.track.enabled = !mute;
    });
  }

  get muted() {
    return this.localMuted;
  }

  async setHold(hold: boolean) {
    if (!this.session || this.session.state !== SessionState.Established) return;
    this.held = hold;
    const sdh = this.session.sessionDescriptionHandler as
      | { hold?: (h: boolean) => Promise<void>; peerConnection?: RTCPeerConnection }
      | undefined;
    if (sdh && typeof sdh.hold === "function") {
      await sdh.hold(hold);
    } else {
      sdh?.peerConnection?.getSenders().forEach((s) => {
        if (s.track) s.track.enabled = !hold && !this.localMuted;
      });
    }
  }

  get onHold() {
    return this.held;
  }

  private consultSession: Session | null = null;

  /** Blind transfer (SIP REFER) to another extension/number. */
  async transfer(target: string, domain: string) {
    if (!this.session || this.session.state !== SessionState.Established) {
      throw new Error("No active established call to transfer");
    }
    const cleaned = target.replace(/[^\d*#]/g, "");
    if (!cleaned) throw new Error("Enter transfer destination");
    const targetUri = UserAgent.makeURI(`sip:${cleaned}@${domain}`);
    if (!targetUri) throw new Error("Invalid transfer target");
    const sess = this.session as Session & {
      refer?: (uri: ReturnType<typeof UserAgent.makeURI>) => Promise<void>;
    };
    if (typeof sess.refer !== "function") {
      throw new Error("Transfer not supported by this session");
    }
    await sess.refer(targetUri);
    const seconds = this.callStartedAt
      ? Math.max(0, Math.floor((Date.now() - this.callStartedAt) / 1000))
      : 0;
    const peer = this.callPeer;
    this.session = null;
    this.callStartedAt = null;
    this.callPeer = "";
    this.clearMediaWatch();
    this.setCallPhase("ended", { seconds, peer, reason: "local" });
    this.onSession?.(null);
    setTimeout(() => {
      if (this.callPhase === "ended") this.setCallPhase("idle");
    }, 2500);
  }

  /** Hold original call and dial consult target (attended transfer step 1). */
  async startConsult(target: string, domain: string) {
    if (!this.ua || !this.session || this.session.state !== SessionState.Established) {
      throw new Error("No active established call");
    }
    if (this.consultSession) throw new Error("Consult already in progress");
    const cleaned = target.replace(/[^\d*#]/g, "");
    if (!cleaned) throw new Error("Enter consult number");
    await this.setHold(true);
    this.held = true;
    const targetUri = UserAgent.makeURI(`sip:${cleaned}@${domain}`);
    if (!targetUri) throw new Error("Invalid target");
    const inviter = new Inviter(this.ua, targetUri);
    this.consultSession = inviter;
    inviter.stateChange.addListener((state) => {
      if (state === SessionState.Terminated) this.consultSession = null;
      if (state === SessionState.Established) this.attachRemoteMedia(inviter);
    });
    await inviter.invite({
      sessionDescriptionHandlerModifiers: [this.preferPcmuSdpModifier],
    });
  }

  /** Complete attended transfer (REFER with Replaces). */
  async completeConsultTransfer() {
    if (!this.session || !this.consultSession) {
      throw new Error("No consult call to complete");
    }
    if (this.consultSession.state !== SessionState.Established) {
      throw new Error("Consult call not answered yet");
    }
    const original = this.session as Session & {
      refer?: (
        uri: ReturnType<typeof UserAgent.makeURI>,
        options?: { requestOptions?: { extraHeaders?: string[] } },
      ) => Promise<void>;
    };
    const consult = this.consultSession as Session & {
      dialog?: { id?: { callId?: string; localTag?: string; remoteTag?: string } };
    };
    const dialog = consult.dialog;
    const id = dialog?.id;
    const remoteUri = (this.consultSession as Session & {
      remoteIdentity?: { uri?: ReturnType<typeof UserAgent.makeURI> };
    }).remoteIdentity?.uri;
    if (!remoteUri || typeof original.refer !== "function") {
      throw new Error("Attended REFER not supported");
    }
    if (id?.callId && id.localTag && id.remoteTag) {
      const replaces = `${id.callId};to-tag=${id.remoteTag};from-tag=${id.localTag}`;
      await original.refer(remoteUri, {
        requestOptions: { extraHeaders: [`Replaces: ${replaces}`] },
      });
    } else {
      await original.refer(remoteUri);
    }
    try {
      await this.consultSession.bye();
    } catch {
      /* ignore */
    }
    const seconds = this.callStartedAt
      ? Math.max(0, Math.floor((Date.now() - this.callStartedAt) / 1000))
      : 0;
    const peer = this.callPeer;
    this.consultSession = null;
    this.session = null;
    this.callStartedAt = null;
    this.callPeer = "";
    this.clearMediaWatch();
    this.setCallPhase("ended", { seconds, peer, reason: "local" });
    this.onSession?.(null);
    setTimeout(() => {
      if (this.callPhase === "ended") this.setCallPhase("idle");
    }, 2500);
  }

  async cancelConsult() {
    if (!this.consultSession) return;
    try {
      if (
        this.consultSession.state === SessionState.Establishing ||
        this.consultSession.state === SessionState.Initial
      ) {
        if ("cancel" in this.consultSession) {
          await (this.consultSession as { cancel: () => Promise<void> }).cancel();
        }
      } else {
        await this.consultSession.bye();
      }
    } catch {
      /* ignore */
    }
    this.consultSession = null;
    await this.setHold(false);
    this.held = false;
    if (this.session) this.attachRemoteMedia(this.session);
  }

  private notifyIncoming(invitation: Session) {
    try {
      if (typeof Notification === "undefined") return;
      const remote = (invitation as Session & {
        remoteIdentity?: { uri?: { user?: string }; displayName?: string };
      }).remoteIdentity;
      const from = remote?.uri?.user || remote?.displayName || "Unknown";
      const show = () => {
        if (document.visibilityState === "visible") return;
        const n = new Notification("DSip — Incoming call", {
          body: `From ${from}`,
          tag: "dsip-incoming",
          requireInteraction: true,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      };
      if (Notification.permission === "granted") show();
      else if (Notification.permission !== "denied") {
        void Notification.requestPermission().then((p) => {
          if (p === "granted") show();
        });
      }
    } catch {
      /* ignore */
    }
  }

  /** Request desktop notification permission (call after user gesture). */
  static async requestNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
    if (typeof Notification === "undefined") return "unsupported";
    if (Notification.permission === "granted" || Notification.permission === "denied") {
      return Notification.permission;
    }
    return Notification.requestPermission();
  }

  async setOutputDevice(deviceId: string) {
    if (!deviceId) return;
    this.preferredSpeakerId = deviceId;
    const el = this.remoteAudio as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (typeof el.setSinkId !== "function") return;
    try {
      await el.setSinkId(deviceId);
    } catch {
      // Stale sink id — fall back to default output
      this.preferredSpeakerId = "";
      try {
        await el.setSinkId("");
      } catch {
        /* ignore */
      }
    }
  }

  async setInputDevice(deviceId: string) {
    this.preferredMicId = deviceId;
    const sdh = this.session?.sessionDescriptionHandler as
      | { peerConnection?: RTCPeerConnection }
      | undefined;
    const pc = sdh?.peerConnection;
    if (!pc) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId } : true,
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.clearPreferredMic();
    }
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
    if (sender) await sender.replaceTrack(track);
  }

  async sendDtmf(digit: string) {
    if (!this.session || this.session.state !== SessionState.Established) return;
    const session = this.session as unknown as {
      sessionDescriptionHandler?: { sendDtmf?: (d: string) => boolean };
      info?: (opts: {
        requestOptions: {
          body: {
            contentType: string;
            content: string;
            contentDisposition?: string;
          };
        };
      }) => Promise<unknown>;
    };
    // Append to the RTCDTMFSender tone buffer: insertDTMF() *replaces* the queued
    // tones, so quick presses ("0","6" for a plate code) dropped a digit — and the
    // SIP INFO fallback is ignored by Asterisk's RFC 4733 mode.
    const pc = (session.sessionDescriptionHandler as { peerConnection?: RTCPeerConnection } | undefined)
      ?.peerConnection;
    const dtmf = pc?.getSenders().find((s) => s.track?.kind === "audio")?.dtmf;
    if (dtmf?.canInsertDTMF) {
      dtmf.insertDTMF(dtmf.toneBuffer + digit, 120, 70);
      return;
    }
    if (session.sessionDescriptionHandler?.sendDtmf?.(digit)) return;
    await session.info?.({
      requestOptions: {
        body: {
          contentDisposition: "render",
          contentType: "application/dtmf-relay",
          content: `Signal=${digit}\r\nDuration=250\r\n`,
        },
      },
    });
  }

  private handleState(state: SessionState) {
    if (
      (state === SessionState.Establishing || state === SessionState.Established) &&
      this.session
    ) {
      this.attachRemoteMedia(this.session);
    }
    if (state === SessionState.Establishing) {
      if (this.callPhase === "idle" || this.callPhase === "ended") {
        this.setCallPhase("dialing");
      }
    }
    if (state === SessionState.Established) {
      this.stopLocalRingback();
      void this.remoteAudio.play().catch(() => undefined);
      if (!this.callStartedAt) this.callStartedAt = Date.now();
      this.setCallPhase("active");
      this.watchRemoteRtp();
    }
    if (state === SessionState.Terminated) {
      this.stopLocalRingback();
      this.clearMediaWatch();
      // Let the jitter buffer play out the last words (an IVR hangs up right after
      // its goodbye); a new call that took over the element in the meantime wins.
      const ending = this.remoteAudio.srcObject;
      window.setTimeout(() => {
        if (this.remoteAudio.srcObject === ending) this.remoteAudio.srcObject = null;
      }, 600);
      // hangup() already moved us to ended
      if (this.callPhase === "ended" || this.callPhase === "idle") {
        this.session = null;
        return;
      }
      const seconds = this.callStartedAt
        ? Math.max(0, Math.floor((Date.now() - this.callStartedAt) / 1000))
        : 0;
      const peer = this.callPeer;
      this.session = null;
      this.callStartedAt = null;
      this.callPeer = "";
      this.rtpWarned = false;
      this.setCallPhase("ended", { seconds, peer, reason: "remote" });
      this.onSession?.(null);
      setTimeout(() => {
        if (this.callPhase === "ended") this.setCallPhase("idle");
      }, 2500);
    }
  }

  private setCallPhase(phase: CallPhase, info?: CallPhaseInfo) {
    this.callPhase = phase;
    const seconds =
      info?.seconds ??
      (this.callStartedAt
        ? Math.max(0, Math.floor((Date.now() - this.callStartedAt) / 1000))
        : 0);
    this.onCallPhase?.(phase, {
      seconds,
      peer: info?.peer ?? (this.callPeer || undefined),
      reason: info?.reason,
    });
  }

  private clearMediaWatch() {
    if (this.mediaWatchTimer) {
      clearTimeout(this.mediaWatchTimer);
      this.mediaWatchTimer = null;
    }
  }

  /** After answer, if no RTP packets arrive, warn about host UDP RTP ports. */
  private watchRemoteRtp() {
    this.clearMediaWatch();
    this.mediaWatchTimer = setTimeout(() => {
      void this.checkRemoteRtp();
    }, 4000);
  }

  private async checkRemoteRtp() {
    if (this.rtpWarned || this.callPhase !== "active" || !this.session) return;
    const sdh = this.session.sessionDescriptionHandler as
      | { peerConnection?: RTCPeerConnection }
      | undefined;
    const pc = sdh?.peerConnection;
    if (!pc) return;
    try {
      const stats = await pc.getStats();
      let inbound = 0;
      stats.forEach((r) => {
        if (r.type === "inbound-rtp" && (r as { kind?: string }).kind === "audio") {
          inbound += Number((r as { packetsReceived?: number }).packetsReceived ?? 0);
        }
      });
      if (inbound === 0) {
        this.rtpWarned = true;
        this.onMediaWarning?.("no_rtp");
      }
    } catch {
      /* ignore */
    }
  }

  private setStatus(s: SoftphoneStatus, detail?: string) {
    this.status = s;
    this.onStatus?.(s, detail);
  }

  async disconnect(silent = false) {
    this.intentionalStop = true;
    this.stopLocalRingback();
    try {
      if (this.registerer) {
        try {
          await this.registerer.unregister();
        } catch {
          /* ignore */
        }
      }
      if (this.ua) {
        try {
          await this.ua.stop();
        } catch {
          /* ignore */
        }
      }
    } finally {
      this.registerer = null;
      this.ua = null;
      this.session = null;
      if (!silent) this.setStatus("idle");
    }
  }
}
