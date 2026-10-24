import Link from "next/link";
import { ProductMockup } from "@/components/product-mockup";
import { Icon } from "@/components/icon";
import { CallMap } from "@/components/call-map";
import { ScreenTour } from "@/components/screen-tour";
import { CodeBlock } from "@/components/code-block";
import { Architecture } from "@/components/architecture";
import type { Locale } from "@/lib/locale";
import { pathFor } from "@/lib/locale";
import { site, dockerCommand, sourceDoc, releaseHighlights } from "@/lib/site";

type L = (en: string, tr: string) => string;

const features = (L: L) => [
  {
    icon: "network",
    label: L("01 / THE EVERYDAY ESSENTIALS", "01 / GÜNDELİK TEMELLER"),
    title: L("Every desk, connected.", "Her masa, bağlı."),
    text: L(
      "Extensions, live presence, forwarding and voicemail. One password for the employee portal and SIP phone. Manage the team in one place.",
      "Dahililer, canlı durum, yönlendirme ve sesli mesaj. Çalışan portalı ve SIP telefonu için tek parola. Ekibi tek yerden yönetin.",
    ),
    tags: [
      L("CSV import / export", "CSV içe / dışa aktarma"),
      "DND",
      L("Desk phones", "Masa telefonları"),
    ],
  },
  {
    icon: "users",
    label: L("02 / A BETTER WAIT", "02 / DAHA İYİ BİR BEKLEYİŞ"),
    title: L("Keep callers in the loop.", "Arayanı habersiz bırakmayın."),
    text: L(
      "Ring groups and queues with six routing strategies. Position announcements, hold music, overflow and a callback option when the team is busy.",
      "Altı yönlendirme stratejisiyle zil grupları ve kuyruklar. Sıra anonsları, bekleme müziği, taşma ve ekip meşgulken geri arama.",
    ),
    tags: [
      L("Queue callback", "Kuyruk geri araması"),
      L("Wrap-up", "Sonlandırma süresi"),
      L("Overflow routes", "Taşma rotaları"),
    ],
  },
  {
    icon: "clock",
    label: L("03 / ON YOUR SCHEDULE", "03 / SİZİN TAKVİMİNİZ"),
    title: L("Your hours. Your rules.", "Saatleriniz. Kurallarınız."),
    text: L(
      "Route calls for open hours, lunch breaks and holidays. Override the schedule when plans change, with a destination for every state.",
      "Açık saat, öğle arası ve tatiller için aramayı yönlendirin. Plan değişince takvimi geçersiz kılın; her durumun bir hedefi olsun.",
    ),
    tags: [
      L("Weekly schedules", "Haftalık takvimler"),
      L("Holidays", "Tatiller"),
      L("Manual override", "Elle geçersiz kılma"),
    ],
  },
  {
    icon: "chart",
    label: L("04 / THE FULL PICTURE", "04 / BÜTÜN GÜN"),
    title: L("Know how the day went.", "Günün nasıl geçtiğini bilin."),
    text: L(
      "Live call activity, detailed call records and recording playback. Open a call’s IVR timeline and see the path it took.",
      "Canlı arama hareketi, ayrıntılı arama kayıtları ve kayıt dinleme. Bir aramanın IVR zaman çizelgesini açın, izlediği yolu görün.",
    ),
    tags: [
      L("Call timelines", "Arama zaman çizelgesi"),
      L("Reports", "Raporlar"),
      L("TV mode", "TV modu"),
    ],
  },
  {
    icon: "phone",
    label: L("05 / YOUR EXISTING CONNECTIONS", "05 / MEVCUT BAĞLANTILARINIZ"),
    title: L("Bring your SIP provider.", "SIP operatörünüzü getirin."),
    text: L(
      "Registered or IP-based trunks, DID routing and outbound failover. Set the provider caller ID separately from the registration username.",
      "Kayıtlı veya IP tabanlı trunk’lar, DID yönlendirme ve giden yedek hat. Operatör arayan kimliğini, kayıt kullanıcı adından ayrı ayarlayın.",
    ),
    tags: [
      L("Provider caller ID", "Operatör arayan kimliği"),
      L("Inbound DIDs", "Gelen DID’ler"),
      L("Failover", "Yedek hat"),
    ],
  },
  {
    icon: "sound",
    label: L("06 / AFTER THE RING", "06 / ÇALMA BİTTİKTEN SONRA"),
    title: L("Leave room for a message.", "Mesaja yer bırakın."),
    text: L(
      "Send unanswered calls to an extension’s voicemail. Employees can see the caller, play messages and manage their own inbox in the portal.",
      "Cevapsız aramaları dahiliye ait sesli mesaja gönderin. Çalışanlar arayanı görür, mesajı dinler ve kutusunu portalda yönetir.",
    ),
    tags: [
      L("Voicemail inbox", "Sesli mesaj kutusu"),
      L("Read state", "Okundu durumu"),
      L("Forwarding", "Yönlendirme"),
    ],
  },
  {
    icon: "code",
    label: L("07 / CONNECT YOUR WORKFLOW", "07 / İŞ AKIŞINIZA BAĞLAYIN"),
    title: L("Put calls in context.", "Aramayı bağlama oturtun."),
    text: L(
      "Use REST endpoints, signed webhooks and visual API lookups to connect your existing tools. Embed a browser call button on your website.",
      "Mevcut araçlarınızı REST uçları, imzalı webhook’lar ve görsel API sorgularıyla bağlayın. Sitenize tarayıcıdan arama düğmesi yerleştirin.",
    ),
    tags: ["REST API", "Webhooks", L("Call widget", "Arama bileşeni")],
  },
  {
    icon: "shield",
    label: L("08 / OPERATE WITH CLARITY", "08 / NET BİR İŞLETİM"),
    title: L("Know when you’re ready.", "Hazır olduğunuzu bilin."),
    text: L(
      "A health gate checks the database, Asterisk and dialplan. Manage HTTPS, optional admin 2FA, access rules and persistent data on your infrastructure.",
      "Sağlık kapısı veritabanını, Asterisk’i ve arama planını kontrol eder. HTTPS, isteğe bağlı yönetici 2FA, erişim kuralları ve kalıcı veriyi kendi altyapınızda yönetin.",
    ),
    tags: [
      L("Readiness gate", "Hazır olma kapısı"),
      L("Automatic SSL", "Otomatik SSL"),
      L("Access controls", "Erişim denetimleri"),
    ],
  },
];

