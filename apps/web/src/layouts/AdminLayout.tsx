import { NavLink, Outlet, useMatch, useNavigate } from "react-router-dom";
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
  Moon,
  PhoneCall,
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
  { to: "/", icon: LayoutDashboard, key: "dashboard", end: true, tone: "var(--accent)" },
  { to: "/extensions", icon: Users, key: "extensions", tone: "var(--accent-3)" },
  { to: "/ring-groups", icon: PhoneOutgoing, key: "ringGroups", tone: "var(--success)" },
  { to: "/queues", icon: Headphones, key: "queues", tone: "var(--accent-2)" },
  { to: "/schedules", icon: CalendarClock, key: "schedules", tone: "var(--warning)" },
  { to: "/flows", icon: Workflow, key: "flows", tone: "var(--violet-line)" },
  { to: "/trunks", icon: Cable, key: "trunks", tone: "var(--accent)" },
  { to: "/routes", icon: GitBranch, key: "routes", tone: "var(--accent-3)" },
  { to: "/blacklist", icon: Ban, key: "blacklist", tone: "var(--danger)" },
  { to: "/prompts", icon: FileAudio, key: "prompts", tone: "var(--success)" },
  { to: "/moh", icon: Music, key: "moh", tone: "var(--accent-2)" },
  { to: "/devices", icon: Smartphone, key: "devices", tone: "var(--info)" },
  { to: "/recordings", icon: FileAudio, key: "recordings", tone: "var(--violet-line)" },
  { to: "/cdr", icon: ListTree, key: "cdr", tone: "var(--accent)" },
  { to: "/missed", icon: PhoneMissed, key: "missed", tone: "var(--danger)" },
  { to: "/reports", icon: Activity, key: "reports", tone: "var(--warning)" },
  { to: "/integrations", icon: Webhook, key: "integrations", tone: "var(--accent-3)" },
  { to: "/settings", icon: Settings, key: "settings", tone: "var(--text-muted)" },
];

export function AdminLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const setActor = useStore((s) => s.setActor);
  const flowDesigner = useMatch("/flows/:id");

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
      {!flowDesigner && (
        <aside className="aside-panel hidden w-64 shrink-0 p-4 md:flex md:flex-col">
          <AppBrand subtitle={t("app.tagline")} />
          <nav className="flex flex-1 flex-col gap-0.5 overflow-auto">
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
      )}
      <main
        className={`flex-1 ${flowDesigner ? "min-h-0 overflow-hidden p-0" : "overflow-auto p-4 md:p-8"}`}
      >
        {!flowDesigner && (
          <div className="mb-4 flex items-center justify-between gap-2 md:hidden">
            <div className="flex items-center gap-2">
              <PhoneCall size={18} className="text-[var(--accent)]" />
              <AppBrand compact className="" />
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
