import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookUser, ChevronDown, FileAudio, History, Languages, LogOut, Moon, Phone, Settings, Sun, Voicemail } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../store";
import i18n from "../i18n";
import { usePortalLive } from "../hooks/usePortalLive";
import { AppBrand } from "../components/AppBrand";
import { PageVeil } from "../components/PageVeil";
import { MiniPhone } from "../components/MiniPhone";
import { PhoneProvider, usePhone } from "../lib/phone-context";

const links = [
  { to: "/", icon: Phone, key: "phone", end: true },
  { to: "/directory", icon: BookUser, key: "directory" },
  { to: "/calls", icon: History, key: "myCalls" },
  { to: "/recordings", icon: FileAudio, key: "myRecordings" },
  { to: "/voicemail", icon: Voicemail, key: "voicemail" },
  { to: "/settings", icon: Settings, key: "mySettings" },
];

export function PortalLayout() {
  return (
    <PhoneProvider>
      <PortalChrome />
    </PhoneProvider>
  );
}

function PortalChrome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const actor = useStore((s) => s.actor);
  const setActor = useStore((s) => s.setActor);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const { status, callPhase } = usePhone();
  const registered = status === "registered";
  usePortalLive();
  // Desktop keeps the mini phone at the bottom of the rail, under the menu.
  // On a phone the full screen is the only phone: an incoming call opens it,
  // and the ringtone already playing in the softphone is the sound.
  const { pathname } = useLocation();
  const onPhonePage = pathname === "/";
  useEffect(() => {
    if (callPhase !== "ringing" || pathname === "/") return;
    navigate("/", { replace: true });
  }, [callPhase, pathname, navigate]);
  const mailbox = useQuery({
    queryKey: ["voicemails"],
    queryFn: async () =>
      (await api.get<Array<{ read: boolean }>>("/api/v1/me/voicemails")) ?? [],
  });
  const missed = useQuery({
    queryKey: ["my-missed"],
    queryFn: async () =>
      (await api.get<Array<{ status: string; seen?: boolean }>>("/api/v1/me/missed-calls")) ?? [],
  });
  const unreadVm = (mailbox.data ?? []).filter((row) => !row.read).length;
  const missedN = (missed.data ?? []).filter((row) => row.status === "pending" && !row.seen).length;

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
    <div className={`portal-shell${callPhase === "ringing" ? " is-incoming" : ""}`}>
      <aside className="aside-panel portal-rail hidden w-56 shrink-0 flex-col overflow-hidden p-4 md:flex">
        <AppBrand className="mb-4 shrink-0 px-1" />
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
                {l.key === "phone" ? <RegDot on={registered} label={t(registered ? "portal.registered" : "portal.unregistered")} /> : null}
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
        {!onPhonePage && <MiniPhone className="mt-3 shrink-0" />}
        <UserCard
          name={actor?.type === "extension" ? actor.name : ""}
          number={actor?.type === "extension" ? actor.number : ""}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogout={() => void logout()}
        />
      </aside>
      <main className="portal-main min-w-0 flex-1 p-4 pb-24 md:p-8">
        {/* Remount pages on a language switch so tr() copy re-renders */}
        <PageVeil>
          <Outlet key={i18n.language} />
        </PageVeil>
      </main>
      <nav className="portal-tabs md:hidden">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            aria-label={t(`nav.${l.key}`)}
            title={t(`nav.${l.key}`)}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span className="nav-tab-ico">
              <l.icon size={26} strokeWidth={2.25} />
              {l.key === "phone" ? <RegDot on={registered} label={t(registered ? "portal.registered" : "portal.unregistered")} /> : null}
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
  );
}

function UserCard({
  name,
  number,
  theme,
  onToggleTheme,
  onLogout,
}: {
  name: string;
  number: string;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const label = name || number || "—";
  const initial = label.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleLanguage() {
    const next = i18n.language === "en" ? "tr" : "en";
    localStorage.setItem("munasip_locale", next);
    void i18n.changeLanguage(next);
    setOpen(false);
  }

  return (
    <div className="portal-user" ref={root}>
      <button
        type="button"
        className="portal-user-card"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="portal-user-mark" aria-hidden="true">{initial}</span>
        <span className="min-w-0 flex-1">
          <span className="portal-user-name">{label}</span>
          {name && number ? <span className="portal-user-ext">{number}</span> : null}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="portal-user-menu" role="menu">
          <button type="button" role="menuitem" title={t("common.language")} onClick={toggleLanguage}>
            <Languages size={16} />
            <span className="flex-1">{t("common.language")}</span>
            <span className="portal-user-meta">{i18n.language.slice(0, 2).toUpperCase()}</span>
          </button>
          <button type="button" role="menuitem" title={t("common.theme")} onClick={onToggleTheme}>
            {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
            <span className="flex-1">{t("portal.darkMode")}</span>
          </button>
          <button type="button" role="menuitem" title={t("common.logout")} onClick={onLogout}>
            <LogOut size={16} />
            <span className="flex-1">{t("common.logout")}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RegDot({ on, label }: { on: boolean; label: string }) {
  return <span className={`nav-reg ${on ? "is-on" : "is-off"}`} title={label} aria-hidden="true" />;
}