const faqs = (L: L) => [
  [
    L("What is MunaSIP?", "MunaSIP nedir?"),
    L(
      "MunaSIP is an open-source Asterisk-based company PBX for small offices, designed around roughly 20 extensions. It includes an admin panel, visual IVR designer, browser softphone and employee portal.",
      "MunaSIP, yaklaşık 20 dahiliye göre tasarlanmış, küçük ofisler için açık kaynaklı Asterisk şirket santralidir. Yönetici paneli, görsel IVR tasarımcısı, tarayıcı telefonu ve çalışan portalı içerir.",
    ),
  ],
  [
    L("What do I need to run it?", "Çalıştırmak için ne gerekir?"),
    L(
      "Use a Linux x86-64 server with Docker. The prebuilt image targets linux/amd64. The deployment guide recommends 2–4 vCPU and 4–8 GB RAM; neural speech runs on the server’s CPU. You also need persistent storage, a public hostname and the appropriate signalling and media ports.",
      "Docker kurulu bir Linux x86-64 sunucu kullanın. Hazır imaj linux/amd64 içindir. Kurulum rehberi 2–4 vCPU ve 4–8 GB RAM önerir; nöral konuşma sunucunun işlemcisinde çalışır. Kalıcı depolama, herkese açık bir alan adı ve uygun sinyal ile ortam portları da gerekir.",
    ),
  ],
  [
    L(
      "Can I keep my SIP provider and desk phones?",
      "SIP operatörümü ve masa telefonlarımı kullanabilir miyim?",
    ),
    L(
      "MunaSIP supports registered and IP-based SIP trunks, multiple providers and route failover. Yealink, Fanvil and Grandstream provisioning profiles are documented. Check your provider’s transport, codecs, networking and device configuration before switching.",
      "MunaSIP kayıtlı ve IP tabanlı SIP trunk’ları, birden fazla operatörü ve rota yedeğini destekler. Yealink, Fanvil ve Grandstream hazırlama profilleri belgelidir. Geçmeden önce operatörünüzün taşıma, kodek, ağ ve cihaz ayarlarını kontrol edin.",
    ),
  ],
  [
    L(
      "Does the softphone work on mobile?",
      "Yazılımsal telefon mobilde çalışır mı?",
    ),
    L(
      "The portal works in a mobile browser, but mobile browsers can suspend background tabs. Inbound calls with the screen off are unreliable. For dependable mobile reachability, use a compatible native SIP softphone with QR provisioning. MunaSIP does not ship a first-party mobile app.",
      "Portal mobil tarayıcıda açılır, ancak mobil tarayıcılar arka plandaki sekmeleri durdurabilir. Ekran kapalıyken gelen aramalar güvenilir değildir. Mobil erişim şartsa, QR ile hazırlanan uyumlu bir yerel SIP telefonu kullanın. MunaSIP’in kendi mobil uygulaması yoktur.",
    ),
  ],
  [
    L("Does everything work offline?", "Her şey çevrimdışı çalışır mı?"),
    L(
      "The PBX and your locally stored data run on your infrastructure. EMA provides offline Turkish speech after its models are built into the image. Edge Neural speech, including English, needs outbound internet access during generation. External SIP carriers and integrations have their own network requirements.",
      "Santral ve yerelde tuttuğunuz veri kendi altyapınızda çalışır. EMA, modelleri imaja gömüldükten sonra çevrimdışı Türkçe konuşma sağlar. İngilizce dahil Edge Neural konuşma, üretim sırasında dışarı internet erişimi ister. Dış SIP operatörleri ve entegrasyonların kendi ağ gereksinimleri vardır.",
    ),
  ],
  [
    L(
      "Can I use MunaSIP commercially or contribute?",
      "MunaSIP’i ticari kullanabilir veya katkı verebilir miyim?",
    ),
    L(
      "Yes, the MIT license allows commercial use, modification and redistribution with the copyright notice. You can fork and adapt MunaSIP freely. Visit the official repository for current development and contribution guidance.",
      "Evet. MIT lisansı, telif notu durduğu sürece ticari kullanıma, değiştirmeye ve yeniden dağıtmaya izin verir. MunaSIP’i özgürce çatallayıp uyarlayabilirsiniz. Güncel geliştirme ve katkı için resmi depoya bakın.",
    ),
  ],
];

