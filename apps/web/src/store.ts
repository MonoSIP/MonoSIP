import { create } from "zustand";

type Actor =
  | { type: "admin"; id: string; email: string }
  | { type: "extension"; id: string; number: string; name: string }
  | null;

type Store = {
  actor: Actor;
  theme: "dark" | "light";
  setActor: (a: Actor) => void;
  setTheme: (t: "dark" | "light") => void;
  toggleTheme: () => void;
};

// Storage can be blocked (private mode, lockdown profiles) and every access
// can throw. store.ts is imported by main.tsx before anything renders, so an
// unguarded read would white-screen the whole app — degrade to the default
// theme instead (same contract as legacy-storage.ts).
function readSavedTheme(): "dark" | "light" {
  try {
    return (localStorage.getItem("monosip_theme") as "dark" | "light") || "dark";
  } catch {
    return "dark";
  }
}

const savedTheme = readSavedTheme();
if (typeof document !== "undefined") {
  document.documentElement.classList.toggle("light", savedTheme === "light");
}

export const useStore = create<Store>((set, get) => ({
  actor: null,
  theme: savedTheme,
  setActor: (actor) => set({ actor }),
  setTheme: (theme) => {
    try {
      localStorage.setItem("monosip_theme", theme);
    } catch {
      /* storage blocked — keep the theme for this session only */
    }
    document.documentElement.classList.toggle("light", theme === "light");
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
}));
