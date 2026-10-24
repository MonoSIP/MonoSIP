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
    icon: "sound" as const,
    title: "Her dahili için bir sesli mesaj kutusu.",
    text: "Kim aradığını görün, mesajı dinleyin, okundu işaretleyin ve çalışan portalından silin.",
  },
  {
    icon: "phone" as const,
    title: "Operatörünüzün beklediği arayan kimliği.",
    text: "Giden numarayı, hattın kaydındaki SIP kullanıcı adından ayrı ayarlayın.",
  },
  {
    icon: "shield" as const,
    title: "Hazır, santralin hazır olduğu anlamına gelir.",
    text: "Sağlık ucu, PostgreSQL, Asterisk ve arama planı hazır olmadan sistemi sağlıklı saymaz.",
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
