import {
  AlertDialog,
  Button as ThemesButton,
  Card,
  Checkbox as ThemesCheckbox,
  Dialog,
  DropdownMenu,
  Flex,
  Heading,
  IconButton,
  Select as ThemesSelect,
  SegmentedControl,
  Switch as ThemesSwitch,
  Text,
  TextArea,
  TextField as ThemesTextField,
  Theme,
  Tooltip,
  useThemeContext,
} from "@radix-ui/themes";
import { type LucideIcon } from "lucide-react";
import {
  useId,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { useStore } from "../store";

type Tone = "cyan" | "coral" | "blue" | "success" | "warn" | "danger";

const TONE_COLOR = {
  cyan: "cyan",
  coral: "orange",
  blue: "blue",
  success: "green",
  warn: "amber",
  danger: "red",
} as const;

type ThemesButtonProps = ComponentProps<typeof ThemesButton>;

/** Pages rendered outside the app shell (tests) still need a theme for these components. */
function InTheme({ children }: { children: ReactNode }) {
  let ready = true;
  try {
    useThemeContext();
  } catch {
    ready = false;
  }
  if (ready) return children;
  return (
    <Theme appearance="dark" accentColor="teal" grayColor="slate" hasBackground panelBackground="translucent" radius="medium" scaling="100%">
      {children}
    </Theme>
  );
}

/** Radix Themes button. Secondary actions stay soft; pass variant="solid" for the main action. */
export function Button({ variant = "soft", ...props }: ThemesButtonProps) {
  return (
    <InTheme>
      <ThemesButton variant={variant} {...props} />
    </InTheme>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  const theme = useStore((s) => s.theme);
  return (
    <Theme
      appearance={theme}
      accentColor="teal"
      grayColor="slate"
      hasBackground
      panelBackground="translucent"
      radius="medium"
      scaling="100%"
      style={{ height: "100%" }}
    >
      {children}
    </Theme>
  );
}

export function Surface({
  className,
  children,
  size = "4",
}: {
  className?: string;
  children: ReactElement;
  size?: "1" | "2" | "3" | "4" | "5";
}) {
  return (
    <InTheme>
      <Card asChild size={size} className={className}>
        {children}
      </Card>
    </InTheme>
  );
}

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
    <InTheme>
    <Flex align="center" justify="between" gap="4" mb="4" className="page-header">
      <Flex align="center" gap="3" className="page-header-title">
        <Text color={TONE_COLOR[tone]} as="span" className="page-header-icon">
          <Icon size={22} strokeWidth={2.25} />
        </Text>
        <div>
          {description ? (
            <>
              <Heading as="h1" className="sr-only">
                {title}
              </Heading>
              <Text as="p" size="2" className="page-header-desc">
                {description}
              </Text>
            </>
          ) : (
            <Heading as="h1" size="6" weight="medium" wrap="balance">
              {title}
            </Heading>
          )}
        </div>
      </Flex>
      {actions ? (
        <Flex gap="2" align="center" className="toolbar toolbar-actions">
          {actions}
        </Flex>
      ) : null}
    </Flex>
    </InTheme>
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
    <InTheme>
    <Card size="2" className="stat-tile" data-tone={tone}>
      <Flex direction="column" gap="1">
        <Flex align="center" gap="2" className="stat-label">
          <Text color={TONE_COLOR[tone]} as="span">
            <Icon size={15} strokeWidth={2.25} />
          </Text>
          <Text size="2" color="gray">
            {label}
          </Text>
        </Flex>
        <Text size="7" weight="bold" className="stat-value">
          {value}
        </Text>
      </Flex>
    </Card>
    </InTheme>
  );
}

type FieldBase = {
  label: string;
  icon?: LucideIcon;
  hint?: string;
  className?: string;
};

function FieldLabel({
  htmlFor,
  icon: Icon,
  children,
}: {
  htmlFor?: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Text as="label" htmlFor={htmlFor} size="2" weight="medium" className="field-label">
      {Icon ? <Icon size={14} strokeWidth={2.25} /> : null}
      {children}
    </Text>
  );
}

