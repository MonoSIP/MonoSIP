/**
 * Small animated SVGs for loading and live call state. Motion is CSS-driven
 * (index.css `.mo-*`) and stops under prefers-reduced-motion.
 */

/** Indeterminate loader — an arc chasing around a faint track. */
export function Spinner({ size = 28, label }: { size?: number; label?: string }) {
  return (
    <svg
      className="mo-spinner"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={2.5} />
      <circle
        className="mo-spinner-arc"
        cx="12"
        cy="12"
        r="9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        pathLength={100}
      />
    </svg>
  );
}

/** Pulsing status dot: `live` pulses, otherwise it sits still. */
export function LiveDot({ live, tone = "ok" }: { live: boolean; tone?: "ok" | "err" | "busy" }) {
  return (
    <svg className={`mo-dot mo-dot--${tone}`} width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      {live && <circle className="mo-dot-halo" cx="5" cy="5" r="4" />}
      <circle cx="5" cy="5" r="3" />
    </svg>
  );
}

/**
 * Softphone in-screen call art (lives inside the phone "screen", fixed size):
 * rings radiate from the contact avatar while dialing/ringing, the avatar
 * breathes with live audio bars while connected, and it greys out when ended.
 */
export function CallPulse({
  phase,
  label,
}: {
  phase: "dialing" | "ringing" | "active" | "ended" | "idle";
  label: string;
}) {
  if (phase === "idle") return null;
  const calling = phase === "dialing" || phase === "ringing";
  return (
    <svg className={`mo-call mo-call--${phase}`} width="76" height="76" viewBox="0 0 76 76" aria-hidden>
      {calling &&
        [0, 1, 2].map((i) => (
          <circle key={i} className="mo-call-ring" cx="38" cy="38" r="36" style={{ animationDelay: `${i * 0.55}s` }} />
        ))}
      {phase === "active" && <circle className="mo-call-halo" cx="38" cy="38" r="33" />}
      <circle className="mo-call-avatar" cx="38" cy="38" r="26" />
      {/* Contact silhouette (the number is shown under the avatar) */}
      <g className="mo-call-person">
        <circle cx="38" cy="32.5" r="7" />
        <path d="M24.5 53.5a13.5 11 0 0 1 27 0" />
      </g>
      <title>{label}</title>
    </svg>
  );
}

/** Inline live-audio bars next to the in-call timer. */
export function CallBars() {
  return (
    <svg className="mo-bars" width="18" height="12" viewBox="0 0 18 12" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} className="mo-bar" x={i * 5} y="0" width="3" height="12" rx="1.5" style={{ animationDelay: `${i * 0.13}s` }} />
      ))}
    </svg>
  );
}
