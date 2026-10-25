import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import {
  AlertDialog,
  Checkbox as CheckboxPrimitive,
  Dialog,
  DropdownMenu,
  Label,
  Select,
  Switch as SwitchPrimitive,
  ToggleGroup,
  Tooltip,
} from "radix-ui";
import {
  useId,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
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
    <Label.Root className={`field ${className ?? ""}`}>
      <span className="field-label">
        {Icon ? <Icon size={14} strokeWidth={2.25} /> : null}
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span> : null}
    </Label.Root>
  );
}

export function TextField({
  label,
  icon: Icon,
  hint,
  className,
  id,
  ...props
}: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className={`field ${className ?? ""}`}>
      <Label.Root htmlFor={fieldId} className="field-label">
        {Icon ? <Icon size={14} strokeWidth={2.25} /> : null}
        {label}
      </Label.Root>
      <span className={`field-control ${Icon ? "has-icon" : ""}`}>
        {Icon ? (
          <span className="field-icon">
            <Icon size={16} strokeWidth={2} />
          </span>
        ) : null}
        <input id={fieldId} className="input" {...props} />
      </span>
      {hint ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span> : null}
    </div>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

const EMPTY_OPTION = "__empty__";

export function SelectInput({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
  required,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  required?: boolean;
}) {
  const hasEmpty = options.some((option) => option.value === "");
  const encoded = value === "" ? EMPTY_OPTION : value;
  const known = options.some((option) => (option.value === "" ? EMPTY_OPTION : option.value) === encoded);
  return (
    <Select.Root
      value={known ? encoded : ""}
      onValueChange={(next) => onValueChange(next === EMPTY_OPTION ? "" : next)}
      disabled={disabled}
      required={required}
    >
      <Select.Trigger id={id} className={`input ui-select-trigger ${className ?? ""}`} aria-label={ariaLabel}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="ui-select-icon" aria-hidden>
          <ChevronDown size={16} strokeWidth={2.25} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="ui-select-content" position="popper" sideOffset={4}>
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                key={option.value === "" ? EMPTY_OPTION : option.value}
                value={option.value === "" ? EMPTY_OPTION : option.value}
                disabled={option.disabled}
                className="ui-select-item"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="ui-select-indicator">
                  <Check size={14} strokeWidth={2.5} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function SelectField({
  label,
  icon: Icon,
  hint,
  className,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  required,
  id,
}: FieldBase & {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className={`field ${className ?? ""}`}>
      <Label.Root htmlFor={fieldId} className="field-label">
        {Icon ? <Icon size={14} strokeWidth={2.25} /> : null}
        {label}
      </Label.Root>
      <span className={`field-control ${Icon ? "has-icon" : ""}`}>
        {Icon ? (
          <span className="field-icon">
            <Icon size={16} strokeWidth={2} />
          </span>
        ) : null}
        <SelectInput
          id={fieldId}
          value={value}
          onValueChange={onValueChange}
          options={options}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
        />
      </span>
      {hint ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span> : null}
    </div>
  );
}

export function TextAreaField({
  label,
  icon: Icon,
  hint,
  className,
  id,
  ...props
}: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className={`field ${className ?? ""}`}>
      <Label.Root htmlFor={fieldId} className="field-label">
        {Icon ? <Icon size={14} strokeWidth={2.25} /> : null}
        {label}
      </Label.Root>
      <textarea id={fieldId} className="input" {...props} />
      {hint ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span> : null}
    </div>
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
    <Tip label={label}>
      <button
        type="button"
        className={`btn btn-icon ${danger ? "btn-danger" : ""} ${primary ? "btn-primary" : ""} ${className ?? ""}`}
        aria-label={label}
        {...props}
      >
        <Icon size={16} strokeWidth={2.25} />
      </button>
    </Tip>
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
    <Tip label={label}>
      <a className={`btn btn-icon ${className ?? ""}`} aria-label={label} {...props}>
        <Icon size={16} strokeWidth={2.25} />
      </a>
    </Tip>
  );
}

export function SectionCard({
  title,
  icon: Icon,
  children,
  actions,
  className,
  /** Flush body padding — use for tables so headers align cleanly */
  flush = false,
}: {
  title?: string;
  icon?: LucideIcon;
  tone?: Tone;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`card section-card ${flush ? "section-card-flush" : ""} ${className ?? ""}`}>
      {title || actions ? (
        <div className="section-card-head">
          {title ? (
            <h2 className="section-card-title">
              {Icon ? <Icon size={16} strokeWidth={2.25} /> : null}
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions ? <div className="toolbar toolbar-actions">{actions}</div> : null}
        </div>
      ) : null}
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
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled || pending}
      aria-label={label}
      aria-busy={pending || undefined}
      className={`ui-switch${checked ? " is-on" : ""}${pending ? " is-pending" : ""}`}
    >
      <SwitchPrimitive.Thumb className="ui-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}

function Tip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="ui-tooltip" sideOffset={6}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delayDuration={400}>{children}</Tooltip.Provider>;
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`ui-check ${className ?? ""}`}>
      <CheckboxPrimitive.Root
        id={id}
        className="ui-checkbox"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      >
        <CheckboxPrimitive.Indicator>
          <Check size={12} strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <Label.Root htmlFor={id} className="ui-check-label">
        {label}
      </Label.Root>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; disabled?: boolean }>;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      className={`segmented ${className ?? ""}`}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={`btn ${option.value === value ? "btn-primary" : ""}`}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  eyebrow,
  children,
  footer,
  headerAside,
  className,
  dismissable = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  children?: ReactNode;
  footer?: ReactNode;
  headerAside?: ReactNode;
  className?: string;
  dismissable?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-overlay" />
        <Dialog.Content
          className={`ui-dialog ${className ?? "max-w-lg"}`}
          onEscapeKeyDown={(event) => {
            if (!dismissable) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!dismissable) event.preventDefault();
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="min-w-0">
              {eyebrow ? (
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{eyebrow}</div>
              ) : null}
              <Dialog.Title className="text-base font-semibold text-[var(--text)]">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-[var(--muted)]">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            {headerAside}
          </div>
          {children ? <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div> : null}
          {footer ? <div className="flex shrink-0 justify-end gap-2 px-4 py-3">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="ui-overlay" />
        <AlertDialog.Content className="ui-dialog ui-dialog-pad max-w-sm">
          <AlertDialog.Title className="text-sm font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--muted)]">{description}</AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Cancel className="btn" disabled={pending}>
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action className="btn btn-danger" disabled={pending} onClick={onConfirm}>
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function Menu({
  trigger,
  children,
  side = "bottom",
  align = "start",
}: {
  trigger: ReactElement;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="ui-menu" side={side} align={align} sideOffset={6}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({ onSelect, children }: { onSelect?: () => void; children: ReactNode }) {
  return (
    <DropdownMenu.Item
      className="ui-menu-item"
      onSelect={() => {
        onSelect?.();
      }}
    >
      {children}
    </DropdownMenu.Item>
  );
}