export function Field({ label, icon, hint, className, children }: FieldBase & { children: ReactNode }) {
  return (
    <InTheme>
    <Flex direction="column" gap="1" mb="2" className={`field ${className ?? ""}`}>
      <FieldLabel icon={icon}>{label}</FieldLabel>
      {children}
      {hint ? (
        <Text size="1" color="gray">
          {hint}
        </Text>
      ) : null}
    </Flex>
    </InTheme>
  );
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "color" | "children">;

export function TextField({ label, icon: Icon, hint, className, id, ...props }: FieldBase & TextInputProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <InTheme>
    <Flex direction="column" gap="1" mb="2" className={`field ${className ?? ""}`}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <ThemesTextField.Root id={fieldId} {...(props as ComponentProps<typeof ThemesTextField.Root>)}>
        {Icon ? (
          <ThemesTextField.Slot>
            <Icon size={16} strokeWidth={2} />
          </ThemesTextField.Slot>
        ) : null}
      </ThemesTextField.Root>
      {hint ? (
        <Text size="1" color="gray">
          {hint}
        </Text>
      ) : null}
    </Flex>
    </InTheme>
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
  const encoded = value === "" ? EMPTY_OPTION : value;
  const known = options.some((option) => (option.value === "" ? EMPTY_OPTION : option.value) === encoded);
  return (
    <InTheme>
    <ThemesSelect.Root
      value={known ? encoded : undefined}
      onValueChange={(next) => onValueChange(next === EMPTY_OPTION ? "" : next)}
      disabled={disabled}
      required={required}
      size="2"
    >
      <ThemesSelect.Trigger
        id={id}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={className}
      />
      <ThemesSelect.Content position="popper" sideOffset={4}>
        {options.map((option) => (
          <ThemesSelect.Item
            key={option.value === "" ? EMPTY_OPTION : option.value}
            value={option.value === "" ? EMPTY_OPTION : option.value}
            disabled={option.disabled}
          >
            {option.label}
          </ThemesSelect.Item>
        ))}
      </ThemesSelect.Content>
    </ThemesSelect.Root>
    </InTheme>
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
    <InTheme>
    <Flex direction="column" gap="1" mb="2" className={`field ${className ?? ""}`}>
      <FieldLabel htmlFor={fieldId} icon={Icon}>
        {label}
      </FieldLabel>
      <SelectInput
        id={fieldId}
        value={value}
        onValueChange={onValueChange}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
      />
      {hint ? (
        <Text size="1" color="gray">
          {hint}
        </Text>
      ) : null}
    </Flex>
    </InTheme>
  );
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size" | "color" | "children">;

export function TextAreaField({ label, icon: Icon, hint, className, id, ...props }: FieldBase & TextAreaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <InTheme>
    <Flex direction="column" gap="1" mb="2" className={`field ${className ?? ""}`}>
      <FieldLabel htmlFor={fieldId} icon={Icon}>
        {label}
      </FieldLabel>
      <TextArea id={fieldId} {...(props as ComponentProps<typeof TextArea>)} />
      {hint ? (
        <Text size="1" color="gray">
          {hint}
        </Text>
      ) : null}
    </Flex>
    </InTheme>
  );
}

/** Compact icon-only control for table / list actions */
export function IconBtn({
  icon: Icon,
  label,
  danger,
  primary,
  className,
  type,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  primary?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color">) {
  return (
    <InTheme>
    <Tooltip content={label}>
      <IconButton
        type={type ?? "button"}
        variant={primary || danger ? "solid" : "soft"}
        color={danger ? "red" : undefined}
        aria-label={label}
        className={className}
        {...props}
      >
        <Icon size={16} strokeWidth={2.25} />
      </IconButton>
    </Tooltip>
    </InTheme>
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
    <InTheme>
    <Tooltip content={label}>
      <IconButton asChild variant="soft" className={className} aria-label={label}>
        <a {...props}>
          <Icon size={16} strokeWidth={2.25} />
        </a>
      </IconButton>
    </Tooltip>
    </InTheme>
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
    <InTheme>
    <Card asChild size="2" className={`section-card ${flush ? "section-card-flush" : ""} ${className ?? ""}`} style={flush ? { padding: 0 } : undefined}>
      <section>
      {title || actions ? (
        <Flex align="center" justify="between" gap="3" mb={flush ? "0" : "3"} px={flush ? "4" : "0"} pt={flush ? "3" : "0"} className="section-card-head">
          {title ? (
            <Heading as="h2" size="4" weight="medium" className="section-card-title">
              {Icon ? <Icon size={16} strokeWidth={2.25} /> : null}
              {title}
            </Heading>
          ) : (
            <span />
          )}
          {actions ? (
            <Flex gap="2" align="center" className="toolbar toolbar-actions">
              {actions}
            </Flex>
          ) : null}
        </Flex>
      ) : null}
      <div className={`section-card-body ${flush ? "section-card-body-flush" : ""}`}>{children}</div>
      </section>
    </Card>
    </InTheme>
  );
}

/**
 * On/off switch. `pending` disables it while a save is in flight, so a second
 * click can't race the first.
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
    <InTheme>
    <ThemesSwitch
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled || pending}
      aria-label={label}
      aria-busy={pending || undefined}
    />
    </InTheme>
  );
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
    <InTheme>
    <Flex align="center" gap="2" className={`ui-check ${className ?? ""}`}>
      <ThemesCheckbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <Text as="label" htmlFor={id} size="2" className="ui-check-label">
        {label}
      </Text>
    </Flex>
    </InTheme>
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
    <InTheme>
    <SegmentedControl.Root
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      className={className}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <SegmentedControl.Item key={option.value} value={option.value}>
          {option.label}
        </SegmentedControl.Item>
      ))}
    </SegmentedControl.Root>
    </InTheme>
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
    <InTheme>
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        className={className}
        maxWidth="36rem"
        onEscapeKeyDown={(event) => {
          if (!dismissable) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (!dismissable) event.preventDefault();
        }}
      >
        <Flex align="start" justify="between" gap="3" mb="3">
          <div>
            {eyebrow ? (
              <Text size="1" weight="bold" color="gray" style={{ letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {eyebrow}
              </Text>
            ) : null}
            <Dialog.Title>{title}</Dialog.Title>
            {description ? (
              <Dialog.Description>{description}</Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
          </div>
          {headerAside}
        </Flex>
        {children}
        {footer ? (
          <Flex justify="end" gap="2" mt="4">
            {footer}
          </Flex>
        ) : null}
      </Dialog.Content>
    </Dialog.Root>
    </InTheme>
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
    <InTheme>
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content maxWidth="24rem">
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <AlertDialog.Description>{description}</AlertDialog.Description>
        <Flex justify="end" gap="2" mt="4">
          <AlertDialog.Cancel>
            <Button type="button" disabled={pending}>
              {cancelLabel}
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button type="button" variant="solid" color="red" disabled={pending} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
    </InTheme>
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
    <InTheme>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Content side={side} align={align} sideOffset={6}>
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    </InTheme>
  );
}

export function MenuItem({ onSelect, children }: { onSelect?: () => void; children: ReactNode }) {
  return (
    <InTheme>
    <DropdownMenu.Item
      onSelect={() => {
        onSelect?.();
      }}
    >
      {children}
    </DropdownMenu.Item>
    </InTheme>
  );
}
