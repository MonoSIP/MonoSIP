"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";
import { usePreferences } from "./preferences";
import { site } from "@/lib/site";

export function Header() {
  const [menu, setMenu] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const { theme, motion, reduced, setTheme, toggleMotion } = usePreferences();
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
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
        <Link href="/" className="brand" aria-label="MünaSIP. home">
          <Image
            src="/brand/munasip-mark.svg"
            width={34}
            height={34}
            alt=""
            priority
          />
          <span>
            Müna<span className="brand-sip">SIP</span>
            <span className="brand-period">.</span>
          </span>
        </Link>
        <nav
          ref={nav}
          id="main-navigation"
          aria-label="Main navigation"
          className={`main-nav ${menu ? "is-open" : ""}`}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setMenu(false);
          }}
        >
          <Link href="/#features">Features</Link>
          <Link href="/updates/">What’s new</Link>
          <Link href="/docs/">Documentation</Link>
          <Link href="/download/">Download</Link>
        </nav>
        <div className="header-actions">
          <div className="appearance-wrap">
            <button
              ref={trigger}
              className="theme-trigger"
              type="button"
              aria-label={`Choose color theme: ${theme}`}
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
              <span className="theme-label">{theme}</span>
              <Icon name="chevron" className="tiny" />
            </button>
            {appearance && (
              <div
                className="appearance-panel"
                id="appearance-panel"
                ref={popup}
                role="region"
                aria-label="Appearance"
              >
                <strong>Appearance</strong>
                <p>Your desk. Your atmosphere.</p>
                <fieldset>
                  <legend className="sr-only">Color theme</legend>
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
                        <span>{option[0].toUpperCase() + option.slice(1)}</span>
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
                    ? "In sync with your system."
                    : theme === "dark"
                      ? "A little easier on the eyes."
                      : "A fresh perspective."}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="icon-button motion-toggle"
            aria-label={
              motion ? "Disable mouse effects" : "Enable mouse effects"
            }
            aria-pressed={motion}
            title={
              reduced
                ? "Your system prefers reduced motion. Mouse effects stay paused."
                : motion
                  ? "Mouse effects on — click to disable"
                  : "Mouse effects off — click to enable"
            }
            onClick={toggleMotion}
          >
            <Icon name="mouse" />
            <span className={`motion-indicator ${motion ? "on" : ""}`} />
          </button>
          <span className="header-divider" />
          <a
            className="github-link"
            href={site.repo}
            aria-label="MunaSIP on GitHub"
          >
            <Icon name="github" />
            <span>GitHub</span>
            <Icon name="external" className="tiny" />
          </a>
          <button
            ref={mobileTrigger}
            type="button"
            className="icon-button mobile-toggle"
            aria-label={menu ? "Close navigation" : "Open navigation"}
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
