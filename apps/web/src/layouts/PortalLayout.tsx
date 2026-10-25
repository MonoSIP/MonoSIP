import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookUser, ChevronUp, FileAudio, History, Languages, LogOut, Moon, Phone, Settings, Sun, Voicemail } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../store";
import i18n, { toggleAppLocale } from "../i18n";
import { usePortalLive } from "../hooks/usePortalLive";
import { AmbientBackground } from "../components/AmbientBackground";
import { AppBrand, ProductSiteLink, ProductVersion, signOut } from "../components/AppBrand";
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
  const { status, callPhase } = usePhone();
  const registered = status === "registered";
  usePortalLive();
  // Desktop keeps the mini phone directly under Settings.
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

  return (
    // One softphone for the whole portal: switching pages keeps the call up.
    <div className={`portal-shell${callPhase === "ringing" ? " is-incoming" : ""}`}>
      <AmbientBackground />
      <aside className="aside-panel portal-rail hidden w-56 shrink-0 flex-col overflow-hidden p-4 md:flex">
        <AppBrand lockup className="mb-4 shrink-0 px-1" />
        <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
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
        {!onPhonePage && (
          <div className="portal-softphone">
            <MiniPhone />
          </div>
        )}
        <div className="mt-auto shrink-0">
          <UserCard
            name={actor?.type === "extension" ? actor.name : ""}
            number={actor?.type === "extension" ? actor.number : ""}
          />
        </div>
        <div className="shell-site admin-site-row">
          <ProductSiteLink />
          <ProductVersion />
        </div>
      </aside>
      <div className="portal-stage flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="portal-main min-w-0 flex-1 p-4 pb-28 md:p-8">
          {/* Remount pages on a language switch so tr() copy re-renders */}
          <PageVeil>
            <Outlet key={i18n.language} />
          </PageVeil>
        </main>
      </div>
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

function UserCard({ name, number }: { name: string; number: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const setActor = useStore((s) => s.setActor);
  const label = name || number || "—";
  const initial = label.slice(0, 1).toUpperCase();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const locale = (i18n.language || "en").slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="portal-user" ref={root}>
      <div className="portal-user-pop">
      {open ? (
        <div className="portal-user-menu" id="portal-user-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => choose(toggleTheme)}>
            <span className="icon-swap" aria-hidden>
              <Sun size={16} strokeWidth={2.25} className={theme === "dark" ? "is-on" : undefined} />
              <Moon size={16} strokeWidth={2.25} className={theme === "light" ? "is-on" : undefined} />
            </span>
            {t("portal.darkMode")}
          </button>
          <button type="button" role="menuitem" onClick={() => choose(() => toggleAppLocale())}>
            <Languages size={16} strokeWidth={2.25} aria-hidden />
            {t("common.language")}
            <span className="portal-user-meta">{locale}</span>
          </button>
          <span className="portal-user-sep" role="separator" />
          <button type="button" role="menuitem" onClick={() => choose(() => void signOut(navigate, setActor))}>
            <LogOut size={16} strokeWidth={2.25} aria-hidden />
            {t("common.logout")}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="portal-user-card"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="portal-user-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="portal-user-mark" aria-hidden="true">{initial}</span>
        <span className="min-w-0 flex-1">
          <span className="portal-user-name">{label}</span>
          {name && number ? <span className="portal-user-ext">{number}</span> : null}
        </span>
        <ChevronUp size={16} strokeWidth={2.25} aria-hidden />
      </button>
      </div>
    </div>
  );
}

function RegDot({ on, label }: { on: boolean; label: string }) {
  return <span className={`nav-reg ${on ? "is-on" : "is-off"}`} title={label} aria-hidden="true" />;
}
