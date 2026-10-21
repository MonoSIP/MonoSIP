// DSip site: language toggle (EN in the HTML, TR here), panel tour tabs, reveal on scroll.
(() => {
  document.documentElement.classList.add("js");

  const TR = {
    skip: "İçeriğe geç",
    "nav.features": "Özellikler",
    "nav.ivr": "IVR",
    "nav.softphone": "Softphone",
    "nav.panel": "Panel",
    "nav.install": "Kurulum",
    "hero.eyebrow": "Asterisk 22 · WebRTC · tek Docker imajı",
    "hero.title": "Kendi sunucunuzda çalışan <em>şirket santrali</em>.",
    "hero.lead":
      "Dahililer, kuyruklar, canlı API sorgusu ve yapay zekâ ile Türkçe konuşan görsel IVR tasarımcısı, tarayıcıda softphone, çağrı kayıtları ve canlı pano — ses ve yönetim tamamen sizin sunucunuzda.",
    "hero.cta": "Dakikalar içinde kurun",
    "hero.cta2": "Neler yapabildiğine bakın",
    "hero.f1": "GHCR’de hazır imaj — deploy derlemez, indirir",
    "hero.f2": "Veritabanı, kayıtlar ve ayarlar <code>/data</code> üzerinde kalıcı",
    "hero.f3": "MIT lisanslı açık kaynak",
    "hero.f4": "Türkçe ve İngilizce panel, açık ve koyu tema",
    "hero.caption":
      "Çağrı santrale gelir, IVR API’den canlı veriyi çeker, yapay zekâ sesiyle Türkçe okur; kuyruk boştaki temsilciyi çaldırır — meşgul olan atlanır.",
    "strip.pg": "gömülü",
    "feat.kicker": "~20 masalık bir ofisin ihtiyacı olan her şey",
    "feat.title": "Tüm telefon sistemi için tek panel",
    "feat.lead":
      "Barındırılan kapalı kutu yok, ek modül yok. Aşağıdakilerin hepsi aynı imajla gelir ve aynı yönetim panelinden yönetilir.",
    "f.ext.t": "Dahililer",
    "f.ext.d":
      "CSV içe/dışa aktarma, dahiliye özel arayan numara, arama izinleri (şehir içi / mobil / 444 / uluslararası), cevapsız · meşgul · ulaşılamaz yönlendirme, e-postaya sesli mesaj, anahtarla veya <code>*78</code>/<code>*79</code> ile sunucu taraflı rahatsız etmeyin ve her yerde canlı durum. 112 her zaman açık.",
    "f.q.t": "Kuyruklar ve zil grupları",
    "f.q.d":
      "Altı Asterisk stratejisi, öncelik ve toparlanma süresi, meşgul temsilci atlanır. Kuyruk başına dil ve ses modeliyle sıra ve bekleme süresi anonsları, bekleme müziği sınıfı, süre dolunca / dolu / boş taşma hedefleri ve “sıranızı kaybetmeden geri aranmak için 1’e basın”.",
    "f.ivr.t": "Görsel IVR tasarımcısı",
    "f.ivr.d":
      "Haritada on altı düğüm tipi, her biri kendi şeklinde: menü, tuş al, API, eğer, değişken ata, bekle, dil, takvim, rehber, alt akış, aktar, kuyruk, sesli posta ve dahası. Doğrulayın, simüle edin, yayınlayın, sürümler arasında geri dönün.",
    "f.tts.t": "Cümle cümle yapay zekâ sesi",
    "f.tts.d":
      "Edge Neural sesleri ve çevrimdışı Türkçe sinir ağı modeli EMA. Uzun metin cümlelere bölünür, biri çalarken sonraki üretilir; okuma yaklaşık bir saniyede başlar. Sayılar yazıyla okunur, sonuçlar önbelleğe alınır.",
    "f.sch.t": "Takvim ve tatiller",
    "f.sch.d":
      "Öğle arası durumlu haftalık saatler, Türkiye tatil paketi ve şirkete özel günler, elle geçersiz kılma (otomatik / açık / kapalı) ve her durum için ayrı hedef. Varsayılan saat dilimi Europe/Istanbul.",
    "f.trk.t": "Hatlar ve rotalar",
    "f.trk.d":
      "Yedekli çoklu SIP sağlayıcı, gelen DID ve arayan desenli rotalar, giden önekler, kara liste, gizli numara engeli, ülke izin listesi, günlük ve aylık harcama limiti, son aranan geri dönüşü.",
    "f.cdr.t": "Çağrı kayıtları ve ses kayıtları",
    "f.cdr.d":
      "Bir çağrıya tıklayınca zaman çizelgesi satırın hemen altında açılır: her IVR adımı, tuşlanan tuş, bekleme ve konuşma süresi, kuyruk, MOS / jitter / kayıp. KVKK anonslu kayıt, saklama süresi, Opus dönüştürme, NAS / SFTP arşivi.",
    "f.sec.t": "Güvenlik yerleşik",
    "f.sec.d":
      "Yönetici için 2FA (TOTP), yönetim, portal ve SIP için IP izin listeleri, giriş saldırısı engeli, Asterisk güvenlik olaylarından kaba kuvvet tarayıcılarını kaydeden SIP koruması, güvenlik duvarı dışa aktarımı ve Ayarlar’dan Let’s Encrypt sertifikası.",
    "f.int.t": "Entegrasyonlar",
    "f.int.d":
      "Çalıyor, cevaplandı, bitti ve kaçan çağrılar için webhook’lar; tıkla-ara, CDR ve kayıtlar için API anahtarlı REST API; web sitenize gömülebilen arama widget’ı; günlük ve aylık e-posta raporları.",
    "ivr.kicker": "IVR tasarımcısı",
    "ivr.title": "Çağrıyı çizin. Canlı veriyi çekin. Okutun.",
    "ivr.lead":
      "Canlıda çalışan gerçek bir örnek: döviz kurlarını, altın ve akaryakıt fiyatlarını, hava durumunu ve nöbetçi eczaneleri bir HTTP API’den okuyan bilgi hattı — her sorgudan önce “sorguluyorum” anonsuyla.",
    "ivr.p1":
      "<b>Her yerde değişken.</b> Tuş al’dan gelen rakamlar, Değişken ata veya API eşlemelerinden gelen değerler anons ve URL’lerde <code>$isim</code> ya da <code>{{isim}}</code> olarak kullanılır.",
    "ivr.p2":
      "<b>Konuşma filtreleri.</b> <code>{{plaka|il}}</code> 06’yı “Ankara” yapar, <code>{{telefon|rakam}}</code> rakam rakam okur, <code>{{fiyat|tl}}</code> “kırk dokuz virgül elli sekiz” der.",
    "ivr.p3":
      "<b>API düğümü.</b> GET / POST / PUT / PATCH / DELETE, şifreli saklanan gizli anahtarlar (akışın içinde asla), JSON yolu eşlemeleri, zaman aşımı, tekrar deneme ve test isteği.",
    "ivr.p4": "<b>Önden tuşlama.</b> Arayan anons sırasında tuşa basabilir; tuş tamponlanır, konuşma durur.",
    "ivr.p5":
      "<b>Güvenle değiştirin.</b> Yayından önce doğrulayın, örnek tuşlar ve sahte API verisiyle simüle edin, istediğiniz sürüme geri dönün.",
    "ivr.c1": "901 numaralı hat — her düğüm tipinin kendi şekli ve rengi var.",
    "ivr.c2": "Şifreli gizli anahtarla API isteği ayarları.",
    "ivr.c3": "Aktarmalar meşgul, cevapsız ve ulaşılamaz durumlarına göre dallanır.",
    "soft.kicker": "Softphone ve portal",
    "soft.title": "Tarayıcıda telefon, her masaya bir portal",
    "soft.lead":
      "Her dahili kendi portalına girer ve tam bir softphone kullanır — uygulama kurmaya gerek yok. Masa telefonları da aynı santrale bağlanır.",
    "soft.p1":
      "<b>WSS üzerinden WebRTC</b>, API’nin kendi vekil sunucusuyla; sayfa yenileme, birden fazla sekme ve ağ kopmalarından toparlanır.",
    "soft.p2":
      "<b>Telefon gibi tasarım:</b> görüşme ekranın içinde, son aramalar bir düğmenin arkasında, rahatsız etmeyin ve hızlı tuşlamayı asla kaçırmayan DTMF — açık ve koyu temaya uyar.",
    "soft.p3": "<b>Portal:</b> canlı durumlu rehber, aramalarım, kayıtlarım, sesli mesaj, yönlendirme ve rahatsız etmeyin.",
    "soft.p4": "<b>Masa telefonları:</b> Yealink / Fanvil / Grandstream MAC ile otomatik kurulum ve mobil softphone için QR.",
    "panel.kicker": "Yönetim paneli",
    "panel.title": "Günlük işletme, aynı yerde",
    "panel.lead": "Çalışan bir sistemden gerçek ekranlar.",
    "tab.dash": "Canlı pano",
    "tab.cdr": "Çağrı kayıtları",
    "tab.queues": "Kuyruklar",
    "tab.ext": "Dahililer",
    "tab.reports": "Raporlar",
    "tab.settings": "Ayarlar ve SSL",
    "inst.kicker": "Kurulum",
    "inst.title": "Tek konteyner. İndir ve çalıştır.",
    "inst.lead":
      "Asterisk, API, panel, PostgreSQL ve TTS motorları tek bir imajda; her sürümde GitHub Container Registry’ye yayınlanır. Deploy derlemek yerine yaklaşık bir dakikada indirir.",
    "inst.s1": "Bir alan adını sunucuya yönlendirin; TCP 80/443 ve UDP 10000–10100 (RTP) portlarını açın.",
    "inst.s2": "İmajı <code>/data</code> üzerinde bir volume ile çalıştırın.",
    "inst.s3": "Giriş yapın, Ayarlar’da alan adını girin ve sertifikayı alın.",
    "inst.note":
      "Önerilen: en az 2 vCPU ve 4 GB RAM (yapay zekâ sesi santralin işlemcisinde çalışır). SIP 5060’ı yalnızca masa telefonu veya SIP hattı gerekiyorsa açın.",
    "inst.l1": "Kurulum rehberi",
    "inst.l2": "VPS / Compose",
    "inst.l3": "Tüm özellik listesi",
    foot: 'Kendi sunucunuzda şirket santrali · <a href="https://github.com/diggyen/DSip/blob/main/LICENSE">MIT Lisansı</a> · kaynak kodu GitHub’da',
    "foot.top": "Başa dön ↑",
  };

  const TOUR = {
    dashboard: {
      en: "Live dashboard — active calls, answered / missed, extension presence and queues over WebSocket; TV mode.",
      tr: "Canlı pano — WebSocket ile aktif çağrılar, cevaplanan / kaçan, dahili durumları ve kuyruklar; TV modu.",
      alt: "Live dashboard: active calls, answered and missed counts, extension presence and queues",
    },
    cdr: {
      en: "Call logs — the clicked call opens its timeline inline: IVR steps, keys, wait, talk time, quality.",
      tr: "Çağrı kayıtları — tıklanan çağrının zaman çizelgesi satırın altında açılır: IVR adımları, tuşlar, bekleme, konuşma, kalite.",
      alt: "Call detail records with one call expanded: facts and a step-by-step IVR timeline",
    },
    queues: {
      en: "Queues — strategy, timeouts, announcement language and voice model, overflow destinations, members.",
      tr: "Kuyruklar — strateji, süreler, anons dili ve ses modeli, taşma hedefleri, üyeler.",
      alt: "Queue editor with strategy, wait limits, announcement language, voice model and overflow destinations",
    },
    extensions: {
      en: "Extensions — DND switches that lock while saving, CSV import/export, portal access.",
      tr: "Dahililer — kaydedilirken kilitlenen rahatsız etmeyin anahtarları, CSV içe/dışa aktarma, portal erişimi.",
      alt: "Extensions list with do-not-disturb switches",
    },
    reports: {
      en: "Reports — totals, service level, voice quality (MOS, jitter, loss) and per-queue numbers.",
      tr: "Raporlar — toplamlar, hizmet seviyesi, ses kalitesi (MOS, jitter, kayıp) ve kuyruk bazında sayılar.",
      alt: "Reports: summary, voice quality and per-queue statistics",
    },
    settings: {
      en: "Settings — hostname and automatic Let’s Encrypt SSL, company, retention, KVKK, TTS model, security.",
      tr: "Ayarlar — alan adı ve otomatik Let’s Encrypt SSL, şirket, saklama süresi, KVKK, TTS modeli, güvenlik.",
      alt: "Settings: hostname and SSL, company name, retention and KVKK announcement",
    },
  };

  const nodes = [...document.querySelectorAll("[data-i18n]")];
  const english = new Map(nodes.map((n) => [n, n.innerHTML]));
  const imgs = [...document.querySelectorAll("img[data-alt-tr]")];
  const englishAlt = new Map(imgs.map((i) => [i, i.alt]));
  let lang = "en";

  function store(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  }
  function read(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }

  function setLang(next) {
    lang = next;
    document.documentElement.lang = next;
    for (const n of nodes) {
      const tr = TR[n.dataset.i18n];
      n.innerHTML = next === "tr" && tr ? tr : english.get(n);
    }
    for (const i of imgs) i.alt = next === "tr" ? i.dataset.altTr : englishAlt.get(i);
    const label = document.querySelector("[data-lang-label]");
    if (label) label.textContent = next === "tr" ? "EN" : "TR";
    renderTour();
    store("dsip_site_lang", next);
  }

  // ── panel tour ──
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  const tourImg = document.querySelector("#tour-img img");
  const tourCap = document.querySelector("[data-tour-caption]");
  let current = "dashboard";
  function renderTour() {
    const t = TOUR[current];
    if (tourCap && t) tourCap.textContent = t[lang];
  }
  function selectTab(btn, focus) {
    current = btn.dataset.shot;
    for (const b of tabs) {
      const on = b === btn;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (focus) btn.focus();
    tourImg.classList.add("is-swapping");
    const next = new Image();
    next.src = `images/${current}.webp`;
    next.decode().catch(() => undefined).finally(() => {
      tourImg.src = next.src;
      tourImg.alt = TOUR[current].alt;
      tourImg.classList.remove("is-swapping");
    });
    renderTour();
  }
  tabs.forEach((b, i) => {
    b.tabIndex = i === 0 ? 0 : -1;
    b.addEventListener("click", () => selectTab(b, false));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      selectTab(tabs[(i + d + tabs.length) % tabs.length], true);
    });
  });

  document.querySelector(".lang-toggle")?.addEventListener("click", () => setLang(lang === "tr" ? "en" : "tr"));
  const saved = read("dsip_site_lang");
  const initial = saved || ((navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en");
  setLang(initial);

  // ── reveal on scroll ──
  const reveals = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    reveals.forEach((r) => r.classList.add("in"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    reveals.forEach((r, i) => {
      r.style.transitionDelay = `${Math.min(i % 6, 5) * 45}ms`;
      io.observe(r);
    });
  }
})();
