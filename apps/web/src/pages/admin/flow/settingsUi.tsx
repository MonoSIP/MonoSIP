import { Card, Flex, Heading, Text, Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";
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
    <Theme>
    <Card size="1">
      <Flex direction="column" gap="3">
        <header>
          <Flex align="center" gap="2">
            {step != null && (
              <Text size="1" weight="bold">
                {step}
              </Text>
            )}
            <Heading as="h3" size="2">
              {title}
            </Heading>
          </Flex>
          {hint ? (
            <Text as="p" size="1" color="gray" mt="1">
              {hint}
            </Text>
          ) : null}
        </header>
        <Flex direction="column" gap="3">
          {children}
        </Flex>
      </Flex>
    </Card>
    </Theme>
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
    <Theme>
    <Text as="label" size="2" className={className}>
      <Text weight="medium">{label}</Text>
      {hint ? (
        <Text as="p" size="1" color="gray" mt="1">
          {hint}
        </Text>
      ) : null}
      <div className="mt-1">{children}</div>
    </Text>
    </Theme>
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
