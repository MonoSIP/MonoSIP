import type { LucideIcon } from "lucide-react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

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
      {actions ? <div className="toolbar toolbar-actions">{actions}</div> : null}
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

/** Compact icon-only control for table / list actions */
export function IconBtn({
  icon: Icon,
  label,
  danger,
  primary,
  className,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  primary?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`btn btn-icon ${danger ? "btn-danger" : ""} ${primary ? "btn-primary" : ""} ${className ?? ""}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={16} strokeWidth={2.25} />
    </button>
  );
}

export function IconLink({
  icon: Icon,
  label,
  className,
  ...props
}: {
  icon: LucideIcon;
  label: string;
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={`btn btn-icon ${className ?? ""}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={16} strokeWidth={2.25} />
    </a>
  );
}

export function SectionCard({
  title,
  icon: Icon,
  tone = "cyan",
  children,
  actions,
  className,
  /** Flush body padding — use for tables so headers align cleanly */
  flush = false,
}: {
  title: string;
  icon?: LucideIcon;
  tone?: Tone;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  const tint =
    tone === "coral" ? "card-tint-coral" : tone === "blue" ? "card-tint-blue" : "card-tint-cyan";
  return (
    <section className={`card section-card ${tint} ${flush ? "section-card-flush" : ""} ${className ?? ""}`}>
      <div className="section-card-head">
        <h2 className="section-card-title" style={{ color: TONE_VAR[tone] }}>
          {Icon ? <Icon size={18} strokeWidth={2.25} /> : null}
          {title}
        </h2>
        {actions ? <div className="toolbar toolbar-actions">{actions}</div> : null}
      </div>
      <div className={`section-card-body ${flush ? "section-card-body-flush" : "space-y-3"}`}>{children}</div>
    </section>
  );
}

/**
 * On/off switch. `pending` disables it and shows a spinner on the thumb while a
 * save is in flight, so a second click can't race the first.
 */
export function Switch({
  checked,
  onChange,
  label,
  pending,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  pending?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={pending || undefined}
      title={label}
      disabled={disabled || pending}
      className={`ui-switch${checked ? " is-on" : ""}${pending ? " is-pending" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-switch-thumb" />
    </button>
  );
}
