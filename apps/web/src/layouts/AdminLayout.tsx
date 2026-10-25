import { NavLink, Outlet, useLocation, useMatch } from "react-router-dom";
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
  Menu,
  PhoneMissed,
  PhoneOutgoing,
  Settings,
  Users,
  Smartphone,
  Webhook,
  Workflow,
} from "lucide-react";
import i18n from "../i18n";
import { AmbientBackground } from "../components/AmbientBackground";
import { AppBrand, ProductSiteLink, ProductVersion, ShellTools } from "../components/AppBrand";
import { PageVeil } from "../components/PageVeil";
import { Button } from "../components/ui";

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

  return (
    <div className={`admin-shell flex h-full min-h-0 ${flowDesigner ? "overflow-hidden" : ""}`}>
      <AmbientBackground />
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
          className={`aside-panel fixed inset-y-0 left-0 z-40 h-full w-64 shrink-0 flex-col overflow-hidden p-4 md:sticky md:top-0 md:z-auto md:h-full md:flex ${navOpen ? "flex" : "hidden"}`}
        >
          <AppBrand lockup className="mb-4 px-1" />
          <nav id="admin-nav" className="flex min-h-0 flex-col gap-0.5 overflow-auto">
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
          <div className="shell-site admin-site-row">
            <ProductSiteLink />
            <ProductVersion />
          </div>
        </aside>
      )}
      <div className="admin-stage flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shell-tools">
          {!flowDesigner && (
            <Button
              type="button"
              className="shell-menu"
              aria-expanded={navOpen}
              aria-controls="admin-nav"
              onClick={() => setNavOpen((open) => !open)}
            >
              <Menu size={16} strokeWidth={2.25} />
              {t("common.menu", { defaultValue: "Menu" })}
            </Button>
          )}
          <ShellTools />
        </div>
        <main
          className={`min-h-0 min-w-0 flex-1 ${flowDesigner ? "overflow-hidden p-0" : "overflow-auto p-4 md:p-8"}`}
        >
          {/* Remount pages on a language switch so tr() copy re-renders */}
          <PageVeil>
            <Outlet key={i18n.language} />
          </PageVeil>
        </main>
      </div>
    </div>
  );
}
