import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Delete,
  Grid3x3,
  History,
  Mic,
  MicOff,
  Moon,
  Pause,
  Phone as PhoneIcon,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Play,
  X,
} from "lucide-react";
import { api } from "../../lib/api";
import { callPeer } from "../../lib/call-peer";
import { formatCallTime, usePhone } from "../../lib/phone-context";
import { CallBars, CallPulse } from "../../components/motion";

const RECENTS_SEEN_KEY = "munasip.recentsSeenAt";

/** Keypad: digit + letters, as on a phone. */
const KEYS: Array<[string, string]> = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];

type HealthMedia = {
  rtpPortsPublished?: boolean;
  warnings?: Array<{ code: string; en: string; tr: string }>;
};

export function PhonePage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  // The softphone lives in the portal layout (lib/phone-context): leaving this
  // page keeps the registration and any call up.
  const { phone, status, detail, domain, inCall, callPhase, callSeconds, peer, muted, held, noRtp, setMuted, setHeld, resetCall } =
    usePhone();
  const [digits, setDigits] = useState("");
  const [dnd, setDnd] = useState(false);
  const [xferOpen, setXferOpen] = useState(false);
  const [xferTarget, setXferTarget] = useState("");
  /** What the space under the screen shows while idle: keypad or recent calls. */
  const [view, setView] = useState<"keypad" | "recents">("keypad");

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ dnd: boolean; number: string; name: string }>("/api/v1/me"),
  });
  const recent = useQuery({
    queryKey: ["my-calls"],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          caller: string | null;
          callee: string | null;
          startedAt: string;
          direction: string;
          disposition?: string | null;
        }>
      >(
        "/api/v1/me/calls",
      ),
  });
  const health = useQuery({
    queryKey: ["health-media"],
    queryFn: () =>
      api.get<{ media?: HealthMedia }>("/api/v1/health"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const mediaWarning = health.data?.media?.warnings?.[0];
  const showMediaBanner = Boolean(mediaWarning) || noRtp;

  useEffect(() => {
    if (me.data) setDnd(!!me.data.dnd);
  }, [me.data]);

  useEffect(() => {
    const dial = params.get("dial");
    if (dial) setDigits(dial);
  }, [params]);

  // The dialed number stays on the keypad after hangup unless it is cleared here.
  const prevPhase = useRef(callPhase);
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = callPhase;
    const leftCall =
      prev === "dialing" || prev === "ringing" || prev === "active" || prev === "ended";
    if (leftCall && (callPhase === "ended" || callPhase === "idle")) setDigits("");
  }, [callPhase]);

  const showCallUi =
    inCall ||
    callPhase === "dialing" ||
    callPhase === "ringing" ||
    callPhase === "active" ||
    callPhase === "ended";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setDigits("");
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") setDigits("");
        return;
      }
      if (/^[0-9*#]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setDigits((v) => v.slice(0, -1));
      } else if (e.key === "Enter" && !showCallUi && status === "registered" && digits) {
        e.preventDefault();
        void phone.dial(digits, domain).catch((err) => toast.error(String(err)));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [digits, showCallUi, status, domain, phone]);

  function press(d: string) {
    phone.playDtmfTone(d);
    if (showCallUi && callPhase !== "ended") {
      void phone.sendDtmf(d).catch(() => undefined);
    } else if (!showCallUi) {
      setDigits((v) => v + d);
    }
  }

  function clearDigits() {
    setDigits("");
  }

  const timeLabel = formatCallTime(callSeconds);
  const statusText =
    status === "registered"
      ? t("portal.registered")
      : status === "connecting"
        ? t("portal.connecting")
        : status === "error"
          ? detail || "Error"
          : t("portal.unregistered");
  const shownPeer = peer || digits;
  const avatarLabel = shownPeer ? (shownPeer.length <= 4 ? shownPeer : shownPeer.slice(-2)) : "?";

  const [dndBusy, setDndBusy] = useState(false);
  async function toggleDnd() {
    if (dndBusy) return;
    const next = !dnd;
    setDndBusy(true);
    try {
      await api.put("/api/v1/me/dnd", { dnd: next });
      setDnd(next);
      void me.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDndBusy(false);
    }
  }

  function dialNumber(n: string) {
    setDigits(n);
    setView("keypad");
    void phone.dial(n, domain).catch((e) => toast.error(String(e)));
  }

  /** Recent calls grouped by number (newest first), iPhone-style. */
  const recents = (() => {
    const byPeer = new Map<string, { peer: string; at: string; kind: "in" | "out" | "missed"; count: number }>();
    for (const c of recent.data ?? []) {
      const p = callPeer(c, me.data?.number);
      if (!p) continue;
      const outgoing = (c.caller ?? "").trim() === me.data?.number || c.direction === "outbound";
      const kind = outgoing ? "out" : c.disposition && c.disposition !== "ANSWERED" ? "missed" : "in";
      const prev = byPeer.get(p);
      if (prev) prev.count += 1;
      else byPeer.set(p, { peer: p, at: c.startedAt, kind, count: 1 });
    }
    return [...byPeer.values()].slice(0, 30);
  })();

  // Missed calls since the recents list was last opened → badge on the screen tab.
  const [recentsSeenAt, setRecentsSeenAt] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(RECENTS_SEEN_KEY) ?? 0) || 0;
    } catch {
      return 0;
    }
  });
  const missedNew = (recent.data ?? []).filter((c) => {
    const outgoing = (c.caller ?? "").trim() === me.data?.number || c.direction === "outbound";
    return !outgoing && c.disposition && c.disposition !== "ANSWERED" && Date.parse(c.startedAt) > recentsSeenAt;
  }).length;
  function toggleRecents() {
    if (view === "recents") {
      setView("keypad");
      return;
    }
    setView("recents");
    const now = Date.now();
    setRecentsSeenAt(now);
    try {
      localStorage.setItem(RECENTS_SEEN_KEY, String(now));
    } catch {
      /* private mode — badge just won't persist */
    }
  }

  function recentTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86_400_000);
    if (diff === 0) return d.toLocaleTimeString(i18n?.language ?? "en", { hour: "2-digit", minute: "2-digit" });
    if (diff === 1) return t("portal.yesterday");
    return d.toLocaleDateString(i18n?.language ?? "en", { day: "2-digit", month: "2-digit" });
  }

  /** One small round action with its caption; aria-label stays the accessible name. */
  const act = (label: string, icon: ReactNode, onClick: () => void, opts?: { on?: boolean; disabled?: boolean; danger?: boolean }) => (
    <>
      <button
        type="button"
        className={`sp-act${opts?.on ? " btn-primary" : ""}`}
        style={opts?.danger ? { background: "var(--sp-end)", color: "#fff", borderColor: "transparent" } : undefined}
        aria-label={label}
        aria-pressed={opts?.on}
        disabled={opts?.disabled}
        onClick={onClick}
      >
        {icon}
      </button>
      <span className="sp-act-label">{label}</span>
    </>
  );
  // Disabled while the change is saving, so repeated taps can't race each other.
  const dndAct = act(t("portal.dnd"), <Moon size={18} />, () => void toggleDnd(), { on: dnd, disabled: dndBusy });
  const mainCall = (
    <button
      type="button"
      className="sp-main is-call"
      aria-label={t("portal.dial")}
      disabled={status !== "registered" || !digits}
      onClick={() => void phone.dial(digits, domain).catch((e) => toast.error(String(e)))}
    >
      <PhoneIcon size={26} fill="currentColor" />
    </button>
  );
  const mainHangup = (
    <button
      type="button"
      className="sp-main is-end"
      aria-label={t("portal.hangup")}
      disabled={callPhase === "ended"}
      onClick={() => void phone.hangup()}
    >
      <PhoneIcon size={26} fill="currentColor" />
    </button>
  );
  const muteAct = act(t("portal.mute"), muted ? <MicOff size={18} /> : <Mic size={18} />, () => {
    phone.setMute(!muted);
    setMuted(!muted);
  }, { on: muted });
  const holdAct = act(t("portal.hold"), held ? <Play size={18} /> : <Pause size={18} />, () => {
    void phone.setHold(!held).then(() => setHeld(!held));
  }, { on: held });
  const xferAct = act(t("portal.transfer"), <ArrowRightLeft size={18} />, () => setXferOpen((v) => !v), { on: xferOpen });

  // Five fixed slots — the centre is always the big call / hang-up / answer button.
  const actionSlots: Array<ReactNode | null> = !showCallUi
    ? [
        dndAct,
        null,
        mainCall,
        null,
        act(t("portal.clear"), <X size={18} />, clearDigits, { disabled: !digits }),
      ]
    : callPhase === "ended"
      ? [null, null, mainHangup, null, dndAct]
      : callPhase === "ringing"
        ? [
            muteAct,
            act(t("portal.hangup"), <PhoneOff size={18} />, () => void phone.hangup(), { danger: true }),
            <button
              key="answer"
              type="button"
              className="sp-main is-call is-ringing"
              aria-label={t("portal.answer")}
              onClick={() => void phone.answer()}
            >
              <PhoneIcon size={26} fill="currentColor" />
            </button>,
            holdAct,
            xferAct,
          ]
        : [muteAct, holdAct, mainHangup, xferAct, dndAct];

  const bannerText = noRtp
    ? t("portal.noRtp")
    : mediaWarning
      ? mediaWarning.en
      : null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* The phone itself carries the identity; keep a page title for screen readers */}
      <h1 className="sr-only">{t("nav.phone")}</h1>
      {showMediaBanner && bannerText && (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          {bannerText}
        </div>
      )}
      <div className="sp-device">
        <div
          className={`sp-screen${
            callPhase === "dialing" || callPhase === "ringing" || callPhase === "active" ? " is-calling" : ""
          }${callPhase === "ended" ? " is-ended" : ""}`}
        >
          <div className="sp-statusbar">
            <span>
              <span
                className={`sp-status-dot ${
                  status === "registered" ? "is-ok" : status === "connecting" ? "is-wait" : status === "error" ? "is-err" : ""
                }`}
              />
              {statusText}
            </span>
            <span className="flex items-center gap-1.5">
              {dnd && <span className="sp-chip">DND</span>}
              {me.data?.number && (
                <span className="sp-identity">
                  {me.data.name ? `${me.data.name} · ` : ""}
                  <span className="font-mono">{me.data.number}</span>
                </span>
              )}
            </span>
          </div>
          {!showCallUi ? (
            <div className="sp-dial">
              <div className="sp-number-row">
                <span className="w-8 shrink-0" aria-hidden />
                <input
                  className={`input sp-number${digits.length > 10 ? " is-long" : ""}`}
                  value={digits}
                  inputMode="tel"
                  aria-label={t("portal.enterNumber")}
                  onChange={(e) => setDigits(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      clearDigits();
                    }
                  }}
                  placeholder={t("portal.enterNumber")}
                />
                <button
                  className="sp-backspace"
                  type="button"
                  title="Backspace"
                  aria-label="Backspace"
                  onClick={() => setDigits((v) => v.slice(0, -1))}
                  disabled={!digits}
                >
                  <Delete size={20} />
                </button>
              </div>
            </div>
          ) : null}
          {!showCallUi ? (
            <button
              type="button"
              className={`sp-screen-tab${view === "recents" ? " is-open" : ""}`}
              aria-label={view === "recents" ? t("portal.keypad") : t("portal.recents")}
              aria-pressed={view === "recents"}
              onClick={toggleRecents}
            >
              {view === "recents" ? <Grid3x3 size={14} /> : <History size={14} />}
              <span>{view === "recents" ? t("portal.keypad") : t("portal.recents")}</span>
              {view !== "recents" && missedNew > 0 && (
                <span className="sp-screen-tab-badge" aria-label={`${missedNew}`}>
                  {missedNew > 9 ? "9+" : missedNew}
                </span>
              )}
            </button>
          ) : (
            <div className="sp-call" aria-live="polite">
              <CallPulse phase={callPhase} label={avatarLabel} />
              <div className="sp-peer">{peer || digits || "—"}</div>
              <div className={`sp-callstate${callPhase === "ended" ? " is-ended" : ""}`}>
                {callPhase === "ended" ? (
                  <span>{`${t("portal.ended")} ${timeLabel}`}</span>
                ) : callPhase === "active" ? (
                  <>
                    <CallBars />
                    <span className="sp-timer">{timeLabel}</span>
                  </>
                ) : (
                  <>
                    <span>{callPhase === "ringing" ? t("portal.incoming") : `${t("portal.dialing")}…`}</span>
                    <span className="sp-timer">{timeLabel}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="sp-body">
          {view === "recents" && !showCallUi ? (
            <div className="sp-recents" role="list" aria-label={t("portal.recents")}>
              {recents.length === 0 ? (
                <div className="sp-recents-empty">{t("portal.noRecents")}</div>
              ) : (
                recents.map((r) => (
                  <button
                    key={r.peer}
                    type="button"
                    role="listitem"
                    className={`sp-recent${r.kind === "missed" ? " is-missed" : ""}`}
                    disabled={status !== "registered"}
                    onClick={() => dialNumber(r.peer)}
                  >
                    <span className="sp-recent-icon" aria-hidden>
                      {r.kind === "out" ? (
                        <PhoneOutgoing size={15} />
                      ) : r.kind === "missed" ? (
                        <PhoneMissed size={15} />
                      ) : (
                        <PhoneIncoming size={15} />
                      )}
                    </span>
                    <span className="sp-recent-peer">
                      {r.peer}
                      {r.count > 1 && <span className="sp-recent-count"> ({r.count})</span>}
                    </span>
                    <span className="sp-recent-time">{recentTime(r.at)}</span>
                    <PhoneIcon size={15} className="sp-recent-call" aria-hidden />
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="sp-keypad">
              {KEYS.map(([d, letters]) => (
                <button key={d} type="button" className="sp-key" aria-label={d} onClick={() => press(d)}>
                  <span className="sp-key-digit">{d}</span>
                  <span className="sp-key-letters">{letters}</span>
                </button>
              ))}
            </div>
          )}
          {showCallUi && xferOpen && callPhase !== "ended" && (
            <div className="sp-overlay">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{t("portal.transfer")}</span>
                <button className="sp-backspace !text-[var(--text-muted)]" type="button" aria-label="Close" onClick={() => setXferOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              <input
                className="input w-full font-mono"
                placeholder="Transfer to extension…"
                value={xferTarget}
                onChange={(e) => setXferTarget(e.target.value.replace(/[^\d*#]/g, ""))}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn btn-primary justify-center"
                  type="button"
                  disabled={!xferTarget}
                  onClick={() => {
                    void phone
                      .transfer(xferTarget, domain)
                      .then(() => {
                        toast.success(`Transferred to ${xferTarget}`);
                        setXferOpen(false);
                        setXferTarget("");
                        // Softphone also emits ended→idle; keep UI in sync for mocks.
                        resetCall();
                      })
                      .catch((e) => toast.error((e as Error).message));
                  }}
                >
                  Blind
                </button>
                <button
                  className="btn justify-center"
                  type="button"
                  disabled={!xferTarget}
                  onClick={() => {
                    void phone
                      .startConsult(xferTarget, domain)
                      .then(() => toast.message("Consult ringing — Complete when answered"))
                      .catch((e) => toast.error((e as Error).message));
                  }}
                >
                  Consult
                </button>
                <button
                  className="btn btn-primary justify-center"
                  type="button"
                  onClick={() => {
                    void phone
                      .completeConsultTransfer()
                      .then(() => {
                        toast.success("Attended transfer done");
                        setXferOpen(false);
                        setXferTarget("");
                        resetCall();
                      })
                      .catch((e) => toast.error((e as Error).message));
                  }}
                >
                  Complete
                </button>
                <button
                  className="btn justify-center"
                  type="button"
                  onClick={() => {
                    void phone
                      .cancelConsult()
                      .then(() => {
                        setHeld(false);
                        toast.message("Consult cancelled");
                      })
                      .catch((e) => toast.error((e as Error).message));
                  }}
                >
                  Cancel consult
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="sp-actions">
          {actionSlots.map((slot, i) =>
            slot ? (
              <div key={i} className="flex flex-col items-center">
                {slot}
              </div>
            ) : (
              <span key={i} aria-hidden className="sp-act is-placeholder" />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
