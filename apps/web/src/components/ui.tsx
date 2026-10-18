import type { LucideIcon } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type Tone = "cyan" | "coral" | "blue" | "success" | "warn" | "danger";

const TONE_VAR: Record<Tone, string> = {
  cyan: "var(--accent)",
  coral: "var(--accent-2)",
  blue: "var(--accent-3)",
  success: "var(--success)",
  warn: "var(--warning)",
  danger: "var(--danger)",
};

export function PageHeader({
  icon: Icon,
  title,
  description,
  tone = "cyan",
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  tone?: Tone;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header" style={{ ["--tone" as string]: TONE_VAR[tone] }}>
      <div className="page-header-title">
        <span className="page-header-icon" aria-hidden>
          <Icon size={22} strokeWidth={2.25} />
        </span>
        <div>
          <h1>{title}</h1>
          {description ? <div className="mt-1 text-[0.92rem] text-[var(--text-muted)]">{description}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatTile({
  icon: Icon,
  label,
  value,
  tone = "cyan",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="stat-tile" style={{ ["--tone" as string]: TONE_VAR[tone] }}>
      <div className="stat-label">
        <Icon size={15} strokeWidth={2.25} />
        {label}
      </div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

type FieldBase = {
  label: string;
  icon?: LucideIcon;
  hint?: string;
  className?: string;
};

export function Field({
  label,
  icon: Icon,
  hint,
  className,
  children,
}: FieldBase & { children: ReactNode }) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span className="field-label">
        {Icon ? <Icon size={14} strokeWidth={2.25} /> : null}
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );
}

export function TextField({
  label,
  icon: Icon,
  hint,
  className,
  ...props
}: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span className="field-label">
        {Icon ? <Icon size={14} strokeWidth={2.25} /> : null}
        {label}
      </span>
      <span className={`field-control ${Icon ? "has-icon" : ""}`}>
        {Icon ? (
          <span className="field-icon">
            <Icon size={16} strokeWidth={2} />
          </span>
        ) : null}
        <input className="input" {...props} />
      </span>
      {hint ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  icon: Icon,
  hint,
  className,
  children,
  ...props
}: FieldBase & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span className="field-label">
        {Icon ? <Icon size={14} strokeWidth={2.25} /> : null}
        {label}
      </span>
      <span className={`field-control ${Icon ? "has-icon" : ""}`}>
        {Icon ? (
          <span className="field-icon">
            <Icon size={16} strokeWidth={2} />
          </span>
        ) : null}
        <select className="input" {...props}>
          {children}
        </select>
      </span>
      {hint ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );
}

export function TextAreaField({
  label,
  icon: Icon,
  hint,
  className,
  ...props
}: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span className="field-label">
        {Icon ? <Icon size={14} strokeWidth={2.25} /> : null}
        {label}
      </span>
      <textarea className="input" {...props} />
      {hint ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );
}

export function SectionCard({
  title,
  icon: Icon,
  tone = "cyan",
  children,
  actions,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  tone?: Tone;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const tint =
    tone === "coral" ? "card-tint-coral" : tone === "blue" ? "card-tint-blue" : "card-tint-cyan";
  return (
    <section className={`card ${tint} space-y-3 p-4 md:p-5 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          className="flex items-center gap-2 text-base font-semibold"
          style={{ color: TONE_VAR[tone] }}
        >
          {Icon ? <Icon size={18} strokeWidth={2.25} /> : null}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
