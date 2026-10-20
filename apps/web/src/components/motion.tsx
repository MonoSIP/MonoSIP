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
 * Softphone call visual: rings radiate while dialing/ringing, a voice
 * waveform moves while connected, and it draws a flat line when the call ends.
 */
export function CallPulse({ phase }: { phase: "dialing" | "ringing" | "active" | "ended" | "idle" }) {
  if (phase === "idle") return null;
  const calling = phase === "dialing" || phase === "ringing";
  return (
    <svg className={`mo-call mo-call--${phase}`} width="160" height="44" viewBox="0 0 160 44" aria-hidden>
      {calling && (
        <g>
          {[0, 1, 2].map((i) => (
            <circle key={i} className="mo-call-ring" cx="80" cy="22" r="20" style={{ animationDelay: `${i * 0.5}s` }} />
          ))}
          <circle cx="80" cy="22" r="6" className="mo-call-core" />
        </g>
      )}
      {phase === "active" &&
        Array.from({ length: 15 }, (_, i) => {
          const x = 24 + i * 8;
          const h = 8 + ((i * 7) % 5) * 5;
          return (
            <line
              key={i}
              className="mo-call-bar"
              x1={x}
              x2={x}
              y1={22 - h / 2}
              y2={22 + h / 2}
              style={{ animationDelay: `${(i % 5) * 0.12}s` }}
            />
          );
        })}
      {phase === "ended" && <path className="mo-call-flat" d="M16 22h128" pathLength={1} />}
    </svg>
  );
}
