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

const savedTheme = (localStorage.getItem("dsip_theme") as "dark" | "light") || "dark";
if (typeof document !== "undefined") {
  document.documentElement.classList.toggle("light", savedTheme === "light");
}

export const useStore = create<Store>((set, get) => ({
  actor: null,
  theme: savedTheme,
  setActor: (actor) => set({ actor }),
  setTheme: (theme) => {
    localStorage.setItem("dsip_theme", theme);
    document.documentElement.classList.toggle("light", theme === "light");
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
}));
