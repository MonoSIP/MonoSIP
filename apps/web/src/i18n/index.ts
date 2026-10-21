import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import trJson from "./tr.json";
import uiTr from "./ui.tr.json";

const saved = localStorage.getItem("dsip_locale") ?? "en";

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

/**
 * Translate UI copy written in English: `tr("Saved")` → "Kaydedildi" in Turkish,
 * the text itself in English (or when no translation exists yet). Keys are the
 * English strings, so dots/colons inside them are not separators.
 * Layouts remount page content on a language change, so plain calls stay current.
 */
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
