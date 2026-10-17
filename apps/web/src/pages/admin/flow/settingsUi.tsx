import type { ReactNode } from "react";

/** Grouped block inside a node settings popup. */
export function SettingsSection({
  step,
  title,
  hint,
  children,
}: {
  step?: number | string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--bg-soft)_55%,transparent)] p-3.5">
      <header className="space-y-0.5">
        <div className="flex items-center gap-2">
          {step != null && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">
              {step}
            </span>
          )}
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text)]">{title}</h3>
        </div>
        {hint ? <p className="text-[11px] leading-snug text-[var(--text-muted)]">{hint}</p> : null}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs text-[var(--text-muted)] ${className ?? ""}`}>
      <span className="font-medium text-[var(--text)]">{label}</span>
      {hint ? <span className="mt-0.5 block font-normal opacity-80">{hint}</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function ExitsHint({ exits }: { exits: string[] }) {
  if (!exits.length) {
    return (
      <p className="text-[11px] text-[var(--text-muted)]">
        This node ends the path — no exits to wire on the map.
      </p>
    );
  }
  return (
    <p className="text-[11px] text-[var(--text-muted)]">
      Map exits:{" "}
      {exits.map((e, i) => (
        <span key={e}>
          {i > 0 ? ", " : ""}
          <code className="rounded bg-[var(--bg-soft)] px-1">{e}</code>
        </span>
      ))}
    </p>
  );
}

/** Segmented control for a small set of options (e.g. HTTP method). */
export function SegmentedSelect({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  "aria-label"?: string;
}) {
  return (
    <div
      className="flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1"
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`min-w-[3.25rem] flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
              active
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--text)]"
            }`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
