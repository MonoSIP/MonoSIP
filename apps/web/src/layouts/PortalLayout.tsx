import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookUser, LogOut, Phone, Settings, History, FileAudio } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../store";
import i18n from "../i18n";
import { usePortalLive } from "../hooks/usePortalLive";
import { AppBrand } from "../components/AppBrand";
import { PageVeil } from "../components/PageVeil";
import { MiniPhone } from "../components/MiniPhone";
import { PhoneProvider } from "../lib/phone-context";

const links = [
  { to: "/", icon: Phone, key: "phone", end: true },
  { to: "/directory", icon: BookUser, key: "directory" },
  { to: "/calls", icon: History, key: "myCalls" },
  { to: "/recordings", icon: FileAudio, key: "myRecordings" },
  { to: "/settings", icon: Settings, key: "mySettings" },
];

export function PortalLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const actor = useStore((s) => s.actor);
  const setActor = useStore((s) => s.setActor);
  usePortalLive();
  // The phone page shows the full phone; every other page gets the mini one.
  const onPhonePage = useLocation().pathname === "/";

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
    // One softphone for the whole portal: switching pages keeps the call up.
    <PhoneProvider>
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="aside-panel hidden w-56 shrink-0 flex-col p-4 md:sticky md:top-0 md:flex md:h-screen">
        <AppBrand
          subtitle={actor?.type === "extension" ? `${actor.number} · ${actor.name}` : ""}
        />
        <nav className="flex flex-col gap-0.5">
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
        <div className="mt-6 flex gap-2">
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
        {!onPhonePage && <MiniPhone className="mt-auto" />}
      </aside>
      <main className={`min-w-0 flex-1 p-4 md:p-8 md:pb-8 ${onPhonePage ? "pb-24" : "pb-40"}`}>
        {/* Remount pages on a language switch so tr() copy re-renders */}
        <PageVeil>
          <Outlet key={i18n.language} />
        </PageVeil>
      </main>
      {!onPhonePage && <MiniPhone className="mini-phone--bar md:hidden" />}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-[var(--border)] bg-[var(--card)] p-2 md:hidden">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `flex min-h-11 min-w-0 flex-col items-center gap-1 rounded-[var(--radius)] px-2 py-1.5 text-xs ${
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
    </PhoneProvider>
  );
}
