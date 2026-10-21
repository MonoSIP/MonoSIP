// Homepage and docs chrome. English stays in the HTML; Turkish replaces it.
(() => {
  const KEY = "munasip_site_lang";
  const tr = {
    "skip.main": "İçeriğe geç",
    "skip.doc": "İçeriğe geç",
    "lang.label": "Dil",
    "nav.sections": "Bölümler",
    "nav.softphone": "Telefon",
    "nav.features": "Özellikler",
    "nav.ivr": "IVR",
    "nav.panel": "Panel",
    "nav.install": "Kurulum",
    "nav.docs": "Belgeler",
    "nav.docs.label": "Belgeler",
    "hero.eyebrow": "Asterisk 22 · WebRTC · tek Docker imajı",
    "hero.title": "Şirket santralini <em>kendin çalıştır</em>.",
    "hero.lead":
      "Arayan senin sunucuna ulaşır. IVR döviz kurunu sorgular, sesli okur ve kuyruk boşta olanı çalar. Dahililer, tasarımcı, tarayıcı telefonu ve pano aynı Docker imajında, o sunucuda çalışır.",
    "hero.say": "“Bir dolar 0,89 euro”",
    "hero.pull": "İmajı çek",
    "hero.see": "Santrali gör",
    "hero.fact1": "GHCR’de hazır imaj — kurulum çeker, derlemez",
    "hero.fact2": "Veritabanı, kayıtlar ve ayarlar <code>/data</code> üzerinde kalır",
    "hero.fact3": "MIT lisansı ile açık kaynak",
    "hero.fact4": "Panel İngilizce ve Türkçe, açık ve koyu tema",
    "hero.map":
      "Canlandırılmış çizim: çağrı santrale girer, IVR veriyi bir API’den alır, okur ve kuyruk boştaki temsilciyi çalar.",
    "hero.caption":
      "Çağrı santrale gelir, IVR bir API’den canlı veriyi alır ve okur, kuyruk boştaki temsilciyi çalar — meşgul olan atlanır. Bu çizim çağrı başlatmaz.",
    "stack.label": "Teknoloji",
    "stack.embedded": "gömülü",
    "soft.kicker": "01 · Yazılı telefon",
    "soft.title": "Tarayıcıdan yanıtla",
    "soft.lead":
      "Her dahili bir kez girer ve portalda gezerken çağrıda kalan bir yazılı telefon alır. Masa telefonu aynı şifreyi kullanır.",
    "soft.t1": "<b>Tarayıcıda.</b> Her dahiliye bir yazılı telefon düşer. Kurulacak uygulama yok.",
    "soft.t2": "<b>Çağrıda kalır.</b> Portalda gezinmek çağrıyı düşürmez.",
    "soft.t3": "<b>Tek şifre</b> portal, tarayıcı ve masa telefonu için.",
    "soft.t4": "<b>Kendi sayfaları:</b> rehber, çağrılar, kayıtlar, sesli mesaj ve yönlendirme.",
    "soft.more": "Portal ve yazılı telefon kılavuzunu aç",
    "feat.kicker": "02 · Santral",
    "feat.title": "Ofisi tek panelden yönet",
    "feat.lead":
      "Yaklaşık yirmi masa için. Dahililer, kuyruklar, saatler ve hatlar aynı imajda gelir ve aynı yönetimden ayarlanır.",
    "feat.more": "Her özelliğin ne yaptığını oku",
    "card.ext.title": "Her masaya bir numara ver",
    "card.ext.body": "Tek şifre portalı, tarayıcıyı ve masa telefonunu açar.",
    "card.ext.c1": "CSV içe aktarma",
    "card.ext.c2": "Yönlendirme",
    "card.ext.c3": "Arayan numara",
    "card.ext.c4": "Rahatsız etmeyin",
    "card.q.title": "Arayana sırasını söyle",
    "card.q.body": "Altı çalma düzeni, bekleme müziği ve bekleme uzayınca geri arama.",
    "card.q.c1": "Hepsini çal",
    "card.q.c2": "En uzun boşta",
    "card.q.c3": "Sıra",
    "card.q.c4": "Geri arama",
    "card.ivr.title": "Yolu çiz, sonra yayınla",
    "card.ivr.body": "Her adımın kendi şekli vardır. Taslağı düzenlerken canlı çağrılar yayınlanan sürümde kalır.",
    "card.ivr.c1": "Menü",
    "card.ivr.c2": "API sorgu",
    "card.ivr.c3": "Aktarma",
    "card.ivr.c4": "Sürüm geçmişi",
    "card.tts.title": "Cümle bitmeden konuşmaya başla",
    "card.tts.body": "İngilizce ve Türkçe sinirsel sesler. Uzun bir okuma, kalanı üretilirken başlar.",
    "card.tts.c3": "Önbellek",
    "card.tts.c4": "Erken tuş",
    "card.time.title": "Saatle aç ve kapat",
    "card.time.body": "Haftalık saatler, öğle, tatiller ve ofisi şimdi açıp kapatan bir anahtar.",
    "card.time.c1": "Öğle",
    "card.time.c2": "Tatiller",
    "card.time.c3": "Geçersiz kılma",
    "card.trunk.title": "Çağrıyı doğru hattan çıkar",
    "card.trunk.body": "Birden fazla sağlayıcı, gelen numaralar, yedek hat ve günlük harcama sınırı.",
    "card.trunk.c2": "Yedek hat",
    "card.trunk.c3": "Arayan numara",
    "card.trunk.c4": "Harcama sınırı",
    "card.cdr.title": "Çağrının yolunu gör",
    "card.cdr.body": "Bir satırı açınca IVR adımları, basılan tuşlar ve kayıt aynı sayfadadır.",
    "card.cdr.c1": "Zaman çizelgesi",
    "card.cdr.c3": "Cevapsız çağrılar",
    "card.cdr.c4": "Saklama",
    "card.sec.title": "Sertifikayı Ayarlar’dan al",
    "card.sec.body": "Giriş koruması ve adres sınırları panelle gelir. Makine adının sertifikası da oradan çıkar.",
    "card.sec.c1": "Giriş sınırı",
    "card.sec.c2": "Adres sınırı",
    "card.hook.title": "Çağrıyı kullandığın araçlara ver",
    "card.hook.body": "Çalma, cevap ve kapanışta webhook gider. Bir API anahtarı ve arama düğmesi şirket sitesini karşılar.",
    "card.hook.c2": "API anahtarı",
    "card.hook.c3": "Arama düğmesi",
    "ivr.kicker": "03 · Çağrı akışı",
    "ivr.title": "Bir menü, bir sorgu, sonra bir cümle",
    "ivr.lead":
      "902’deki örnek hat arayanı karşılar, satış ve destek kuyruğunu sunar, ardından canlı döviz kurunu okur. Yayınlamadan taslak telefonlara çıkmaz.",
    "ivr.flow":
      "Canlandırılmış IVR yolu: başlangıç, karşılama, menü, bekleyin anonsu, API sorgusu, okunan sonuç, menüye dönüş.",
    "ivr.t1":
      "<b>Her adımın bir şekli.</b> Başlangıç, anons, menü, aktarma, kuyruk, API, koşul ve kapatma kendi şekline ve rengine sahiptir. Birini haritaya sürükle, kalemle aç ve çıkışı sonraki adıma çiz.",
    "ivr.t2":
      "<b>902’deki örnek çağrı.</b> Arayanı karşılar, satış ve destek kuyruğunu sunar, “bir dakika” der, sonra döviz kurunu alıp okur. Anons sırasında basılan tuş anonsu keser ve rakam saklanır.",
    "ivr.t3":
      "<b>Canlı veri.</b> Bir API düğümü GET, POST, PUT, PATCH veya DELETE gönderir. Adresi, zaman aşımını, yeniden denemeyi ve kimliği sen koyarsın — yok, Basic, Bearer veya özel başlık. Gizli değer Ayarlar’da şifreli durur, akış dosyasına yazılmaz. <code>$.rates.usd</code> gibi bir JSON yolu <code>rate</code> olur ve sonraki düğüm onu söyler.",
    "ivr.t4":
      "<b>Arayan cümlenin içinde kalır.</b> <code>$caller</code>, <code>$did</code> ve topladığın rakam söylenebilir ya da istek adresi ve gövdesinde gönderilebilir. Süzgeçler plaka kodunu ile, fiyatı sözcüğe, sayıyı tek tek okunan rakamlara çevirir.",
    "ivr.t5":
      "<b>Her çıkış bir dal.</b> Menünün her tuşu, zaman aşımı ve geçersiz tuş için bir yolu vardır. Aktarmanın meşgul, cevapsız ve ulaşılamaz yolları vardır. Meşgul dahili telefon çalmadan yakalanır; arayan meşgul yolunu duyar, masa çalmaz.",
    "ivr.t6":
      "<b>Dene, sonra yayınla.</b> Deneme çağrısı taslağı bir arayan numarası, bir saat ve tuşlarla yürür ve uğradığı düğümleri işaretler. Canlı çağrılar yayınlanan sürümü kullanır. Eski bir sürüm bir tık ötededir; başlamış çağrı başladığı sürümde biter.",
    "ivr.more": "IVR tasarımcı kılavuzunu aç",
    "ivr.cap1": "Dahili 902 — her düğüm tipinin kendi şekli ve rengi vardır.",
    "ivr.cap2": "API isteği ayarları: yöntem, adres, yeniden deneme, kimlik ve JSON eşlemeleri.",
    "ivr.cap3": "Aktarma meşgul, cevapsız ve ulaşılamaz durumlarında dallanır.",
    "ivr.mock1":
      "IVR tasarımcısı: karşılama, menü, satış aktarması, destek kuyruğu, bir dakika anonsu, döviz API’si, koşul ve okuma",
    "ivr.mock2": "API isteği ayarları: yöntem düğmeleri, adres, zaman aşımı, yeniden deneme, kimlik ve JSON eşlemeleri",
    "ivr.mock3": "900 dahilindeki ana IVR: karşılama, menü, meşgul, cevapsız ve ulaşılamaz çıkışları",
    "panel.kicker": "04 · Yayından sonra",
    "panel.title": "Operasyonu aynı panelden izle",
    "panel.lead":
      "Aktif çağrılar, biten çağrının yolu, kuyruk beklemesi ve sertifika bu ekranlardadır. Çizimler örnek adlar kullanır.",
    "panel.more": "Yönetim ekranlarına bak",
    "panel.tabs": "Panel ekranları",
    "panel.tab.dashboard": "Canlı pano",
    "panel.tab.cdr": "Çağrı kayıtları",
    "panel.tab.queues": "Kuyruklar",
    "panel.tab.extensions": "Dahililer",
    "panel.tab.reports": "Raporlar",
    "panel.tab.settings": "Ayarlar ve SSL",
    "install.kicker": "05 · Kendi sunucunda",
    "install.title": "İmajı çek. Santral ayakta.",
    "install.lead":
      "Asterisk, API, panel, PostgreSQL ve konuşma motorları GitHub Container Registry’deki tek imajda yaşar. Kurulum onu çeker. Derlemez.",
    "install.s1": "Bir makine adını sunucuya yönelt ve TCP 80/443 ile UDP 10000–10100 (RTP) kapılarını aç.",
    "install.s2": "İmajı <code>/data</code> üzerinde bir birimle çalıştır.",
    "install.s3": "Giriş yap, Ayarlar’dan makine adını yaz ve sertifikayı çıkar.",
    "install.note":
      "Öneri: 2 vCPU ve 4 GB RAM veya daha fazlası (sinirsel konuşma santralin işlemcisinde çalışır). SIP 5060’ı yalnızca masa telefonu veya hat gerekiyorsa aç.",
    "install.term": "Kurulum komutları",
    "install.c1": "hazır imaj (linux/amd64)",
    "install.c2": "güncelleme: veri munasip-data biriminde kalır",
    "install.guide": "Kurulum kılavuzunu izle",
    "install.vps": "Bir VPS’e kur",
    "install.features": "Özellik listesini oku",
    "footer.blurb": "Kendi sunucunda çalışan şirket santrali",
    "footer.mit": "MIT lisansı",
    "footer.top": "Başa dön ↑",
    "meta.title": "MünaSIP — Şirket santralini kendin çalıştır",
    "meta.description":
      "Tek Docker imajında kendi sunucunda çalışan Asterisk şirket santrali: dahililer, kuyruklar, API ve sinirsel konuşmalı görsel IVR, tarayıcı telefonu, çağrı kayıtları, canlı pano ve otomatik SSL.",
    "phone.label": "Tarayıcı telefonu: Alice 101 olarak kayıtlı, numara alanı, son aramalar, tuş takımı, rahatsız etmeyin ve ara",
    "phone.registered": "Kayıtlı",
    "phone.enter": "Numara gir",
    "phone.recents": "Son aramalar",
    "phone.clear": "Sil",
    "crumb.label": "Konum",
    "crumb.home": "Ana sayfa",
    "docs.nav": "Belgeler",
    "docs.overview": "Genel bakış",
    "docs.install": "Kurulum",
    "docs.features": "Özellikler",
    "docs.architecture": "Mimari",
    "docs.deploy": "Dağıtım",
    "docs.portal": "Portal",
    "docs.ivr": "IVR",
    "docs.data": "Veri modeli",
    "docs.api": "API",
    "docs.screens": "Ekranlar",
    "docs.tests": "Test planı",
    "docs.security": "Güvenlik",
    "docs.speech": "Konuşma",
    "docs.roadmap": "Yol haritası",
  };

  const htmlKeys = new Set([
    "hero.title",
    "hero.lead",
    "hero.fact2",
    "soft.t1",
    "soft.t2",
    "soft.t3",
    "soft.t4",
    "ivr.t1",
    "ivr.t2",
    "ivr.t3",
    "ivr.t4",
    "ivr.t5",
    "ivr.t6",
    "install.s2",
  ]);

  function saved() {
    try {
      return localStorage.getItem(KEY) === "tr" ? "tr" : "en";
    } catch {
      return "en";
    }
  }

  function textOf(el) {
    return htmlKeys.has(el.dataset.i18n) ? el.innerHTML : el.textContent;
  }

  function write(el, value) {
    if (htmlKeys.has(el.dataset.i18n)) el.innerHTML = value;
    else el.textContent = value;
  }

  function apply(lang) {
    const useTr = lang === "tr";
    document.documentElement.lang = useTr ? "tr" : "en";
    for (const el of document.querySelectorAll("[data-i18n]")) {
      if (!el.dataset.i18nEn) el.dataset.i18nEn = textOf(el);
      const next = useTr ? tr[el.dataset.i18n] : null;
      write(el, next || el.dataset.i18nEn);
    }
    for (const el of document.querySelectorAll("[data-i18n-aria]")) {
      if (!el.dataset.i18nAriaEn) el.dataset.i18nAriaEn = el.getAttribute("aria-label") || "";
      const next = useTr ? tr[el.dataset.i18nAria] : null;
      el.setAttribute("aria-label", next || el.dataset.i18nAriaEn);
    }
    for (const btn of document.querySelectorAll("[data-set-lang]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.setLang === (useTr ? "tr" : "en")));
    }
    try {
      localStorage.setItem(KEY, useTr ? "tr" : "en");
    } catch {
      /* private mode */
    }
    if (document.getElementById("main")) {
      const title = tr["meta.title"];
      const description = tr["meta.description"];
      const titleEl = document.querySelector("title");
      if (titleEl && !titleEl.dataset.i18nEn) titleEl.dataset.i18nEn = titleEl.textContent;
      if (titleEl) titleEl.textContent = useTr ? title : titleEl.dataset.i18nEn;
      for (const [sel, value] of [
        ['meta[name="description"]', description],
        ['meta[property="og:title"]', title],
        ['meta[property="og:description"]', description],
      ]) {
        const meta = document.querySelector(sel);
        if (!meta) continue;
        if (!meta.dataset.i18nEn) meta.dataset.i18nEn = meta.getAttribute("content") || "";
        meta.setAttribute("content", useTr ? value : meta.dataset.i18nEn);
      }
    }
    document.dispatchEvent(new CustomEvent("munasip-lang", { detail: useTr ? "tr" : "en" }));
  }

  for (const btn of document.querySelectorAll("[data-set-lang]")) {
    btn.addEventListener("click", () => apply(btn.dataset.setLang));
  }
  apply(saved());
})();
