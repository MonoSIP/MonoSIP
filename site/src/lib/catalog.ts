import type { Locale } from "./locale";
import { docNav, referenceDocs, releaseHighlights } from "./site";

const docNavTr = [
  {
    title: "Başlarken",
    detail: "Kurun, yapılandırın ve ilk aramayı yapın.",
  },
  {
    title: "Mimari",
    detail: "Her aramanın arkasındaki servisleri anlayın.",
  },
  {
    title: "IVR ve konuşma",
    detail: "API’ler ve nöral seslerle çağrı akışı tasarlayın.",
  },
  {
    title: "Yazılımsal telefon ve portal",
    detail: "Her dahiliye tarayıcıda bir yer verin.",
  },
  {
    title: "Sesli mesaj ve yönlendirme",
    detail: "Cevapsız aramaları yönlendirin, mesajlarınızı yönetin.",
  },
  {
    title: "Entegrasyonlar",
    detail: "Telefon sistemini araçlarınıza bağlayın.",
  },
  {
    title: "Güvenlik ve işletim",
    detail: "Erişim, kalıcılık ve kurtarmayı planlayın.",
  },
];

const referenceTr = [
  ["Özellik referansı", "Desteklenen kapsam, dahiliden raporlamaya."],
  ["Kurulum", "İmaj etiketleri, birimler, portlar ve ilk açılış."],
  ["VPS kurulumu", "Sunucu kimliği, ortam ağı ve TLS."],
  ["Akış tasarımcısı", "Düğüm türleri, değişkenler, simülasyon ve sürümleme."],
  ["Metinden sese", "Edge Neural, çevrimdışı Türkçe EMA ve önbellek."],
  ["Çalışan portalı", "Arama, kayıtlar, sesli mesaj ve yönlendirme."],
  ["API referansı", "Kimlik doğrulama, uçlar ve webhook olayları."],
  ["Mimari", "Servisler, sinyal ve depolama sınırları."],
  ["Sunucu güvenliği", "Erişim denetimleri ve işletim yapılandırması."],
  ["Veri modeli", "Santralin arkasındaki kayıtlar ve ilişkiler."],
  ["Test planı", "Projenin belgelenmiş doğrulama senaryoları."],
  ["Ürün akışları", "Yönetim ekranlarına bir referans."],
];

export const highlightsTr = [
  {
    icon: "phone" as const,
    title: "Ürünün adı MonoSIP.",
    text: "Konsol, açık site ve Docker imajı MonoSIP adını paylaşır. ghcr.io/monosip/monosip imajını çekin.",
  },
  {
    icon: "sound" as const,
    title: "Göz önünde kalan bir sesli mesaj kutusu.",
    text: "Dalga biçimleri, kayıtlı karşılamalar ve duyulmamış sayılar sesli mesaj kutusunda durur.",
  },
  {
    icon: "shield" as const,
    title: "Giriş seçimleri sizinle kalır.",
    text: "Giriş ekranında seçilen dil ve koyu mod, yönetici ve portal içinde de aynı seçimdir.",
  },
];

export function navFor(locale: Locale) {
  if (locale === "en") return docNav;
  return docNav.map((item, index) => ({ ...item, ...docNavTr[index] }));
}

export function referencesFor(locale: Locale) {
  return referenceDocs.map((entry, index) =>
    locale === "en"
      ? entry
      : ([entry[0], referenceTr[index][0], referenceTr[index][1]] as [
          string,
          string,
          string,
        ]),
  );
}

export function highlightsFor(locale: Locale) {
  return locale === "tr" ? highlightsTr : releaseHighlights;
}
