import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Softphone } from "../../lib/softphone";

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
  const [dnd, setDnd] = useState(false);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [xferOpen, setXferOpen] = useState(false);
  const [xferTarget, setXferTarget] = useState("");
  const [detail, setDetail] = useState<string | undefined>();

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

  useEffect(() => {
    if (me.data) setDnd(!!me.data.dnd);
  }, [me.data]);

  useEffect(() => {
    const dial = params.get("dial");
    if (dial) setDigits(dial);
  }, [params]);

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
  }, [phone]);

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
      } else if (e.key === "Enter" && !inCall && status === "registered" && digits) {
        e.preventDefault();
        void phone.dial(digits, domain).catch((err) => toast.error(String(err)));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // press uses latest inCall/digits via closure; rebind when those change
  }, [digits, inCall, status, domain, phone]);

  function press(d: string) {
    phone.playDtmfTone(d);
    if (inCall) {
      void phone.sendDtmf(d).catch(() => undefined);
    } else {
      setDigits((v) => v + d);
    }
  }

  function clearDigits() {
    setDigits("");
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="mb-2 text-2xl font-semibold">{t("nav.phone")}</h1>
      <p className="mb-2 text-sm text-[var(--text-muted)]">
        {status === "registered"
          ? t("portal.registered")
          : status === "connecting"
            ? t("portal.connecting")
            : status === "error"
              ? detail || "Error"
              : t("portal.unregistered")}
      </p>
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
        <div className="mb-4 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((d) => (
            <button key={d} type="button" className="btn justify-center py-4 text-xl" onClick={() => press(d)}>
              {d}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {!inCall ? (
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
              <button className="btn flex-1 justify-center" type="button" onClick={() => void phone.answer()}>
                {t("portal.answer")}
              </button>
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
              <button
                className="btn btn-danger flex-1 justify-center"
                type="button"
                onClick={() => void phone.hangup()}
              >
                {t("portal.hangup")}
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
        {inCall && xferOpen && (
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
                    setInCall(false);
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
      <div className="card p-4">
        <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Recent calls</h2>
        <ul className="space-y-1 text-sm">
          {(recent.data ?? []).slice(0, 8).length === 0 ? (
            <li className="text-[var(--text-muted)]">—</li>
          ) : (
            (recent.data ?? []).slice(0, 8).map((c) => {
              const peer = c.direction === "outbound" ? c.callee : c.caller;
              return (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="font-mono text-left hover:underline"
                    onClick={() => setDigits(peer ?? "")}
                  >
                    {peer ?? "—"}
                  </button>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(c.startedAt).toLocaleString()}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
