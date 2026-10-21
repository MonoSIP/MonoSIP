import { NavLink, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Ban,
  Cable,
  CalendarClock,
  FileAudio,
  GitBranch,
  Headphones,
  Music,
  LayoutDashboard,
  ListTree,
  LogOut,
  Menu,
  Moon,
  PhoneMissed,
  PhoneOutgoing,
  Settings,
  Sun,
  Users,
  Smartphone,
  Webhook,
  Workflow,
} from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../store";
import i18n from "../i18n";
import { AppBrand } from "../components/AppBrand";
import { PageVeil } from "../components/PageVeil";

const links = [
  { to: "/", icon: LayoutDashboard, key: "dashboard", end: true },
  { to: "/extensions", icon: Users, key: "extensions" },
  { to: "/ring-groups", icon: PhoneOutgoing, key: "ringGroups" },
  { to: "/queues", icon: Headphones, key: "queues" },
  { to: "/schedules", icon: CalendarClock, key: "schedules" },
  { to: "/flows", icon: Workflow, key: "flows" },
  { to: "/trunks", icon: Cable, key: "trunks" },
  { to: "/routes", icon: GitBranch, key: "routes" },
  { to: "/blacklist", icon: Ban, key: "blacklist" },
  { to: "/prompts", icon: FileAudio, key: "prompts" },
  { to: "/moh", icon: Music, key: "moh" },
  { to: "/devices", icon: Smartphone, key: "devices" },
  { to: "/recordings", icon: FileAudio, key: "recordings" },
  { to: "/cdr", icon: ListTree, key: "cdr" },
  { to: "/missed", icon: PhoneMissed, key: "missed" },
  { to: "/reports", icon: Activity, key: "reports" },
  { to: "/integrations", icon: Webhook, key: "integrations" },
  { to: "/settings", icon: Settings, key: "settings" },
];

export function AdminLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const setActor = useStore((s) => s.setActor);
  const flowDesigner = useMatch("/flows/:id");
  const [navOpen, setNavOpen] = useState(false);
  const path = useLocation().pathname;

  useEffect(() => {
    setNavOpen(false);
  }, [path]);

  useEffect(() => {
    if (!navOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

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
    <div className={`flex ${flowDesigner ? "h-full overflow-hidden" : "min-h-full"}`}>
      {/* Hide admin nav in flow designer — fixed-height layout was forcing a sidebar scrollbar */}
      {!flowDesigner && navOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          aria-label={t("common.close", { defaultValue: "Close" })}
          onClick={() => setNavOpen(false)}
        />
      )}
      {!flowDesigner && (
        <aside
          className={`aside-panel fixed inset-y-0 left-0 z-40 h-full w-64 shrink-0 flex-col overflow-hidden p-4 md:sticky md:top-0 md:z-auto md:h-screen md:flex ${navOpen ? "flex" : "hidden"}`}
        >
          <AppBrand subtitle={t("app.tagline")} />
          <nav id="admin-nav" className="flex flex-1 flex-col gap-0.5 overflow-auto">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              >
                <span className="nav-ico">
                  <l.icon size={16} strokeWidth={2.25} />
                </span>
                {t(`nav.${l.key}`)}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 flex gap-2">
            <button className="btn flex-1" onClick={toggleTheme} type="button">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              {t("common.theme")}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                const next = i18n.language === "en" ? "tr" : "en";
                localStorage.setItem("munasip_locale", next);
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
      )}
      <main
        className={`min-w-0 flex-1 ${flowDesigner ? "min-h-0 overflow-hidden p-0" : "overflow-auto p-4 md:p-8"}`}
      >
        {!flowDesigner && (
          <div className="mb-4 flex items-center justify-between gap-2 md:hidden">
            <div className="flex items-center gap-2">
              <button
                className="btn"
                type="button"
                aria-expanded={navOpen}
                aria-controls="admin-nav"
                onClick={() => setNavOpen((open) => !open)}
              >
                <Menu size={16} />
                {t("common.menu", { defaultValue: "Menu" })}
              </button>
            </div>
            <button
              className="btn"
              type="button"
              onClick={() => void logout()}
              title={t("auth.logout", { defaultValue: "Logout" })}
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
        {/* Remount pages on a language switch so tr() copy re-renders */}
        <PageVeil>
          <Outlet key={i18n.language} />
        </PageVeil>
      </main>
    </div>
  );
}
