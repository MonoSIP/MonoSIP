export type Locale = "en" | "tr";

export function localeFromPath(path: string): Locale {
  return path === "/tr" || path.startsWith("/tr/") ? "tr" : "en";
}

export function pathFor(locale: Locale, path: string): string {
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const raw = (hashAt >= 0 ? path.slice(0, hashAt) : path) || "/";
  const bare = raw.replace(/^\/tr(?=\/|$)/, "") || "/";
  const normalized =
    bare === "/" ? "/" : bare.endsWith("/") ? bare : `${bare}/`;
  const prefixed =
    locale === "en"
      ? normalized
      : normalized === "/"
        ? "/tr/"
        : `/tr${normalized}`;
  return `${prefixed}${hash}`;
}

const themeNames = {
  en: { light: "Light", dark: "Dark", system: "System" },
  tr: { light: "Açık", dark: "Koyu", system: "Sistem" },
} as const;

export function themeName(locale: Locale, theme: "light" | "dark" | "system") {
  return themeNames[locale][theme];
}

export const chrome = {
  en: {
    home: "MonoSIP. home",
    nav: "Main navigation",
    features: "Features",
    updates: "What’s new",
    docs: "Documentation",
    download: "Download",
    language: "Language",
    theme: (theme: string) => `Choose color theme: ${theme}`,
    appearance: "Appearance",
    appearanceLead: "Your desk. Your atmosphere.",
    colorTheme: "Color theme",
    themeSystem: "In sync with your system.",
    themeDark: "A little easier on the eyes.",
    themeLight: "A fresh perspective.",
    motionOff: "Disable mouse effects",
    motionOn: "Enable mouse effects",
    motionReduced:
      "Your system prefers reduced motion. Mouse effects stay paused.",
    motionTitleOn: "Mouse effects on — click to disable",
    motionTitleOff: "Mouse effects off — click to enable",
    github: "MonoSIP on GitHub",
    menuClose: "Close navigation",
    menuOpen: "Open navigation",
    skip: "Skip to content",
    footerLeadA: "Good conversations.",
    footerLeadB: "Your infrastructure.",
    footerKicker: "OPEN SOURCE. ON YOUR TERMS.",
    product: "Product",
    visualIvr: "Visual IVR",
    softphone: "Browser softphone",
    resources: "Resources",
    install: "Installation",
    architecture: "Architecture",
    security: "Security & operations",
    brand: "Brand assets",
    openSource: "Open source",
    license: "MIT license",
    readme: "Project readme",
    author: "Original author",
    website: "Website source",
    copyright: "© 2026 diggyen. MonoSIP is MIT licensed.",
    built: "Built for your own server.",
    top: "Back to top",
    copy: "Copy",
    copied: "Copied",
    copiedStatus: "Copied to clipboard.",
    copyError:
      "Clipboard unavailable. Code selected; copy it with your keyboard.",
    notFoundEyebrow: "404 / THIS LINE ISN’T CONNECTED",
    notFoundTitleA: "A missed connection.",
    notFoundTitleB: "Let’s try another route.",
    notFoundBody:
      "This page could not be found. Head home or pick up where you left off in the documentation.",
    notFoundHome: "Back to home",
    notFoundDocs: "Documentation",
  },
  tr: {
    home: "MonoSIP. ana sayfa",
    nav: "Ana menü",
    features: "Özellikler",
    updates: "Yenilikler",
    docs: "Belgeler",
    download: "İndir",
    language: "Dil",
    theme: (theme: string) => `Renk temasını seçin: ${theme}`,
    appearance: "Görünüm",
    appearanceLead: "Masanız. Atmosferiniz.",
    colorTheme: "Renk teması",
    themeSystem: "Sisteminizle aynı.",
    themeDark: "Göze biraz daha yumuşak.",
    themeLight: "Ferah bir bakış.",
    motionOff: "Fare etkilerini kapat",
    motionOn: "Fare etkilerini aç",
    motionReduced:
      "Sisteminiz azaltılmış hareketi tercih ediyor. Fare etkileri duruyor.",
    motionTitleOn: "Fare etkileri açık — kapatmak için tıklayın",
    motionTitleOff: "Fare etkileri kapalı — açmak için tıklayın",
    github: "GitHub’da MonoSIP",
    menuClose: "Menüyü kapat",
    menuOpen: "Menüyü aç",
    skip: "İçeriğe geç",
    footerLeadA: "İyi konuşmalar.",
    footerLeadB: "Sizin altyapınız.",
    footerKicker: "AÇIK KAYNAK. SİZİN KURALLARINIZ.",
    product: "Ürün",
    visualIvr: "Görsel IVR",
    softphone: "Tarayıcı telefonu",
    resources: "Kaynaklar",
    install: "Kurulum",
    architecture: "Mimari",
    security: "Güvenlik ve işletim",
    brand: "Marka dosyaları",
    openSource: "Açık kaynak",
    license: "MIT lisansı",
    readme: "Proje açıklaması",
    author: "Asıl yazar",
    website: "Site kaynağı",
    copyright: "© 2026 diggyen. MonoSIP, MIT lisanslıdır.",
    built: "Kendi sunucunuz için.",
    top: "Başa dön",
    copy: "Kopyala",
    copied: "Kopyalandı",
    copiedStatus: "Panoya kopyalandı.",
    copyError: "Pano kullanılamıyor. Kod seçildi; klavyenizle kopyalayın.",
    notFoundEyebrow: "404 / BU HAT BAĞLI DEĞİL",
    notFoundTitleA: "Bir bağlantı kaçtı.",
    notFoundTitleB: "Başka bir yoldan deneyelim.",
    notFoundBody:
      "Bu sayfa bulunamadı. Ana sayfaya dönün ya da belgelerden kaldığınız yerden devam edin.",
    notFoundHome: "Ana sayfaya dön",
    notFoundDocs: "Belgeler",
  },
} as const;
