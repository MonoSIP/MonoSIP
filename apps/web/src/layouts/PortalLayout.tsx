import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookUser, FileAudio, History, LogOut, Moon, Phone, Settings, Sun, Voicemail } from "lucide-react";
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
  { to: "/voicemail", icon: Voicemail, key: "voicemail" },
  { to: "/settings", icon: Settings, key: "mySettings" },
];

export function PortalLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const actor = useStore((s) => s.actor);
  const setActor = useStore((s) => s.setActor);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  usePortalLive();
  // The phone page shows the full phone; every other page gets the mini one.
  const onPhonePage = useLocation().pathname === "/";
  const mailbox = useQuery({
    queryKey: ["voicemails"],
    queryFn: async () =>
      (await api.get<Array<{ read: boolean }>>("/api/v1/me/voicemails")) ?? [],
  });
  const missed = useQuery({
    queryKey: ["my-missed"],
    queryFn: async () =>
      (await api.get<Array<{ status: string }>>("/api/v1/me/missed-calls")) ?? [],
  });
  const unreadVm = (mailbox.data ?? []).filter((row) => !row.read).length;
  const missedN = (missed.data ?? []).filter((row) => row.status === "pending").length;

  function menuCount(key: string): number {
    if (key === "voicemail") return unreadVm;
    if (key === "phone") return missedN;
    return 0;
  }

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
      <aside className="aside-panel portal-rail hidden w-56 shrink-0 flex-col overflow-hidden p-4 md:flex">
        <AppBrand
          className="mb-4 shrink-0 px-1"
          subtitle={actor?.type === "extension" ? `${actor.number} · ${actor.name}` : ""}
        />
        {!onPhonePage && <MiniPhone className="mb-4 shrink-0" />}
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
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
              <span className="min-w-0 flex-1 truncate">{t(`nav.${l.key}`)}</span>
              {menuCount(l.key) > 0 ? (
                <span className={`nav-badge ${l.key === "voicemail" ? "is-vm" : "is-missed"}`}>
                  {menuCount(l.key) > 99 ? "99+" : menuCount(l.key)}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="portal-rail-foot">
          <button
            className="btn"
            type="button"
            title={t("common.language")}
            onClick={() => {
              const next = i18n.language === "en" ? "tr" : "en";
              localStorage.setItem("munasip_locale", next);
              void i18n.changeLanguage(next);
            }}
          >
            {i18n.language.slice(0, 2).toUpperCase()}
          </button>
          <button className="btn" type="button" title={t("common.theme")} onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void logout()}
            title={t("common.logout")}
          >
            <LogOut size={16} />
          </button>
        </div>
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
            aria-label={t(`nav.${l.key}`)}
            title={t(`nav.${l.key}`)}
            className={({ isActive }) =>
              `flex h-14 min-w-0 flex-1 items-center justify-center rounded-[var(--radius)] ${
                isActive
                  ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[var(--accent)]"
                  : "text-[var(--text-muted)]"
              }`
            }
          >
            <span className="nav-tab-ico">
              <l.icon size={26} strokeWidth={2.25} />
              {menuCount(l.key) > 0 ? (
                <span className={`nav-badge ${l.key === "voicemail" ? "is-vm" : "is-missed"}`}>
                  {menuCount(l.key) > 99 ? "99+" : menuCount(l.key)}
                </span>
              ) : null}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
    </PhoneProvider>
  );
}
