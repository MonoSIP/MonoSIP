"use client";

import { useRef, useState } from "react";
import { Icon } from "./icon";
import { ProductMockup, type MockupScreen } from "./product-mockup";
import type { Locale } from "@/lib/locale";
import { site } from "@/lib/site";

const screens = (
  tr: boolean,
): {
  name: string;
  file: MockupScreen;
  icon: string;
  title: string;
  text: string;
  alt: string;
}[] => [
  {
    name: tr ? "Canlı pano" : "Live dashboard",
    file: "dashboard",
    icon: "chart",
    title: tr
      ? "Ofisin tamamı, bir bakışta."
      : "The whole office, at a glance.",
    text: tr
      ? "Aktif aramaları, dahili durumunu ve kuyruk hareketini tek canlı görünümde görün. Ekip için TV moduna geçin."
      : "See active calls, extension presence and queue activity in one live view. Switch to TV mode for the team.",
    alt: tr
      ? "Arama sayıları, canlı dahili durumu ve kuyrukları gösteren MunaSIP panosu"
      : "MunaSIP dashboard showing call counts, live extension presence and queues",
  },
  {
    name: tr ? "Görsel IVR" : "Visual IVR",
    file: "ivr-designer",
    icon: "flow",
    title: tr
      ? "Her arayan için net bir yol."
      : "A clear path for every caller.",
    text: tr
      ? "Menü, API isteği, koşul ve hedefleri bağlayın. Çağrı akışınızı doğrulayın, simüle edin ve yayınlayın."
      : "Connect menus, API requests, conditions and destinations. Validate, simulate and publish your call flow.",
    alt: tr
      ? "Ana hat demosu, menü, API sorgusu ve koşullu rotalarla MunaSIP görsel IVR tasarımcısı"
      : "MunaSIP visual IVR designer with the Main line demo, a menu, API lookup and conditional routes",
  },
  {
    name: tr ? "Arama kayıtları" : "Call logs",
    file: "cdr",
    icon: "phone",
    title: tr
      ? "Konuşmanın tamamını izleyin."
      : "Follow the whole conversation.",
    text: tr
      ? "IVR zaman çizelgesini görmek için bir arama satırını açın. Kayıtları süzün, CSV dışa aktarın ve ilgili ses kaydını bulun."
      : "Open a call row to inspect its IVR timeline. Filter records, export CSV and find the associated recording.",
    alt: tr
      ? "Süzgeçler, arama yönü ve kayıt denetimleriyle MunaSIP arama ayrıntı kayıtları"
      : "MunaSIP call detail records with filters, call direction and recording controls",
  },
  {
    name: tr ? "Sesli mesaj" : "Voicemail",
    file: "voicemail",
    icon: "sound",
    title: tr
      ? "Aramayı kaçırın. Mesaj kalsın."
      : "Miss the call. Keep the message.",
    text: tr
      ? `Dahilinizin kutusunu açın, kim aradığını görün, mesajı dinleyin ve okundu durumunu yönetin. v${site.version} ile gelir.`
      : `Open your extension’s mailbox, see who called, listen to the message and manage its read state. Included in v${site.version}.`,
    alt: tr
      ? "Arayan ayrıntıları, okunmamış mesajlar ve oynatıcıyla MunaSIP çalışan sesli mesaj kutusu"
      : "MunaSIP employee voicemail inbox with caller details, unread messages and a playback panel",
  },
  {
    name: tr ? "Kuyruklar" : "Queues",
    file: "queues",
    icon: "users",
    title: tr
      ? "Ekibinize cevap için yer açın."
      : "Give your team room to answer.",
    text: tr
      ? "Bir çalma stratejisi seçin, üyeleri yönetin, bekleme anonsu, taşma ve geri aramayı ayarlayın."
      : "Choose a ring strategy, manage members and configure wait announcements, overflow and callback.",
    alt: tr
      ? "Üyeler ve yönlendirme ayarlarıyla MunaSIP kuyruk yönetimi"
      : "MunaSIP queue management with members and routing configuration",
  },
  {
    name: tr ? "Dahililer" : "Extensions",
    file: "extensions",
    icon: "network",
    title: tr ? "Her masa için bir yer." : "A place for every desk.",
    text: tr
      ? "Dahili izinlerini, yönlendirmeyi, arayan kimliklerini ve paylaşılan portal/SIP parolalarını yönetin. CSV içe veya dışa aktarın."
      : "Manage extension permissions, forwarding, caller IDs and shared portal/SIP passwords. Import or export CSV.",
    alt: tr
      ? "Ofis dahililerini ve durumlarını gösteren MunaSIP dahili yönetimi"
      : "MunaSIP extensions management showing office extensions and presence",
  },
  {
    name: tr ? "Raporlar" : "Reports",
    file: "reports",
    icon: "chart",
    title: tr ? "Günün sesini görün." : "See what the day sounded like.",
    text: tr
      ? "Cevaplanan, kaçan ve terk edilen aramaları, kuyruk veya dahiliye göre bekleme ve konuşma süreleriyle inceleyin."
      : "Review answered, missed and abandoned calls, with wait and talk times by queue or extension.",
    alt: tr
      ? "Tarih süzgeçleri ve arama istatistikleriyle MunaSIP rapor ekranı"
      : "MunaSIP reporting screen with date filters and call statistics",
  },
  {
    name: tr ? "Ayarlar ve SSL" : "Settings & SSL",
    file: "settings",
    icon: "shield",
    title: tr ? "Sisteminiz. Ayarlarınız." : "Your system. Your settings.",
    text: tr
      ? "Herkese açık alan adını koyun, güvenlik seçeneklerini yönetin ve otomatik Let’s Encrypt sertifikalarını ayarlayın."
      : "Set the public hostname, manage security options and configure automatic Let’s Encrypt certificates.",
    alt: tr
      ? "Alan adı ve otomatik SSL ayarını içeren MunaSIP sistem ayarları"
      : "MunaSIP system settings including hostname and automatic SSL configuration",
  },
];

