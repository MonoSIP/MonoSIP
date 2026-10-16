import { NavLink, Outlet, useMatch, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
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

const links = [
  { to: "/", icon: LayoutDashboard, key: "dashboard", end: true },
  { to: "/extensions", icon: Users, key: "extensions" },
  { to: "/ring-groups", icon: PhoneOutgoing, key: "ringGroups" },
  { to: "/queues", icon: Headphones, key: "queues" },
  { to: "/schedules", icon: CalendarClock, key: "schedules" },
  { to: "/flows", icon: Workflow, key: "flows" },
  { to: "/trunks", icon: Cable, key: "trunks" },
  { to: "/routes", icon: GitBranch, key: "routes" },
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
      <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] bg-[color-mix(in_oklab,var(--bg-elevated)_80%,transparent)] p-4 md:flex md:flex-col">
        <AppBrand subtitle={t("app.tagline")} />
        <nav className="flex flex-1 flex-col gap-1 overflow-auto">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              <l.icon size={18} />
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
          <button className="btn" type="button" onClick={() => void logout()} title={t("auth.logout", { defaultValue: "Logout" })}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main
        className={`flex-1 ${flowDesigner ? "overflow-hidden p-0" : "overflow-auto p-4 md:p-8"}`}
      >
        {!flowDesigner && (
          <div className="mb-4 flex items-center justify-between gap-2 md:hidden">
            <div className="flex items-center gap-2">
              <PhoneCall size={18} className="text-[var(--accent)]" />
              <AppBrand compact className="" />
            </div>
            <button className="btn" type="button" onClick={() => void logout()} title={t("auth.logout", { defaultValue: "Logout" })}>
              <LogOut size={16} />
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
