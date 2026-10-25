"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./icon";
import { usePreferences } from "./preferences";
import { chrome, localeFromPath, pathFor, themeName } from "@/lib/locale";
import { brandFile, site } from "@/lib/site";

export function Header() {
  const [menu, setMenu] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const { theme, motion, reduced, setTheme, toggleMotion } = usePreferences();
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const pathname = usePathname() || "/";
  const locale = localeFromPath(pathname);
  const t = chrome[locale];
  const href = (path: string) => pathFor(locale, path);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (!appearance) return;
    popup.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    const close = (event: PointerEvent) => {
      if (
        !popup.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setAppearance(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAppearance(false);
        trigger.current?.focus();
      }
      if (event.key === "Tab") {
        const items =
          popup.current?.querySelectorAll<HTMLInputElement>("input");
        if (!items) return;
        // Native radio arrows select within the group; Tab closes the non-modal popover.
        setAppearance(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [appearance]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(false);
        mobileTrigger.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        !nav.current?.contains(event.target as Node) &&
        !mobileTrigger.current?.contains(event.target as Node)
      )
        setMenu(false);
    };
    const media = matchMedia("(min-width: 1100px)");
    const resize = () => {
      if (media.matches) setMenu(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    media.addEventListener("change", resize);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
      media.removeEventListener("change", resize);
    };
  }, [menu]);
  return (
    <header className="site-header" id="top">
      <div className="container header-inner">
        <Link href={href("/")} className="brand" aria-label={t.home}>
          <Image
            className="brand-lockup for-light"
            src={brandFile("monosip-lockup.svg")}
            width={216}
            height={32}
            alt=""
            priority
          />
          <Image
            className="brand-lockup for-dark"
            src={brandFile("monosip-lockup-on-dark.svg")}
            width={216}
            height={32}
            alt=""
            priority
          />
        </Link>
        <nav
          ref={nav}
          id="main-navigation"
          aria-label={t.nav}
          className={`main-nav ${menu ? "is-open" : ""}`}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setMenu(false);
          }}
        >
          <Link href={href("/#features")}>{t.features}</Link>
          <Link href={href("/updates/")}>{t.updates}</Link>
          <Link href={href("/docs/")}>{t.docs}</Link>
          <Link href={href("/download/")}>{t.download}</Link>
        </nav>
        <div className="header-actions">
          <div className="appearance-wrap">
            <button
              ref={trigger}
              className="theme-trigger"
              type="button"
              aria-label={t.theme(theme)}
              aria-expanded={appearance}
              aria-controls="appearance-panel"
              onClick={() => {
                setAppearance(!appearance);
                setMenu(false);
              }}
            >
              <Icon
                name={
                  theme === "system"
                    ? "monitor"
                    : theme === "dark"
                      ? "moon"
                      : "sun"
                }
              />
              <span className="theme-label">
                {locale === "tr" ? themeName(locale, theme) : theme}
              </span>
              <Icon name="chevron" className="tiny" />
            </button>
            {appearance && (
              <div
                className="appearance-panel"
                id="appearance-panel"
                ref={popup}
                role="region"
                aria-label={t.appearance}
              >
                <strong>{t.appearance}</strong>
                <p>{t.appearanceLead}</p>
                <fieldset>
                  <legend className="sr-only">{t.colorTheme}</legend>
                  <div className="theme-options">
                    {(["light", "dark", "system"] as const).map((option) => (
                      <label
                        className={`theme-option ${theme === option ? "selected" : ""}`}
                        key={option}
                      >
                        <input
                          type="radio"
                          name="color-theme"
                          value={option}
                          checked={theme === option}
                          onChange={() => setTheme(option)}
                        />
                        <span className={`theme-preview ${option}`}>
                          <span />
                          <span />
                          <span />
                          <Icon
                            name={
                              option === "light"
                                ? "sun"
                                : option === "dark"
                                  ? "moon"
                                  : "monitor"
                            }
                          />
                          {theme === option && (
                            <b>
                              <Icon name="check" />
                            </b>
                          )}
                        </span>
                        <span>{themeName(locale, option)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="theme-note">
                  <Icon
                    name={
                      theme === "system"
                        ? "monitor"
                        : theme === "dark"
                          ? "moon"
                          : "sun"
                    }
                  />
                  {theme === "system"
                    ? t.themeSystem
                    : theme === "dark"
                      ? t.themeDark
                      : t.themeLight}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="icon-button motion-toggle"
            aria-label={motion ? t.motionOff : t.motionOn}
            aria-pressed={motion}
            title={
              reduced
                ? t.motionReduced
                : motion
                  ? t.motionTitleOn
                  : t.motionTitleOff
            }
            onClick={toggleMotion}
          >
            <Icon name="mouse" />
            <span className={`motion-indicator ${motion ? "on" : ""}`} />
          </button>
          <nav className="lang-switch" aria-label={t.language}>
            <Link
              href={pathFor("en", pathname)}
              hrefLang="en"
              lang="en"
              aria-current={locale === "en" ? "page" : undefined}
            >
              EN
            </Link>
            <Link
              href={pathFor("tr", pathname)}
              hrefLang="tr"
              lang="tr"
              aria-current={locale === "tr" ? "page" : undefined}
            >
              TR
            </Link>
          </nav>
          <span className="header-divider" />
          <a className="github-link" href={site.repo} aria-label={t.github}>
            <Icon name="github" />
            <span>GitHub</span>
            <Icon name="external" className="tiny" />
          </a>
          <button
            ref={mobileTrigger}
            type="button"
            className="icon-button mobile-toggle"
            aria-label={menu ? t.menuClose : t.menuOpen}
            aria-controls="main-navigation"
            aria-expanded={menu}
            onClick={() => {
              setMenu(!menu);
              setAppearance(false);
            }}
          >
            <Icon name={menu ? "close" : "menu"} />
          </button>
        </div>
      </div>
    </header>
  );
}
