import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Maximize2, Mic, MicOff, Phone as PhoneIcon, PhoneOff } from "lucide-react";
import { formatCallTime, isLiveCall, usePhone } from "../lib/phone-context";

/**
 * Compact phone for every portal page except the phone itself: registration
 * state when idle; answer / decline for an incoming call; peer, timer, mute and
 * hang-up during a call. The softphone behind it is the portal's single one.
 */
export function MiniPhone({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const { phone, status, callPhase, inCall, callSeconds, peer, muted, setMuted } = usePhone();
  const live = isLiveCall(callPhase, inCall);
  const ringing = callPhase === "ringing";
  const ended = callPhase === "ended";

  const state = ringing
    ? t("portal.incoming")
    : callPhase === "dialing"
      ? t("portal.calling")
      : live
        ? t("portal.onCall")
        : status === "registered"
          ? t("portal.registered")
          : status === "connecting"
            ? t("portal.connecting")
            : t("portal.unregistered");
  const tone = ringing ? "ringing" : live ? "live" : status === "registered" ? "ok" : "off";

  return (
    <section
      className={`mini-phone is-${tone} ${className}`}
      aria-label={t("portal.miniPhone")}
      aria-live={ringing ? "assertive" : "polite"}
    >
      <Link to="/" className="mini-phone-info" title={t("portal.openPhone")}>
        <span className="mini-phone-dot" aria-hidden="true" />
        <span className="min-w-0">
          <span className="mini-phone-state">{state}</span>
          {(live || ended) && (
            <span className="mini-phone-peer">
              {peer || "—"}
              {live && !ringing && <span className="mini-phone-time">{formatCallTime(callSeconds)}</span>}
            </span>
          )}
        </span>
      </Link>
      <div className="mini-phone-actions">
        {ringing ? (
          <>
            <button
              type="button"
              className="mini-phone-btn is-end"
              aria-label={t("portal.decline")}
              title={t("portal.decline")}
              onClick={() => void phone.hangup()}
            >
              <PhoneOff size={16} />
            </button>
            <button
              type="button"
              className="mini-phone-btn is-answer"
              aria-label={t("portal.answer")}
              title={t("portal.answer")}
              onClick={() => void phone.answer()}
            >
              <PhoneIcon size={16} fill="currentColor" />
            </button>
          </>
        ) : live ? (
          <>
            <button
              type="button"
              className={`mini-phone-btn${muted ? " is-on" : ""}`}
              aria-label={muted ? t("portal.unmute") : t("portal.mute")}
              aria-pressed={muted}
              title={muted ? t("portal.unmute") : t("portal.mute")}
              onClick={() => {
                phone.setMute(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              type="button"
              className="mini-phone-btn is-end"
              aria-label={t("portal.hangup")}
              title={t("portal.hangup")}
              onClick={() => void phone.hangup()}
            >
              <PhoneOff size={16} />
            </button>
          </>
        ) : (
          <Link to="/" className="mini-phone-btn" aria-label={t("portal.openPhone")} title={t("portal.openPhone")}>
            <Maximize2 size={15} />
          </Link>
        )}
      </div>
    </section>
  );
}
