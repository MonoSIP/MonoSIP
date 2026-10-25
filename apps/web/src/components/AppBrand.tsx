import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Languages, LogOut, Moon, Sun } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { toggleAppLocale } from "../i18n";
import { APP_VERSION } from "../lib/version";
import { Button } from "./ui";

type Props = {
  subtitle?: React.ReactNode;
  className?: string;
  /** Compact row used in the mobile top bar */
  compact?: boolean;
  /** Use an h1 for the product name (login / landing only) */
  asHeading?: boolean;
};

export function ProductSiteLink({ className = "" }: { className?: string }) {
  return (
    <a className={className ? `product-site ${className}` : "product-site"} href="https://www.monosip.com">
      www.monosip.com
    </a>
  );
}

/** Theme, language, and sign-out. Stays at the top right of admin and portal. */
export function ShellTools() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const setActor = useStore((s) => s.setActor);

  async function logout() {
    try {
      await api.post("/api/v1/auth/logout");
    } catch {
      /* still clear local session */
    }
    setActor(null);
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell-tool-group">
      <Button type="button" aria-label={t("common.theme")} onClick={toggleTheme}>
        <span className="icon-swap" aria-hidden>
          <Sun size={16} strokeWidth={2.25} className={theme === "dark" ? "is-on" : undefined} />
          <Moon size={16} strokeWidth={2.25} className={theme === "light" ? "is-on" : undefined} />
        </span>
        {t("common.theme")}
      </Button>
      <Button type="button" aria-label={t("common.language")} onClick={() => toggleAppLocale()}>
        <Languages size={16} strokeWidth={2.25} aria-hidden />
        {(i18n.language || "en").slice(0, 2).toUpperCase()}
      </Button>
      <Button type="button" aria-label={t("common.logout")} onClick={() => void logout()}>
        <LogOut size={16} strokeWidth={2.25} />
      </Button>
    </div>
  );
}

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
        <img className="brand-mark" src="/monosip-mark.svg" width={36} height={36} alt="" aria-hidden />
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
            <span className="brand-ver" title={`MonoSIP ${APP_VERSION}`}>
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
