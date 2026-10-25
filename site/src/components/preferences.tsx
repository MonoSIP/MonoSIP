"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
let transientTheme: Theme | undefined;
let transientMotion: boolean | undefined;

function storage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function snapshot() {
  const saved = transientTheme ?? storage("monosip-theme");
  const theme = saved === "dark" || saved === "light" ? saved : "system";
  const motion = transientMotion ?? storage("monosip-motion") !== "off";
  return `${theme}|${motion}|${matchMedia("(prefers-reduced-motion: reduce)").matches}|${document.hidden}|${matchMedia("(prefers-color-scheme: dark)").matches}`;
}
function apply() {
  const [theme, motion, reduced, hidden, dark] = snapshot().split("|");
  document.documentElement.dataset.theme =
    theme === "system" ? (dark === "true" ? "dark" : "light") : theme;
  document.documentElement.dataset.motion =
    reduced === "false" && hidden === "false" ? "on" : "off";
  document.documentElement.dataset.pointerEffects =
    motion === "true" && reduced === "false" && hidden === "false"
      ? "on"
      : "off";
}
function subscribe(callback: () => void) {
  const color = matchMedia("(prefers-color-scheme: dark)");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const update = () => {
    apply();
    callback();
  };
  const sync = () => {
    transientTheme = undefined;
    transientMotion = undefined;
    update();
  };
  color.addEventListener("change", update);
  motion.addEventListener("change", update);
  document.addEventListener("visibilitychange", update);
  window.addEventListener("monosip-preferences", update);
  window.addEventListener("storage", sync);
  apply();
  return () => {
    color.removeEventListener("change", update);
    motion.removeEventListener("change", update);
    document.removeEventListener("visibilitychange", update);
    window.removeEventListener("monosip-preferences", update);
    window.removeEventListener("storage", sync);
  };
}
const Preferences = createContext({
  theme: "system" as Theme,
  motion: true,
  active: false,
  reduced: false,
  setTheme: (_: Theme) => {},
  toggleMotion: () => {},
});

export function PreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useSyncExternalStore(
    subscribe,
    snapshot,
    () => "system|true|false|false|false",
  );
  const [theme, motion, reduced, hidden] = value.split("|");
  function setTheme(next: Theme) {
    transientTheme = next;
    try {
      localStorage.setItem("monosip-theme", next);
    } catch {
      /* Session preference still works. */
    }
    window.dispatchEvent(new Event("monosip-preferences"));
  }
  function toggleMotion() {
    transientMotion = motion !== "true";
    try {
      localStorage.setItem("monosip-motion", transientMotion ? "on" : "off");
    } catch {
      /* Session preference still works. */
    }
    window.dispatchEvent(new Event("monosip-preferences"));
  }
  return (
    <Preferences.Provider
      value={{
        theme: theme as Theme,
        motion: motion === "true",
        active: motion === "true" && reduced === "false" && hidden === "false",
        reduced: reduced === "true",
        setTheme,
        toggleMotion,
      }}
    >
      {children}
    </Preferences.Provider>
  );
}

export const usePreferences = () => useContext(Preferences);
