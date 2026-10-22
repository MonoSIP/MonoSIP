import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "./api";
import { Softphone, type CallPhase } from "./softphone";

/**
 * The portal's one softphone. It lives in the portal layout, not in the phone
 * page, so moving between portal pages never drops the registration or an
 * active call; the full phone and the mini phone both read it from here.
 */
export type PhoneState = {
  phone: Softphone;
  status: Softphone["status"];
  detail?: string;
  domain: string;
  inCall: boolean;
  callPhase: CallPhase;
  callSeconds: number;
  peer: string;
  muted: boolean;
  held: boolean;
  noRtp: boolean;
  setMuted: (v: boolean) => void;
  setHeld: (v: boolean) => void;
  /** Show the phone idle right away (after a transfer hands the call off). */
  resetCall: () => void;
};

const PhoneCtx = createContext<PhoneState | null>(null);

export function usePhone(): PhoneState {
  const ctx = useContext(PhoneCtx);
  if (!ctx) throw new Error("usePhone must be used inside <PhoneProvider>");
  return ctx;
}

/** Settings pages render in tests without the portal phone. */
export function usePhoneOptional(): PhoneState | null {
  return useContext(PhoneCtx);
}

export function formatCallTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

/** Call is up or ringing (the states the mini phone acts on). */
export function isLiveCall(phase: CallPhase, inCall: boolean): boolean {
  return inCall || phase === "dialing" || phase === "ringing" || phase === "active";
}

export function PhoneProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  // Toasts use the current language; the phone itself never reconnects for it.
  const tRef = useRef(t);
  tRef.current = t;
  const qc = useQueryClient();
  const phoneRef = useRef<Softphone | null>(null);
  if (!phoneRef.current) phoneRef.current = new Softphone();
  const phone = phoneRef.current;

  const [status, setStatus] = useState(phone.status);
  const [detail, setDetail] = useState<string | undefined>();
  const [domain, setDomain] = useState("localhost");
  const [inCall, setInCall] = useState(false);
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [callSeconds, setCallSeconds] = useState(0);
  const [peer, setPeer] = useState("");
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [noRtp, setNoRtp] = useState(false);

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
      if (info?.peer) setPeer(info.peer);
      if (phase === "idle") setPeer("");
      if (phase === "ended") {
        void qc.invalidateQueries({ queryKey: ["my-calls"] });
        toast.message(tRef.current("portal.callEnded", { time: formatCallTime(info?.seconds ?? 0) }));
      }
      if (phase === "idle" || phase === "dialing") setNoRtp(false);
    };
    phone.onMediaWarning = () => {
      if (cancelled) return;
      setNoRtp(true);
      toast.error(tRef.current("portal.noRtp"));
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
  }, [phone, qc]);

  const value: PhoneState = {
    phone,
    status,
    detail,
    domain,
    inCall,
    callPhase,
    callSeconds,
    peer,
    muted,
    held,
    noRtp,
    setMuted,
    setHeld,
    resetCall: () => {
      setInCall(false);
      setCallPhase("idle");
    },
  };
  return <PhoneCtx.Provider value={value}>{children}</PhoneCtx.Provider>;
}
