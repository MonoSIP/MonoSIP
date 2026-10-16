import { useTranslation } from "react-i18next";
import { APP_VERSION } from "../lib/version";

type Props = {
  subtitle?: React.ReactNode;
  className?: string;
  /** Compact row used in the mobile top bar */
  compact?: boolean;
};

export function AppBrand({ subtitle, className = "mb-6 px-2", compact = false }: Props) {
  const { t } = useTranslation();
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {compact ? (
          <strong>{t("app.name")}</strong>
        ) : (
          <div className="text-xl font-bold tracking-tight">{t("app.name")}</div>
        )}
        <span className="badge tabular-nums" title={`DSip ${APP_VERSION}`}>
          v{APP_VERSION}
        </span>
      </div>
      {subtitle ? (
        <div className="text-sm text-[var(--text-muted)]">{subtitle}</div>
      ) : null}
    </div>
  );
}
