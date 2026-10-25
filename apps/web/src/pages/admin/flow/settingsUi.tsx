import type { ReactNode } from "react";
import { Label } from "radix-ui";
import { Segmented } from "../../../components/ui";
import { tr } from "../../../i18n";

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
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-[var(--primary-foreground)]">
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
    <Label.Root className={`block text-xs text-[var(--text-muted)] ${className ?? ""}`}>
      <span className="font-medium text-[var(--text)]">{label}</span>
      {hint ? <span className="mt-0.5 block font-normal opacity-80">{hint}</span> : null}
      <div className="mt-1">{children}</div>
    </Label.Root>
  );
}

export function ExitsHint({ exits }: { exits: string[] }) {
  if (!exits.length) {
    return (
      <p className="text-[11px] text-[var(--text-muted)]">
        {tr("This node ends the path — no exits to wire on the map.")}
      </p>
    );
  }
  return (
    <p className="text-[11px] text-[var(--text-muted)]">
      {tr("Map exits:")}{" "}
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
    <Segmented
      className="segmented-compact"
      aria-label={ariaLabel}
      value={value}
      onValueChange={onChange}
      options={options}
    />
  );
}