export function ScreenTour({ locale = "en" }: { locale?: Locale }) {
  const tour = screens(locale === "tr");
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const screen = tour[selected];
  return (
    <div className="screen-tour">
      <div className="tour-sidebar">
        <div className="tour-sidebar-label mono">
          {locale === "tr" ? "KONTROL ODASI" : "THE CONTROL ROOM"}
        </div>
        <div
          role="tablist"
          aria-label={
            locale === "tr"
              ? "Ürün ekranlarını gezin"
              : "Explore product screens"
          }
          className="screen-tabs"
          aria-orientation="vertical"
        >
          {tour.map((item, i) => (
            <button
              ref={(node) => {
                buttons.current[i] = node;
              }}
              type="button"
              role="tab"
              id={`screen-tab-${i}`}
              key={item.file}
              aria-controls="screen-panel"
              aria-selected={selected === i}
              tabIndex={selected === i ? 0 : -1}
              onClick={() => setSelected(i)}
              onKeyDown={(event) => {
                let next: number;
                if (event.key === "ArrowDown" || event.key === "ArrowRight")
                  next = (i + 1) % tour.length;
                else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
                  next = (i - 1 + tour.length) % tour.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = tour.length - 1;
                else return;
                event.preventDefault();
                setSelected(next);
                buttons.current[next]?.focus();
              }}
            >
              <Icon name={item.icon} />
              <span>{item.name}</span>
              <Icon name="arrow" className="tab-arrow" />
            </button>
          ))}
        </div>
        <div className="screen-caption">
          <span className="status-dot" />{" "}
          {locale === "tr"
            ? "Yakından, hareket halinde."
            : "A closer look, in motion."}
          <br />
          <span>
            {locale === "tr"
              ? "Örnek arayüz taslakları."
              : "Illustrative interface mockups."}
          </span>
        </div>
      </div>
      <div
        role="tabpanel"
        tabIndex={0}
        id="screen-panel"
        aria-labelledby={`screen-tab-${selected}`}
        className="tour-panel"
      >
        <div className="browser-bar">
          <span className="terminal-dots">
            <i />
            <i />
            <i />
          </span>
          <span>
            <Icon name="shield" /> your-pbx / admin / {screen.file}
          </span>
          <span className="screen-version">
            {locale === "tr" ? "ARAYÜZ TASLAĞI" : "INTERFACE CONCEPT"}
          </span>
        </div>
        <ProductMockup
          key={screen.file}
          screen={screen.file}
          label={`${screen.alt} — illustrative animated mockup`}
        />
        <div className="tour-panel-caption">
          <div>
            <h3>{screen.title}</h3>
            <p>{screen.text}</p>
          </div>
          <span className="mono">
            0{selected + 1} / 0{tour.length}
          </span>
        </div>
      </div>
    </div>
  );
}
