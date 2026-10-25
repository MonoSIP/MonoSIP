import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import trJson from "./tr.json";
import uiTr from "./ui.tr.json";

function readSavedLocale(): "en" | "tr" {
  try {
    return localStorage.getItem("monosip_locale") === "tr" ? "tr" : "en";
  } catch {
    return "en";
  }
}

const saved = readSavedLocale();

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en, ui: {} },
    // "ui": UI copy keyed by its English text (see `tr` below)
    tr: { translation: trJson, ui: uiTr },
  },
  lng: saved,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// <html lang> drives CSS text-transform: Turkish uppercases i → İ only with lang="tr".
document.documentElement.lang = i18n.language || saved;
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

/** Login, admin and the portal write the same key, so a choice on one screen stays on the others. */
export function setAppLocale(next: "en" | "tr") {
  try {
    localStorage.setItem("monosip_locale", next);
  } catch {
    /* storage blocked — keep the language for this session only */
  }
  void i18n.changeLanguage(next);
}

export function toggleAppLocale() {
  setAppLocale((i18n.language || "en").startsWith("tr") ? "en" : "tr");
}

export function tr(text: string, vars?: Record<string, string | number>): string {
  // Without vars, show copy verbatim: help texts teach the literal {{var}} syntax.
  return i18n.t(text, {
    ns: "ui",
    keySeparator: false,
    nsSeparator: false,
    defaultValue: text,
    ...(vars ?? { skipInterpolation: true }),
  });
}

export default i18n;
