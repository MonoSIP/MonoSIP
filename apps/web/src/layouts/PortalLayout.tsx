import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookUser, LogOut, Phone, Settings, History, FileAudio } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../store";
import i18n from "../i18n";
import { usePortalLive } from "../hooks/usePortalLive";
import { AppBrand } from "../components/AppBrand";

const links = [
  { to: "/", icon: Phone, key: "phone", end: true, tone: "var(--accent)" },
  { to: "/directory", icon: BookUser, key: "directory", tone: "var(--accent-3)" },
  { to: "/calls", icon: History, key: "myCalls", tone: "var(--warning)" },
  { to: "/recordings", icon: FileAudio, key: "myRecordings", tone: "var(--violet-line)" },
  { to: "/settings", icon: Settings, key: "mySettings", tone: "var(--text-muted)" },
];

export function PortalLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const actor = useStore((s) => s.actor);
  const setActor = useStore((s) => s.setActor);
  usePortalLive();

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
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="aside-panel hidden w-56 shrink-0 p-4 md:block">
        <AppBrand
          subtitle={actor?.type === "extension" ? `${actor.number} · ${actor.name}` : ""}
        />
        <nav className="flex flex-col gap-0.5">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              style={{ ["--tone" as string]: l.tone }}
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              <span className="nav-ico">
                <l.icon size={16} strokeWidth={2.25} />
              </span>
              {t(`nav.${l.key}`)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 flex gap-2">
          <button
            className="btn"
            type="button"
            onClick={() => {
              const next = i18n.language === "en" ? "tr" : "en";
              localStorage.setItem("dsip_locale", next);
              void i18n.changeLanguage(next);
            }}
          >
            {i18n.language.toUpperCase()}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void logout()}
            title={t("auth.logout", { defaultValue: "Logout" })}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
        {/* Remount pages on a language switch so tr() copy re-renders */}
        <Outlet key={i18n.language} />
      </main>
      <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--bg-elevated)_94%,transparent)] p-2 backdrop-blur-md md:hidden">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-xs transition ${
                isActive
                  ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[var(--accent)]"
                  : "text-[var(--text-muted)]"
              }`
            }
          >
            <l.icon size={18} strokeWidth={2.25} />
            {t(`nav.${l.key}`)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