const highlightsTr = [
  {
    icon: "sound",
    title: "Her dahili için bir sesli mesaj kutusu.",
    text: "Kim aradığını görün, mesajı dinleyin, okundu işaretleyin ve çalışan portalından silin.",
  },
  {
    icon: "phone",
    title: "Operatörünüzün beklediği arayan kimliği.",
    text: "Giden numarayı, hattın kaydındaki SIP kullanıcı adından ayrı ayarlayın.",
  },
  {
    icon: "shield",
    title: "Hazır, santralin hazır olduğu anlamına gelir.",
    text: "Sağlık ucu, PostgreSQL, Asterisk ve arama planı hazır olmadan sistemi sağlıklı saymaz.",
  },
];

export function HomePage({ locale = "en" }: { locale?: Locale }) {
  const L = (en: string, tr: string) => (locale === "tr" ? tr : en);
  const href = (path: string) => pathFor(locale, path);
  const featureList = features(L);
  const faqList = faqs(L);
  const highlights = locale === "tr" ? highlightsTr : releaseHighlights;
  const structured = {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "SoftwareSourceCode"],
    name: "MunaSIP",
    applicationCategory: "CommunicationApplication",
    operatingSystem: "Linux (linux/amd64), Docker",
    softwareVersion: site.version,
    description: L(
      site.description,
      "Küçük ofisler için kendi sunucunuzda çalışan Asterisk santrali. SIP operatörlerini bağlayın, aramaları görsel IVR ile yönlendirin, ekibinize tarayıcı telefonu ve sesli mesaj kutusu verin. Linux sunucunuzda Docker ile çalışır.",
    ),
    url: site.url,
    license: `${site.repo}/blob/main/LICENSE`,
    codeRepository: site.repo,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured) }}
      />
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <a href={site.release} className="release-badge">
            <span className="status-dot" />
            <span className="mono">v{site.version}</span>
            <span className="badge-divider" />
            {L(
              "Voicemail. Caller ID. A stronger core.",
              "Sesli mesaj. Arayan kimliği. Daha sağlam bir çekirdek.",
            )}
            <Icon name="arrow" />
          </a>
          <p className="eyebrow">
            {L(
              "THE SELF-HOSTED COMPANY PBX",
              "KENDİ SUNUCUNUZDA ŞİRKET SANTRALİ",
            )}
          </p>
          <h1 id="hero-title">
            {L("Your calls.", "Aramalarınız.")}
            <br />
            {L("Your flow.", "Akışınız.")}
            <br />
            <span>{L("Your control.", "Kontrolünüz.")}</span>
          </h1>
          <p className="hero-lead">
            {L("Your office phone system.", "Ofisinizin telefon sistemi.")}
            <br className="desktop-break" />{" "}
            {L("On your own infrastructure.", "Kendi altyapınızda.")}
          </p>
          <p className="hero-description">
            {L(
              "Connect your SIP provider, route calls visually and give every desk a browser phone and voicemail inbox. Asterisk-powered, open source, and built for small offices of around 20 extensions.",
              "SIP operatörünüzü bağlayın, aramaları görsel olarak yönlendirin, her masaya tarayıcı telefonu ve sesli mesaj kutusu verin. Asterisk tabanlı, açık kaynak ve yaklaşık 20 dahiliye kadar küçük ofisler için.",
            )}
          </p>
          <div className="button-row">
            <Link className="button primary" href={href("/download/")}>
              {L("Get MunaSIP", "MunaSIP’i alın")} <Icon name="arrow" />
            </Link>
            <Link className="button secondary" href={href("/docs/")}>
              {L("Read the docs", "Belgeleri okuyun")} <Icon name="external" />
            </Link>
          </div>
          <div className="hero-promises">
            <span>
              <Icon name="check" /> {L("Asterisk powered", "Asterisk ile")}
            </span>
            <span>
              <Icon name="check" /> {L("Docker ready", "Docker’a hazır")}
            </span>
            <span>
              <Icon name="check" /> {L("MIT licensed", "MIT lisanslı")}
            </span>
          </div>
        </div>
        <CallMap locale={locale} />
      </section>
      <div className="foundation-strip">
        <div className="container foundation-inner">
          <p>
            {L("ONE SYSTEM.", "TEK SİSTEM.")}
            <br />
            <strong>{L("THE WHOLE CONVERSATION.", "TÜM KONUŞMA.")}</strong>
          </p>
          <span>
            Asterisk <b>22</b>
          </span>
          <span>
            {L("Visual", "Görsel")} <b>IVR</b>
          </span>
          <span>
            {L("Browser", "Tarayıcı")} <b>WebRTC</b>
          </span>
          <span>
            {L("Self-hosted", "Kendi sunucunuzda")} <b>Docker</b>
          </span>
          <span>
            {L("English", "İngilizce")} <b>+ Türkçe</b>
          </span>
        </div>
      </div>

      <section
        className="release-spotlight container"
        aria-labelledby="release-intro"
      >
        <div className="release-heading">
          <div>
            <p className="eyebrow">
              {L("NOW AVAILABLE", "ŞİMDİ HAZIR")} / v{site.version}
            </p>
            <h2 id="release-intro">
              {L(
                "More of the everyday, covered.",
                "Gündelik işlerin daha fazlası kapsandı.",
              )}
            </h2>
          </div>
          <Link className="text-link" href={href("/updates/")}>
            {L("See what changed", "Neler değişti")} <Icon name="arrow" />
          </Link>
        </div>
        <div className="release-cards">
          {highlights.map((item) => (
            <article key={item.title}>
              <Icon name={item.icon} />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
        <nav
          className="product-shortcuts"
          aria-label={L("Explore MunaSIP", "MunaSIP’i gezin")}
        >
          <a href="#panel">
            {L("Explore the interface", "Arayüzü gezin")} <Icon name="arrow" />
          </a>
          <a href="#ivr">
            {L("Follow a call flow", "Bir çağrı akışını izleyin")}{" "}
            <Icon name="arrow" />
          </a>
          <Link href={href("/docs/voicemail/")}>
            {L("Find your messages", "Mesajlarınızı bulun")}{" "}
            <Icon name="arrow" />
          </Link>
          <a href="#install">
            {L("Plan your install", "Kurulumu planlayın")} <Icon name="arrow" />
          </a>
        </nav>
      </section>

      <section className="section container" id="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {L(
                "01 / YOUR PHONE SYSTEM, IN FOCUS",
                "01 / TELEFON SİSTEMİNİZ, NET",
              )}
            </p>
            <h2>
              {L("Less switching tools.", "Daha az araç değiştirin.")}
              <br />
              <span>
                {L("More connecting people.", "Daha çok insanı bağlayın.")}
              </span>
            </h2>
          </div>
          <div>
            <p>
              {L(
                "A clear view of your calls, your team and the routes in between. All in the same admin panel.",
                "Aramalarınız, ekibiniz ve aradaki rotalar. Hepsi aynı yönetici panelinde.",
              )}
            </p>
            <a className="text-link" href={sourceDoc("SCREENS")}>
              {L("Explore the product screens", "Ürün ekranlarını inceleyin")}{" "}
              <Icon name="arrow" />
            </a>
          </div>
        </div>
        <ScreenTour locale={locale} />
        <p className="small muted" style={{ marginTop: 14 }}>
          {L(
            "Animated interface concepts with illustrative sample data.",
            "Örnek verilerle canlandırılmış arayüz taslakları.",
          )}
        </p>
      </section>

      <section className="section features-section" id="features">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {L("02 / BUILT FOR THE OFFICE", "02 / OFİS İÇİN")}
              </p>
              <h2>
                {L("The essentials.", "Temeller.")}
                <br />
                <span>{L("Already on the line.", "Hattın üzerinde.")}</span>
              </h2>
            </div>
            <p>
              {L(
                "From the first ring to the final follow-up.",
                "İlk çaldırmadan son takibe.",
              )}
              <br />
              {L(
                "The everyday tools your team actually needs.",
                "Ekibinizin gerçekten kullandığı gündelik araçlar.",
              )}
            </p>
          </div>
          <div className="feature-grid">
            {featureList.map((feature) => (
              <article className="feature" key={feature.title}>
                <div className="feature-icon">
                  <Icon name={feature.icon} />
                </div>
                <p className="mono feature-label">{feature.label}</p>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
                <div className="feature-tags">
                  {feature.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <a className="text-link feature-more" href={sourceDoc("FEATURES")}>
            {L("The complete feature reference", "Tüm özellik referansı")}{" "}
            <Icon name="arrow" />
          </a>
        </div>
      </section>

      <section className="section container" id="ivr">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {L(
                "03 / VISUAL IVR & NEURAL SPEECH",
                "03 / GÖRSEL IVR VE NÖRAL KONUŞMA",
              )}
            </p>
            <h2>
              {L("Draw the flow.", "Akışı çizin.")}
              <br />
              <span>
                {L("Let the conversation follow.", "Konuşma onu izlesin.")}
              </span>
            </h2>
          </div>
          <p>
            {L(
              "A welcome, a menu, a live API lookup. Build a call experience that knows where to go next.",
              "Bir karşılama, bir menü, canlı bir API sorgusu. Sonraki adımı bilen bir arama deneyimi kurun.",
            )}
          </p>
        </div>
        <div className="ivr-showcase">
          <figure className="image-frame ivr-main-image">
            <div className="frame-label mono">
              <Icon name="flow" />{" "}
              {L("THE VISUAL FLOW DESIGNER", "GÖRSEL AKIŞ TASARIMCISI")}{" "}
              <span>{L("ANIMATED MOCKUP", "CANLI TASLAK")}</span>
            </div>
            <ProductMockup screen="ivr-designer" />
            <figcaption>
              {L(
                "Build, test and publish. Live calls keep the flow version they started with.",
                "Kurun, deneyin, yayınlayın. Süren aramalar başladıkları akış sürümünde kalır.",
              )}
            </figcaption>
          </figure>
          <div className="ivr-notes">
            <article>
              <span className="note-number">01</span>
              <h3>
                {L("Connect the right pieces.", "Doğru parçaları bağlayın.")}
              </h3>
              <p>
                {L(
                  "17 node types for menus, speech, conditions, schedules, queues and more. Each exit has a clear next step.",
                  "Menü, konuşma, koşul, takvim, kuyruk ve daha fazlası için 17 düğüm türü. Her çıkışın net bir sonraki adımı vardır.",
                )}
              </p>
            </article>
            <article>
              <span className="note-number">02</span>
              <h3>
                {L(
                  "Bring your data into the call.",
                  "Verinizi aramaya taşıyın.",
                )}
              </h3>
              <p>
                {L(
                  "Look up a caller in your API. Map JSON responses to variables. Speak the result or route to the right extension.",
                  "Arayanı API’nizde arayın. JSON yanıtlarını değişkenlere eşleyin. Sonucu seslendirin ya da doğru dahiliye yönlendirin.",
                )}
              </p>
            </article>
            <article>
              <span className="note-number">03</span>
              <h3>{L("Find your voice.", "Sesinizi bulun.")}</h3>
              <p>
                {L(
                  "Edge Neural voices for English and Turkish, plus EMA for offline Turkish. Prompts support variables and speech filters.",
                  "İngilizce ve Türkçe için Edge Neural sesler, çevrimdışı Türkçe için EMA. Anonslar değişken ve konuşma süzgeçlerini destekler.",
                )}
              </p>
            </article>
            <Link className="text-link" href={href("/docs/ivr/")}>
              {L("Meet the flow designer", "Akış tasarımcısına bakın")}{" "}
              <Icon name="arrow" />
            </Link>
          </div>
        </div>
        <div
          className="flow-ribbon"
          aria-label={L("Example IVR flow", "Örnek IVR akışı")}
        >
          <span>
            <Icon name="phone" /> {L("Incoming call", "Gelen arama")}
          </span>
          <Icon name="arrow" />
          <span>
            <Icon name="sound" /> {L("Welcome", "Karşılama")}
          </span>
          <Icon name="arrow" />
          <span>
            <Icon name="flow" /> {L("Menu", "Menü")}
          </span>
          <Icon name="arrow" />
          <span>
            <Icon name="code" /> {L("API lookup", "API sorgusu")}
          </span>
          <Icon name="arrow" />
          <span>
            <Icon name="headset" /> {L("Right destination", "Doğru hedef")}
          </span>
        </div>
        <p className="small muted">
          {L(
            "Illustrative call path. API nodes include success and error exits; connect a fallback before publishing.",
            "Örnek bir arama yolu. API düğümlerinin başarı ve hata çıkışları vardır; yayınlamadan önce bir yedek bağlayın.",
          )}
        </p>
      </section>

      <section className="section softphone-section" id="softphone">
        <div className="container softphone-grid">
          <div className="softphone-copy">
            <p className="eyebrow">
              {L(
                "04 / A PHONE, WHERE YOU WORK",
                "04 / ÇALIŞTIĞINIZ YERDE TELEFON",
              )}
            </p>
            <h2>
              {L("Your browser.", "Tarayıcınız.")}
              <br />
              <span>{L("Now taking calls.", "Artık arama alıyor.")}</span>
            </h2>
            <p className="section-lead">
              {L(
                "A full softphone. A personal portal.",
                "Tam bir yazılımsal telefon. Kişisel bir portal.",
              )}
              <br />
              {L(
                "One extension to tie it all together.",
                "Hepsini bir araya getiren tek dahili.",
              )}
            </p>
            <p>
              {L(
                "Dial, answer, hold, mute and transfer from the browser. Move between portal pages while your call stays connected.",
                "Tarayıcıdan arayın, cevaplayın, beklemeye alın, sessize alın ve aktarın. Arama bağlı kalırken portal sayfaları arasında gezinin.",
              )}
            </p>
            <ul className="check-list">
              <li>
                <Icon name="check" />{" "}
                {L(
                  "A mini phone on every portal page",
                  "Her portal sayfasında küçük bir telefon",
                )}
              </li>
              <li>
                <Icon name="check" />{" "}
                {L(
                  "Directory with live coworker presence",
                  "Çalışanların canlı durumunu gösteren rehber",
                )}
              </li>
              <li>
                <Icon name="check" />{" "}
                {L(
                  "Your calls, recordings and voicemail inbox",
                  "Aramalarınız, kayıtlarınız ve sesli mesaj kutunuz",
                )}
              </li>
              <li>
                <Icon name="check" />{" "}
                {L(
                  "Desk phone and browser can ring together",
                  "Masa telefonu ve tarayıcı birlikte çalabilir",
                )}
              </li>
            </ul>
            <Link className="text-link" href={href("/docs/softphone/")}>
              {L("Take a closer look", "Yakından bakın")} <Icon name="arrow" />
            </Link>
            <Link
              className="text-link portal-mailbox-link"
              href={href("/docs/voicemail/")}
            >
              {L("Explore the voicemail inbox", "Sesli mesaj kutusuna bakın")}{" "}
              <Icon name="arrow" />
            </Link>
            <p className="softphone-note">
              {L(
                "HTTPS and microphone access required. Reloading the browser ends the call. Mobile background calling has limitations.",
                "HTTPS ve mikrofon izni gerekir. Tarayıcıyı yenilemek aramayı bitirir. Mobilde arka planda arama sınırlıdır.",
              )}
            </p>
          </div>
          <figure className="softphone-image">
            <span className="mono image-kicker">
              <span className="status-dot" />{" "}
              {L("YOUR EXTENSION. ANY DESK.", "DAHİLİNİZ. HER MASADA.")}
            </span>
            <ProductMockup screen="softphone" phoneOnly />
            <figcaption>
              {L(
                "Browser softphone · animated interface concept",
                "Tarayıcı telefonu · canlandırılmış arayüz taslağı",
              )}
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section container" id="how-it-works">
        <div className="architecture-layout">
          <div>
            <p className="eyebrow">
              {L(
                "05 / KNOW WHAT YOU’RE RUNNING",
                "05 / NE ÇALIŞTIRDIĞINIZI BİLİN",
              )}
            </p>
            <h2>
              {L("Open by design.", "Açık tasarım.")}
              <br />
              <span>{L("Yours to operate.", "İşletmek size ait.")}</span>
            </h2>
            <p className="section-lead">
              {L("A familiar foundation.", "Tanıdık bir temel.")}
              <br />
              {L(
                "A simpler way to bring it together.",
                "Hepsini bir araya getirmenin daha sade yolu.",
              )}
            </p>
            <p>
              {L(
                "Asterisk handles SIP and media. The API runs your call flows and configuration. PostgreSQL stores the state. Your team works in the web app.",
                "SIP ve ortam Asterisk’te. Çağrı akışları ve yapılandırma API’de. Durum PostgreSQL’de. Ekibiniz web uygulamasında çalışır.",
              )}
            </p>
            <div className="architecture-options">
              <div>
                <Icon name="server" />
                <strong>{L("One prebuilt image", "Tek hazır imaj")}</strong>
                <p>
                  {L(
                    "Asterisk, API, web, embedded PostgreSQL and speech. Persist everything under ",
                    "Asterisk, API, web, gömülü PostgreSQL ve konuşma. Her şey ",
                  )}
                  <code>/data</code>
                  {L(".", " altında kalır.")}
                </p>
              </div>
              <div>
                <Icon name="network" />
                <strong>
                  {L("Or Docker Compose", "Ya da Docker Compose")}
                </strong>
                <p>
                  {L(
                    "Run the services together on a Linux VM, with nginx and coturn for the edge and remote media.",
                    "Servisleri bir Linux sanal makinede birlikte çalıştırın; kenar ve uzak ortam için nginx ve coturn.",
                  )}
                </p>
              </div>
            </div>
            <Link className="text-link" href={href("/docs/architecture/")}>
              {L("Look under the hood", "İçine bakın")} <Icon name="arrow" />
            </Link>
          </div>
          <Architecture locale={locale} />
        </div>
      </section>

      <section className="section integration-section">
        <div className="container integration-grid">
          <div>
            <p className="eyebrow">
              {L("06 / PART OF YOUR WORKFLOW", "06 / İŞ AKIŞINIZIN PARÇASI")}
            </p>
            <h2>
              {L("A good connection.", "İyi bir bağlantı.")}
              <br />
              <span>{L("Beyond the phone.", "Telefonun ötesinde.")}</span>
            </h2>
            <p>
              {L(
                "Use an API lookup to recognize a customer. Originate a call from your tools. Send call events to the systems your team already uses.",
                "Müşteriyi tanımak için API sorgusu kullanın. Araçlarınızdan arama başlatın. Arama olaylarını ekibinizin kullandığı sistemlere gönderin.",
              )}
            </p>
            <Link className="text-link" href={href("/docs/integrations/")}>
              {L("Explore integrations", "Entegrasyonlara bakın")}{" "}
              <Icon name="arrow" />
            </Link>
          </div>
          <div className="integration-list">
            <article>
              <Icon name="code" />
              <div>
                <h3>REST API & webhooks</h3>
                <p>
                  {L(
                    "Click-to-call, call records and recordings. HMAC-signed events for ringing, answered, ended and missed calls.",
                    "Tıkla-ara, arama kayıtları ve ses kayıtları. Çalıyor, cevaplandı, bitti ve kaçtı olayları için HMAC imzalı bildirimler.",
                  )}
                </p>
              </div>
              <span className="mono">01</span>
            </article>
            <article>
              <Icon name="monitor" />
              <div>
                <h3>
                  {L(
                    "A call button for your website",
                    "Siteniz için bir arama düğmesi",
                  )}
                </h3>
                <p>
                  {L(
                    "Create an embeddable WebRTC call widget in Admin → Integrations, with an optional callback form.",
                    "Yönetici → Entegrasyonlar’da gömülebilir bir WebRTC arama bileşeni oluşturun; isteğe bağlı geri arama formu da var.",
                  )}
                </p>
              </div>
              <span className="mono">02</span>
            </article>
            <article>
              <Icon name="sound" />
              <div>
                <h3>
                  {L(
                    "Speech that works with your data",
                    "Verinizle çalışan konuşma",
                  )}
                </h3>
                <p>
                  {L(
                    "Use mapped API values in prompts. Format digits, amounts and other values with template filters.",
                    "Eşlenen API değerlerini anonslarda kullanın. Rakam, tutar ve diğer değerleri şablon süzgeçleriyle biçimlendirin.",
                  )}
                </p>
              </div>
              <span className="mono">03</span>
            </article>
          </div>
        </div>
      </section>

      <section className="section container" id="install">
        <div className="install-grid">
          <div>
            <p className="eyebrow">
              {L("07 / YOUR FIRST CONNECTION", "07 / İLK BAĞLANTINIZ")}
            </p>
            <h2>
              {L("One image.", "Tek imaj.")}
              <br />
              <span>
                {L("A whole phone system.", "Bütün bir telefon sistemi.")}
              </span>
            </h2>
            <p className="section-lead">
              {L(
                "Pick a Linux server. Give it a home.",
                "Bir Linux sunucu seçin. Ona bir yer verin.",
              )}
              <br />
              {L("Bring your office online.", "Ofisinizi hatta alın.")}
            </p>
            <ol className="setup-steps">
              <li>
                <span>01</span>
                <div>
                  <h3>{L("Prepare your server.", "Sunucunuzu hazırlayın.")}</h3>
                  <p>
                    {L(
                      "Linux x86-64, Docker, a public hostname and persistent storage. Plan 2–4 vCPU and 4–8 GB RAM.",
                      "Linux x86-64, Docker, herkese açık bir alan adı ve kalıcı depolama. 2–4 vCPU ve 4–8 GB RAM ayırın.",
                    )}
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>
                    {L("Pull, mount and run.", "Çekin, bağlayın, çalıştırın.")}
                  </h3>
                  <p>
                    {L(
                      "Replace the example hostname and IP. Mount a persistent volume at ",
                      "Örnek alan adı ve IP’yi değiştirin. Kalıcı bir birimi ",
                    )}
                    <code>/data</code>
                    {L(
                      " and configure the required ports.",
                      " yoluna bağlayın ve gereken portları ayarlayın.",
                    )}
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>
                    {L("Configure your first call.", "İlk aramanızı kurun.")}
                  </h3>
                  <p>
                    {L(
                      "Set strong credentials, configure HTTPS, add your SIP provider and connect an extension.",
                      "Güçlü kimlik bilgileri koyun, HTTPS’i ayarlayın, SIP operatörünüzü ekleyin ve bir dahili bağlayın.",
                    )}
                  </p>
                </div>
              </li>
            </ol>
            <Link className="text-link" href={href("/docs/getting-started/")}>
              {L(
                "Follow the full installation guide",
                "Kurulum rehberinin tamamını izleyin",
              )}{" "}
              <Icon name="arrow" />
            </Link>
          </div>
          <div className="install-terminal">
            <div className="terminal-eyebrow">
              <span className="mono">{L("PREBUILT IMAGE", "HAZIR İMAJ")}</span>
              <span className="platform-tag">linux/amd64</span>
            </div>
            <CodeBlock code={dockerCommand} title="docker run" />
            <div className="terminal-note">
              <Icon name="shield" />
              <p>
                {L(
                  "The image exposes the app on port 3000. Use an HTTPS proxy for your public hostname. RTP needs UDP 10000–10100; desk-phone SIP may also need port 5060. ",
                  "İmaj uygulamayı 3000 portunda açar. Herkese açık alan adınız için bir HTTPS vekili kullanın. RTP için UDP 10000–10100 gerekir; masa telefonu SIP’i 5060’ı da isteyebilir. ",
                )}
                <Link href={href("/docs/getting-started/#networking")}>
                  {L("Networking details →", "Ağ ayrıntıları →")}
                </Link>
              </p>
            </div>
            <div className="install-links">
              <a href={site.release}>
                {L("Release notes", "Sürüm notları")} <Icon name="external" />
              </a>
              <Link href={href("/download/")}>
                {L("All install options", "Tüm kurulum seçenekleri")}{" "}
                <Icon name="arrow" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="security-band">
        <div className="container security-grid">
          <div className="security-title">
            <Icon name="shield" />
            <p className="eyebrow">
              {L("OWN THE SYSTEM.", "SİSTEM SİZİN.")}
              <br />
              {L("UNDERSTAND THE RESPONSIBILITY.", "SORUMLULUĞU BİLİN.")}
            </p>
          </div>
          <div>
            <h3>
              {L("Access, on your terms.", "Erişim, sizin kurallarınızla.")}
            </h3>
            <p>
              {L(
                "Optional admin TOTP, IP allowlists, login-flood protection and encrypted stored integration secrets.",
                "İsteğe bağlı yönetici TOTP’si, IP izin listeleri, giriş taşkını koruması ve şifreli saklanan entegrasyon sırları.",
              )}
            </p>
          </div>
          <div>
            <h3>{L("Your data has a home.", "Verinizin bir yeri var.")}</h3>
            <p>
              {L(
                "Keep CDR and recordings on your infrastructure. Configure access, retention, archives and your own backups.",
                "CDR ve ses kayıtları kendi altyapınızda kalsın. Erişim, saklama, arşiv ve kendi yedeklerinizi ayarlayın.",
              )}
            </p>
          </div>
          <Link className="text-link" href={href("/docs/security/")}>
            {L("Operate thoughtfully", "Bilinçli işletin")}{" "}
            <Icon name="arrow" />
          </Link>
        </div>
      </section>

      <section className="section container faq-section" id="faq">
        <div>
          <p className="eyebrow">
            {L("A FEW GOOD QUESTIONS", "BİRKAÇ İYİ SORU")}
          </p>
          <h2>
            {L("Before you", "Ahizeyi")}
            <br />
            <span>{L("pick up.", "kaldırmadan.")}</span>
          </h2>
          <p>
            {L(
              "Clear answers, straight from the project.",
              "Net yanıtlar, doğrudan projeden.",
            )}
          </p>
          <Link className="text-link" href={href("/docs/")}>
            {L("Find your next step", "Sonraki adımınızı bulun")}{" "}
            <Icon name="arrow" />
          </Link>
        </div>
        <div className="faq-list">
          {faqList.map(([question, answer], i) => (
            <details key={question}>
              <summary>
                <span className="mono">0{i + 1}</span>
                <h3>{question}</h3>
                <Icon name="plus" />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="closing-section">
        <div className="container closing-inner">
          <div>
            <p className="eyebrow">
              {L(
                "GOOD CONVERSATIONS START SOMEWHERE.",
                "İYİ KONUŞMALAR BİR YERDEN BAŞLAR.",
              )}
            </p>
            <h2>
              {L("Make the next one", "Sonrakini")}
              <br />
              <span>{L("on your terms.", "kendi kurallarınızla kurun.")}</span>
            </h2>
            <p>
              {L(
                "Open source. Self-hosted. Ready for your office.",
                "Açık kaynak. Kendi sunucunuzda. Ofisinize hazır.",
              )}
            </p>
          </div>
          <div className="closing-actions">
            <Link className="button primary" href={href("/download/")}>
              {L("Let’s get connected", "Hatta bağlanalım")}{" "}
              <Icon name="arrow" />
            </Link>
            <a className="text-link" href={site.repo}>
              <Icon name="github" /> {L("Explore the source", "Kaynağa bakın")}{" "}
              <Icon name="external" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
