import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { History, Phone } from "lucide-react";
import { api } from "../../lib/api";
import { callPeer } from "../../lib/call-peer";
import { Softphone, type CallPhase } from "../../lib/softphone";
import { PageHeader, SectionCard } from "../../components/ui";

function formatCallTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

type HealthMedia = {
  rtpPortsPublished?: boolean;
  warnings?: Array<{ code: string; en: string; tr: string }>;
};

export function PhonePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const phoneRef = useRef<Softphone | null>(null);
  if (!phoneRef.current) phoneRef.current = new Softphone();
  const phone = phoneRef.current;

  const [status, setStatus] = useState(phone.status);
  const [digits, setDigits] = useState("");
  const [domain, setDomain] = useState("localhost");
  const [inCall, setInCall] = useState(false);
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [callSeconds, setCallSeconds] = useState(0);
  const [dnd, setDnd] = useState(false);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [xferOpen, setXferOpen] = useState(false);
  const [xferTarget, setXferTarget] = useState("");
  const [detail, setDetail] = useState<string | undefined>();
  const [noRtp, setNoRtp] = useState(false);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ dnd: boolean; number: string; name: string }>("/api/v1/me"),
  });
  const recent = useQuery({
    queryKey: ["my-calls"],
    queryFn: () =>
      api.get<Array<{ id: string; caller: string | null; callee: string | null; startedAt: string; direction: string }>>(
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

  useEffect(() => {
    if (callPhase !== "dialing" && callPhase !== "ringing" && callPhase !== "active") return;
    const id = window.setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [callPhase]);

  useEffect(() => {
    let cancelled = false;
    phone.onStatus = (s, d) => {
      if (!cancelled) {
        setStatus(s);
        setDetail(d);
      }
    };
    phone.onSession = (s) => {
      if (!cancelled) {
        setInCall(!!s);
        if (!s) {
          setMuted(false);
          setHeld(false);
        }
      }
    };
    phone.onCallPhase = (phase, info) => {
      if (cancelled) return;
      setCallPhase(phase);
      if (info?.seconds != null) setCallSeconds(info.seconds);
      if (phase === "ended") {
        const dur = formatCallTime(info?.seconds ?? 0);
        toast.message(t("portal.callEnded", { time: dur }));
      }
      if (phase === "idle" || phase === "dialing") setNoRtp(false);
    };
    phone.onMediaWarning = () => {
      if (cancelled) return;
      setNoRtp(true);
      toast.error(t("portal.noRtp"));
    };

    void (async () => {
      try {
        const creds = await api.get<{
          extension: string;
          password: string;
          domain: string;
          displayName: string;
        }>("/api/v1/me/sip-credentials");
        if (cancelled) return;
        setDomain(creds.domain);
        await phone.loadPreferredDevices();
        await Softphone.requestNotifyPermission().catch(() => undefined);
        await phone.connect(creds);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        toast.error((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      void phone.disconnect(true);
    };
  }, [phone, t]);

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
  const primaryCallLabel =
    callPhase === "ended"
      ? `${t("portal.ended")} ${timeLabel}`
      : callPhase === "dialing" || callPhase === "ringing"
        ? `${t("portal.dialing")} ${timeLabel}`
        : `${t("portal.hangup")} ${timeLabel}`;

  const bannerText = noRtp
    ? t("portal.noRtp")
    : mediaWarning
      ? mediaWarning.en
      : null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader
        icon={Phone}
        title={t("nav.phone")}
        tone="cyan"
        description={
          status === "registered"
            ? t("portal.registered")
            : status === "connecting"
              ? t("portal.connecting")
              : status === "error"
                ? detail || "Error"
                : t("portal.unregistered")
        }
      />
      {showMediaBanner && bannerText && (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          {bannerText}
        </div>
      )}
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <input
            className="input flex-1 text-center font-mono text-2xl tracking-widest"
            value={digits}
            onChange={(e) => setDigits(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                clearDigits();
              }
            }}
            placeholder="…"
          />
          <button
            className="btn shrink-0"
            type="button"
            title="Clear (Esc)"
            onClick={clearDigits}
            disabled={!digits}
          >
            ⌫
          </button>
        </div>
        {showCallUi && (
          <p
            className="mb-3 text-center font-mono text-3xl tabular-nums tracking-wider text-[var(--text)]"
            aria-live="polite"
          >
            {timeLabel}
          </p>
        )}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((d) => (
            <button key={d} type="button" className="btn justify-center py-4 text-xl" onClick={() => press(d)}>
              {d}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {!showCallUi ? (
            <>
              <button
                className="btn btn-primary flex-1 justify-center"
                type="button"
                disabled={status !== "registered" || !digits}
                onClick={() => void phone.dial(digits, domain).catch((e) => toast.error(String(e)))}
              >
                {t("portal.dial")}
              </button>
              <button className="btn" type="button" onClick={clearDigits} disabled={!digits}>
                Clear
              </button>
            </>
          ) : (
            <>
              {callPhase === "ringing" && (
                <button className="btn flex-1 justify-center" type="button" onClick={() => void phone.answer()}>
                  {t("portal.answer")}
                </button>
              )}
              {callPhase !== "ended" && (
                <>
                  <button
                    className={`btn flex-1 justify-center ${muted ? "btn-primary" : ""}`}
                    type="button"
                    onClick={() => {
                      phone.setMute(!muted);
                      setMuted(!muted);
                    }}
                  >
                    Mute
                  </button>
                  <button
                    className={`btn flex-1 justify-center ${held ? "btn-primary" : ""}`}
                    type="button"
                    onClick={() => {
                      void phone.setHold(!held).then(() => setHeld(!held));
                    }}
                  >
                    Hold
                  </button>
                  <button
                    className="btn flex-1 justify-center"
                    type="button"
                    onClick={() => setXferOpen((v) => !v)}
                  >
                    Transfer
                  </button>
                </>
              )}
              <button
                className={`btn flex-1 justify-center font-mono ${
                  callPhase === "ended" ? "btn-primary" : "btn-danger"
                }`}
                type="button"
                aria-label={t("portal.hangup")}
                disabled={callPhase === "ended"}
                onClick={() => void phone.hangup()}
              >
                {primaryCallLabel}
              </button>
            </>
          )}
          <button
            className={`btn ${dnd ? "btn-primary" : ""}`}
            type="button"
            onClick={async () => {
              const next = !dnd;
              try {
                await api.put("/api/v1/me/dnd", { dnd: next });
                setDnd(next);
                void me.refetch();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            {t("portal.dnd")}
          </button>
        </div>
        {showCallUi && xferOpen && callPhase !== "ended" && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
            <input
              className="input flex-1 font-mono"
              placeholder="Transfer to extension…"
              value={xferTarget}
              onChange={(e) => setXferTarget(e.target.value.replace(/[^\d*#]/g, ""))}
            />
            <button
              className="btn btn-primary"
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
                    setInCall(false);
                    setCallPhase("idle");
                  })
                  .catch((e) => toast.error((e as Error).message));
              }}
            >
              Blind
            </button>
            <button
              className="btn"
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
              className="btn btn-primary"
              type="button"
              onClick={() => {
                void phone
                  .completeConsultTransfer()
                  .then(() => {
                    toast.success("Attended transfer done");
                    setXferOpen(false);
                    setXferTarget("");
                    setInCall(false);
                    setCallPhase("idle");
                  })
                  .catch((e) => toast.error((e as Error).message));
              }}
            >
              Complete
            </button>
            <button
              className="btn"
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
        )}
      </div>
      <SectionCard title="Recent calls" icon={History} tone="blue">
        <ul className="space-y-1 text-sm">
          {(recent.data ?? []).slice(0, 8).length === 0 ? (
            <li className="text-[var(--text-muted)]">—</li>
          ) : (
            (recent.data ?? []).slice(0, 8).map((c) => {
              const peer = callPeer(c, me.data?.number);
              return (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="font-mono text-left hover:underline"
                    onClick={() => setDigits(peer)}
                  >
                    {peer || "—"}
                  </button>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(c.startedAt).toLocaleString()}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </SectionCard>
    </div>
  );
}
