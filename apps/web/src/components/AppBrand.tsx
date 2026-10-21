import { useTranslation } from "react-i18next";
import { APP_VERSION } from "../lib/version";

type Props = {
  subtitle?: React.ReactNode;
  className?: string;
  /** Compact row used in the mobile top bar */
  compact?: boolean;
  /** Use an h1 for the product name (login / landing only) */
  asHeading?: boolean;
};

export function AppBrand({
  subtitle,
  className = "mb-6 px-1",
  compact = false,
  asHeading = false,
}: Props) {
  const { t } = useTranslation();
  const TitleTag = asHeading ? "h1" : compact ? "strong" : "div";
  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <img className="brand-mark" src="/munasip-mark.svg" width={36} height={36} alt="" aria-hidden />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TitleTag
              className={
                compact
                  ? "tracking-tight"
                  : "m-0 text-xl font-extrabold tracking-tight"
              }
            >
              {t("app.name")}
            </TitleTag>
            <span className="brand-ver" title={`MünaSIP ${APP_VERSION}`}>
              v{APP_VERSION}
            </span>
          </div>
          {subtitle ? (
            <div className="truncate text-sm text-[var(--text-muted)]">{subtitle}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
