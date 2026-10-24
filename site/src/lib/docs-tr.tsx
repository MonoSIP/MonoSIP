import { Architecture } from "@/components/architecture";
import { CodeBlock } from "@/components/code-block";
import { Icon } from "@/components/icon";
import { ProductMockup } from "@/components/product-mockup";
import Link from "next/link";
import { pathFor } from "./locale";
import { composeCommand, dockerCommand, site, sourceDoc } from "./site";

function Callout({
  children,
  warning = false,
}: {
  children: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <div className={`callout ${warning ? "warning" : ""}`}>
      <Icon name="shield" />
      <div>{children}</div>
    </div>
  );
}
function Table({ headings, rows }: { headings: string[]; rows: string[][] }) {
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label={headings.join(", ")}
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            {headings.map((heading) => (
              <th key={heading} scope="col">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const href = (path: string) => pathFor("tr", path);

export const docsTr = {
  "getting-started": {
    title: "İlk bağlantınız.",
    summary:
      "MunaSIP’i Linux sunucunuzda çalıştırın, temel ayarları yapın ve ilk dahilinizi bağlayın.",
    source: "INSTALL",
    sections: [
      {
        id: "requirements",
        title: "Doğru sunucuyla başlayın",
        content: (
          <>
            <p>
              Desteklenen üretim yolu, bir Linux sanal makinede Docker’dır.
              Hazır imaj <code>linux/amd64</code> için yayımlanır; paketlenmiş
              EMA konuşma bağımlılıkları AMD64’e özeldir. macOS laboratuvarı
              paneli gezmek için işe yarar, önerilen SIP/RTP kurulumu değildir.
            </p>
            <Table
              headings={["Gereksinim", "Yön"]}
              rows={[
                [
                  "İşletim sistemi",
                  "x86-64 üzerinde Debian 12/13 veya Ubuntu 22.04+, Docker Engine ve Compose v2 ile.",
                ],
                [
                  "İşlemci ve bellek",
                  "Yaklaşık 20 dahililik küçük bir ofis için 2–4 vCPU ve 4–8 GB RAM ayırın. Konuşma sentezi santral işlemcisini kullanır.",
                ],
                [
                  "Kimlik",
                  "Herkese açık bir IPv4 adresi ve sunucuyu gösteren bir alan adı.",
                ],
                [
                  "Depolama",
                  "Hepsi bir arada imaj için /data üzerinde gerçek bir kalıcı birim. Kayıt ve yedekleri saklama politikanıza göre boyutlandırın.",
                ],
              ]}
            />
          </>
        ),
      },
      {
        id: "docker",
        title: "Seçenek 1: hazır Docker imajı",
        content: (
          <>
            <p>
              Hepsi bir arada imaj web panelini, API’yi, Asterisk’i, gömülü
              PostgreSQL’i ve konuşma motorlarını içerir. Aşağıdaki komut{" "}
              {site.version} sürümünü sabitler. <code>203.0.113.10</code> ve{" "}
              <code>pbx.example.com</code> değerlerini kendi herkese açık IP’niz
              ve alan adınızla değiştirin.
            </p>
            <CodeBlock code={dockerCommand} title="docker run" />
            <p>
              Uygulama portu 3000’i, herkese açık alan adınız için bir HTTPS
              ters vekilinin arkasına alın. Tarayıcıdan arama HTTPS, çalışan WSS
              sinyali ve erişilebilir ortam portları ister. İmaj,{" "}
              <code>DATABASE_URL</code> ile yönetilen bir PostgreSQL de
              kullanabilir.
            </p>
            <Callout>
              <p>
                <code>/data</code> birimini ve{" "}
                <code>/data/.munasip-secrets</code> dosyasını yedekleyin.
                Veritabanı, üretilen yapılandırma, ses kayıtları ve şifreli
                sırları okumak için gereken anahtarlar buradadır. Herkese açık
                bir alan adıyla açılış, veri dizininin gerçek bir birim olduğunu
                kontrol eder.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: "compose",
        title: "Seçenek 2: Docker Compose ile derleyin",
        content: (
          <>
            <p>
              Compose, servisleri nginx ve coturn ile çalıştırır. Kenar ve ortam
              yığınının tamamını kontrol etmek için belgelenen yol budur.
              Aşağıdaki sertifika betiği bir laboratuvar sertifikası üretir.
              Herkese açık işletimde alan adınızı, güçlü sırları ve güvenilen
              bir HTTPS sertifikasını ayarlayın.
            </p>
            <CodeBlock code={composeCommand} title="Docker Compose" />
            <p>
              Laboratuvar paneli <code>https://localhost</code> adresinde
              açılır. Üretim için yığını başlatmadan <code>.env</code> dosyasını
              düzenleyin. <code>EXTERNAL_IP</code>, <code>PUBLIC_HOST</code>,{" "}
              <code>PUBLIC_URL</code>, <code>SIP_DOMAIN</code>,{" "}
              <code>SIP_WSS_URL</code>, veritabanı kimlik bilgileri, oturum ve
              şifreleme anahtarları ile yönetici parolasını koyun. Tam
              yapılandırma için{" "}
              <a href={sourceDoc("DEPLOY-VPS")}>VPS rehberine</a> bakın.
            </p>
          </>
        ),
      },
      {
        id: "networking",
        title: "Sinyali ve sesi bağlayın",
        content: (
          <>
            <p>
              Açılan bir web paneli, arama sesinin çalıştığını göstermez. SIP
              sinyali, tarayıcı WSS’i ve RTP ortamı ayrı yollardan gider. SIP
              erişimini mümkün olduğunca ofis, VPN ve operatör adresleriyle
              sınırlayın.
            </p>
            <Table
              headings={["Port / yol", "Amaç", "Kurulum notu"]}
              rows={[
                [
                  "3000/TCP",
                  "Hepsi bir arada uygulama / API",
                  "Güvenilen bir HTTPS vekilinin arkasında yayınlayın. Tarayıcı sinyali için /asterisk-ws yolunu vekilleyin.",
                ],
                [
                  "443/TCP",
                  "Herkese açık HTTPS ve WSS",
                  "Compose’ta bunu nginx karşılar. Compose, 443 üzerinde TURNS’ü de çoğullayabilir.",
                ],
                [
                  "80/TCP",
                  "ACME HTTP-01 / yönlendirme",
                  "Otomatik Let’s Encrypt HTTP-01 kullanıyorsanız sunucuya ulaşmalıdır.",
                ],
                [
                  "10000–10100/UDP",
                  "Asterisk RTP sesi",
                  "Yayınlayın ve EXTERNAL_IP’yi doğru koyun; güvenlik duvarını gereken ortam uçlarına daraltın.",
                ],
                [
                  "5060/UDP veya TCP",
                  "Masa telefonu / operatör SIP",
                  "Hızlı komut bunu yayınlamaz; gerektiğinde ekleyin ve kaynakları kısıtlayın.",
                ],
                [
                  "TURN / TURNS",
                  "Uzak WebRTC ortam aktarımı",
                  "Compose coturn içerir. Yalnızca bir HTTPS vekili, ortam aktarımının yerini tutmaz.",
                ],
              ]}
            />
            <p>
              Compose ALPN çoğullaması olmayan bir platform kenarında, RTP
              gerçekten yayınlanıyorsa kurulum rehberi{" "}
              <code>MUNASIP_RTP_PUBLISHED=1</code> değerini, bilinçli yalnızca
              STUN kurulumu için <code>MUNASIP_TURNS_ON_443=0</code> değerini
              belgeler. İkisini de uygulamadan önce ağınızı gözden geçirin.
            </p>
          </>
        ),
      },
      {
        id: "readiness",
        title: "Web sayfasını değil, santrali kontrol edin",
        content: (
          <>
            <p>
              v1.7.5’ten beri sağlık ucu, veritabanı, Asterisk ve üretilen arama
              planı hazır olana kadar sağlıksız kalır. Kayıt denemeden veya
              arama yapmadan önce bunu bekleyin.
            </p>
            <CodeBlock
              code="curl --fail https://pbx.example.com/api/v1/health"
              title="Servis hazırlığını kontrol edin"
            />
            <p>
              Kendi alan adınızı kullanın. Uç sağlıklı değilse, erişilen bir
              giriş sayfasını çalışan santral saymadan önce konteyner
              günlüklerine ve kalıcı birime bakın.
            </p>
          </>
        ),
      },
      {
        id: "first-call",
        title: "İlk konuşmayı kurun",
        content: (
          <>
            <ol>
              <li>
                Yönetici paneline girin. Laboratuvar varsayılanları{" "}
                <code>admin@example.com</code> / <code>Admin123!</code>;
                kurulumu açmadan önce bunları değiştirin.
              </li>
              <li>
                Alan adını koyun ve güvenilen HTTPS’i ayarlayın. Compose
                kurulumunda Yönetici → Ayarlar → Alan adı ve SSL, otomatik Let’s
                Encrypt sertifikası sunar.
              </li>
              <li>
                SIP operatörünüzü ekleyin, sonra gelen DID’leri ve giden
                rotaları yapılandırın.
              </li>
              <li>
                Dahilileri oluşturun veya gözden geçirin. Her dahili, portal ve
                SIP için tek parola kullanır. Ekilen laboratuvar parolalarını
                değiştirin.
              </li>
              <li>
                Bir dahiliyle portala girin. Mikrofon iznini verin, kaydı
                doğrulayın ve sesi iki yönde de deneyin.
              </li>
              <li>
                Başka bir dahiliyi arayın, sonra gerçek operatör rotanızı,
                kuyruğunuzu, mesai dışı hedefinizi ve kayıt politikanızı
                deneyin.
              </li>
            </ol>
            <Callout warning>
              <p>
                Bu site kurulumu belgeler; santralinizi çalıştırmaz veya
                denemez. Kesintisiz geçişten önce operatörü, NAT’ı, sesi, arayan
                kimliğini ve kurtarma yolunu kendi altyapınızda doğrulayın.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: "updates",
        title: "Durumu kaybetmeden güncelleyin",
        content: (
          <>
            <p>
              Önce yedek alın. Seçilen imaj etiketini çekin ve konteyneri aynı
              ortam, portlar ve kalıcı birimle yeniden oluşturun. Yalnızca imaj
              çekmek çalışan konteynerin yerini almaz.
            </p>
            <CodeBlock
              code={`docker pull ${site.image}\n# Servisi aynı /data birimi ve yapılandırmayla yeniden oluşturun.`}
              title="imaj güncellemesi"
            />
            <p>
              Compose’ta adlandırılmış birimler, yeniden derlemelerde durumu
              tutar. <code>docker compose down</code> birimleri korur;{" "}
              <code>-v</code> eklemek onları siler. Taşıma ve yedek ayrıntıları
              için <a href={sourceDoc("INSTALL")}>kurulum rehberine</a> bakın.
            </p>
          </>
        ),
      },
    ],
  },
  architecture: {
    title: "Her bileşen, bağlı.",
    summary:
      "Ortam için Asterisk. Akışlarınız için bir API. Ekip için bir web arayüzü. İşlettiğiniz sistemi anlayın.",
    source: "ARCHITECTURE",
    sections: [
      {
        id: "overview",
        title: "İki düzlem, tek telefon sistemi",
        content: (
          <>
            <p>
              Ortam düzlemi PJSIP, ARI ve AMI ile Asterisk 22’dir. Kontrol
              düzlemi Asterisk yapılandırmasını yazan ve IVR grafiklerini
              çalıştıran bir Node/Fastify API’sidir. Çalışanlar ve yöneticiler
              React web uygulamasını kullanır.
            </p>
            <Architecture locale="tr" />
            <p>
              Şema, Docker Compose servis yerleşimini gösterir. Hepsi bir arada
              imaj uygulamayı, Asterisk’i, gömülü PostgreSQL’i ve konuşma süreç
              ağacını toplar; Compose ayrı servisler, bir nginx kenarı ve coturn
              sağlar.
            </p>
          </>
        ),
      },
      {
        id: "call-path",
        title: "Bir aramayı izleyin",
        content: (
          <>
            <ol>
              <li>
                Bir SIP operatörü veya telefon, ayarlanan taşıma ve ortam
                portlarıyla Asterisk’e ulaşır.
              </li>
              <li>
                Gelen rotalar bir hedef seçer: dahili, zil grubu, kuyruk, IVR,
                takvim veya desteklenen başka bir hedef.
              </li>
              <li>
                API’nin ARI akış motoru yayımlanmış IVR grafiğini çalıştırır.
                Düğümler anons çalabilir, tuş toplayabilir, bir API
                sorgulayabilir ve hedef seçebilir.
              </li>
              <li>
                Asterisk bağlı ortamı ve ayarlanan MixMonitor kaydını yürütür.
              </li>
              <li>
                AMI/ARI olayları canlı durumu ve günlükleri API üzerinden
                besler. WebSocket güncellemeleri panele ve portala ulaşır.
              </li>
            </ol>
            <p>
              Tarayıcı telefonu <code>/asterisk-ws</code> üzerinden WSS ile
              kaydolur. WebRTC ortamı DTLS-SRTP kullanır; coturn ofis dışındaki
              ortam geçişini destekler.
            </p>
          </>
        ),
      },
      {
        id: "services",
        title: "Her servis neyi üstlenir",
        content: (
          <Table
            headings={["Bileşen", "Sorumluluk"]}
            rows={[
              [
                "nginx (Compose)",
                "HTTPS, ACME, web uygulaması, API ve Asterisk WSS için ters vekil; isteğe bağlı TURNS çoğullaması.",
              ],
              [
                "Web",
                "Yönetici ve çalışan portalı; tarayıcı telefonu SIP.js kullanır.",
              ],
              [
                "Fastify API",
                "Oturumlar, entegrasyon API’si, ARI akış yürütmesi, yapılandırma üretimi, sertifika istemcisi ve arka plan işleri.",
              ],
              [
                "Asterisk 22",
                "SIP uçları, kuyruklar, arama planı, çağrı kontrolü ve ortam/kayıt.",
              ],
              [
                "PostgreSQL",
                "Dahililer, rotalar, akışlar, CDR ve ayarlar için doğruluk kaynağı.",
              ],
              [
                "Konuşma motorları",
                "Edge Neural çevrimiçi sentez ve gömülü EMA çevrimdışı Türkçe sentez.",
              ],
              [
                "coturn (Compose)",
                "Uzak tarayıcı telefonları için TURN aktarımı.",
              ],
            ]}
          />
        ),
      },
      {
        id: "persistence",
        title: "Kalıcılık mimarinin parçasıdır",
        content: (
          <>
            <p>
              Tek imaj, gömülü veritabanı, ayarlar, sırlar, Asterisk
              yapılandırması ve ses kayıtları için <code>/data</code> kullanır.
              Compose’ta adlandırılmış birimler <code>pgdata</code>,{" "}
              <code>recordings</code>, <code>uploads</code> ve{" "}
              <code>asterisk_config</code> içerir; sertifikalar bağlama ile
              takılır.
            </p>
            <p>
              Birim kalıcılıktır, yedek değildir. Veritabanı dışa aktarmalarını,
              kayıt arşivlerini ve şifreleme anahtarlarının kurtarılmasını
              planlayın. Geri yüklemeyi sıradan bir uygulama yeniden
              başlatmasından ayrı deneyin.
            </p>
          </>
        ),
      },
      {
        id: "boundaries",
        title: "Sınırları bilin",
        content: (
          <>
            <p>
              MunaSIP yaklaşık 20 dahililik küçük bir ofisi hedefler. Belgeli
              otomatik yüksek erişilebilirlik kümesi değildir. Operatör tarafı
              yedekleme, santral sunucusu veya uplink düşerse gelen aramaları
              yönlendirebilir.
            </p>
            <p>
              Belgeli kapsam görüntülü toplantı, ekip sohbeti, WhatsApp,
              öngörülü arama veya birinci taraf masaüstü/mobil uygulama içermez.
              Dış araçları uygun yerde API ve webhook ile bağlayın.
            </p>
          </>
        ),
      },
    ],
  },
  ivr: {
    title: "Konuşmayı tasarlayın.",
    summary:
      "Arama rotalarınızı görsel tuvalde kurun, akışa veri getirin ve değişiklikleri net bir yedekle yayınlayın.",
    source: "FLOW-DESIGNER",
    sections: [
      {
        id: "canvas",
        title: "Aramanın bütününün haritası",
        content: (
          <>
            <p>
              Düğümleri tuvale sürükleyin ve her çıkışı sonraki adıma bağlayın.
              Akışlar JSON olarak saklanır ve API’nin ARI motoru tarafından
              çalıştırılır. Taslak, canlı aramaların kullandığı yayımlanmış
              sürümden ayrıdır.
            </p>
            <figure className="image-frame">
              <ProductMockup screen="ivr-designer" />
              <figcaption>
                Canlandırılmış arayüz taslağı. Demo değerler örnek bir akışı
                anlatır.
              </figcaption>
            </figure>
          </>
        ),
      },
      {
        id: "nodes",
        title: "17 düğüm türü, net çıkışlar",
        content: (
          <Table
            headings={["Düğüm", "Kullanım"]}
            rows={[
              [
                "Başlangıç",
                "Giriş noktası; arayan, did ve zaman değişkenleri.",
              ],
              [
                "Anons / TTS",
                "Bir WAV anonsu çalın veya şablon metni seslendirin.",
              ],
              [
                "Menü / Tuş al",
                "DTMF rakamlarını toplayın; zaman aşımı ve geçersiz girişi ele alın.",
              ],
              [
                "API isteği",
                "Bir HTTP isteği yapın ve JSON yanıt değerlerini eşleyin.",
              ],
              [
                "Eğer / Değişken ata",
                "Veriye göre dallanın veya akış değişkenlerini güncelleyin.",
              ],
              [
                "Bekle / Dil",
                "İsteğe bağlı bekleme müziğiyle bekleyin; anons dilini değiştirin.",
              ],
              [
                "Takvim / Rehber",
                "Mesai saatine göre seçin veya isme göre arayın.",
              ],
              ["Alt akış", "Başka bir akışı çalıştırıp geri dönün."],
              [
                "Aktar / Kuyruk",
                "Bir dahiliye veya hedefe bağlayın ya da kuyruğa alın.",
              ],
              ["Sesli mesaj / Kapat", "Mesaj bırakın veya aramayı bitirin."],
            ]}
          />
        ),
      },
      {
        id: "api-node",
        title: "Canlı bir API bağlayın",
        content: (
          <>
            <p>
              API isteği düğümü GET, POST, PUT, PATCH ve DELETE’i, şablonlu
              adres/başlık/gövdeleri ve JSON yollarıyla yanıt eşlemeyi
              destekler. Kimlik doğrulama Bearer, Basic veya özel bir başlık
              olabilir. Kimlik bilgilerini akış JSON’unda değil, Ayarlar →
              Sırlar’da tutun.
            </p>
            <p>
              Varsayılan zaman aşımı 3 saniye, üst sınır 10 saniyedir; isteğe
              bağlı tek yeniden deneme vardır. Zaman aşımları, başarısız
              yanıtlar ve ayrıştırılamayan veri hata çıkışını izler. Bu çıkış
              bağlı değilken akış yayımlanamaz.
            </p>
            <CodeBlock
              code={
                '# API isteği düğümündeki kavramsal eşleme\n# Yanıt: {"customer": true, "agent": "201"}\n$.customer  -> known_customer\n$.agent     -> agent\n\n# Sonraki: koşul -> eşlenen temsilciye aktar\n# Hata: genel destek kuyruğuna yönlendir'
              }
              title="API düğümü eşlemesi"
            />
            <figure className="image-frame">
              <ProductMockup screen="ivr-api-settings" />
              <figcaption>
                İsteği yapılandırın ve eşlenen değerleri tasarımcıda deneyin.
              </figcaption>
            </figure>
          </>
        ),
      },
      {
        id: "speech",
        title: "Hatta doğru sözcükleri koyun",
        content: (
          <>
            <p>
              Konuşma ve API şablonlarında <code>{"$name"}</code> veya{" "}
              <code>{"{{name}}"}</code> kullanın. Süzgeçler değerleri
              biçimlendirir; <code>digits</code>, <code>round</code>,{" "}
              <code>amount</code>, <code>province</code> ve <code>ascii</code>{" "}
              dahildir. Anonslar cümle cümle sentezlenir ve önbelleğe alınır.
            </p>
            <Table
              headings={["Motor", "Dil / bağlantı"]}
              rows={[
                [
                  "Edge Neural",
                  "İngilizce ve Türkçe sesler; üretim sırasında internet erişimi gerekir.",
                ],
                [
                  "EMA Lightning",
                  "Çevrimdışı Türkçe nöral konuşma; ağırlıklar imaja gömülüdür. Santral işlemcisini kullanır.",
                ],
              ]}
            />
            <Callout>
              <p>
                Çevrimdışı İngilizce sentez sağlanmaz. Edge konuşması, sentez
                isteklerini dış bir servise gönderir. Motorları ve anons
                içeriğini kendi gizlilik gereksinimlerinize göre seçin.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: "publishing",
        title: "Deneyin, yayınlayın, geri alın",
        content: (
          <>
            <ol>
              <li>
                Eksik hedefleri, bağlı olmayan çıkışları, ulaşılamayan düğümleri
                ve alt akışlar dahil döngüleri doğrulayın.
              </li>
              <li>
                Arayan, DID, tarih/saat ve tuş takımı girişlerini simüle edin.
                Değişkenleri ve ziyaret edilen adımları inceleyin. Sahte API
                JSON’u veya gerçek bir test ucunu bilinçli kullanın.
              </li>
              <li>
                Gözden geçirilmiş taslağı yayınlayın. Süren aramalar
                başladıkları sürümde biter.
              </li>
              <li>
                Geri alma için sürüm geçmişini tutun ve kendi kayıtlarınız için
                JSON dışa aktarın.
              </li>
            </ol>
            <p>
              Simülasyon mantığı incelemeye yardım eder. İş aramalarını yeni bir
              akışa yönlendirmeden önce gerçek ortamı, zamanlamaları ve operatör
              rotalarını kendi santralinizde deneyin.
            </p>
          </>
        ),
      },
    ],
  },
  softphone: {
    title: "Dahiliniz, tarayıcıda.",
    summary:
      "Kişisel bir portala girin, arama yapın ve sayfaları arasında gezerken konuşmayı bağlı tutun.",
    source: "USER-PORTAL",
    sections: [
      {
        id: "sign-in",
        title: "Tek dahili, tek giriş",
        content: (
          <>
            <p>
              Çalışanlar, yöneticinin koyduğu veya ürettiği parolayla dahili
              numarasıyla girer. Aynı parola portal ve SIP erişimi içindir.
              Değiştirmek ikisini de günceller; masa telefonları yeni değeri
              ister, tarayıcı bir sonraki girişte alır.
            </p>
            <p>
              Portal erişimi dahili başına ayarlanır. Laboratuvar parolalarını
              değiştirin ve güçlü bir sır kullanın: parola SIP kaydını da korur.
            </p>
          </>
        ),
      },
      {
        id: "calling",
        title: "Gündelik arama denetimleri",
        content: (
          <>
            <p>
              Yazılımsal telefon arama, cevaplama, DTMF, bekletme, sessize alma,
              kör aktarma ve katılımlı aktarmayı destekler. Mikrofon, hoparlör
              ve zil cihazlarını portalda seçin. Rehber boşta, meşgul veya
              DND’deki çalışma arkadaşlarını gösterir.
            </p>
            <figure className="image-frame">
              <ProductMockup screen="softphone" />
              <figcaption>
                Örnek dahili verisiyle canlandırılmış portal taslağı.
              </figcaption>
            </figure>
            <p>
              Telefon portal yerleşimine aittir. Portal sayfaları arasında
              gezinmek kaydı ve süren aramayı tutar; diğer sayfalarda küçük
              telefon cevap, ret, sessiz ve kapat sunar.
            </p>
            <Callout warning>
              <p>
                Tarayıcı sekmesini yenilemek veya kapatmak aramayı bitirir.
                Sayfadan sayfaya portal gezintisi ile tam tarayıcı yenilemesi
                farklı işlemlerdir.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: "personal-tools",
        title: "Kendi aramalarınız için bir portal",
        content: (
          <>
            <ul>
              <li>
                Gelen, giden ve kaçan arama geçmişi; tek tıkla geri arama dahil.
              </li>
              <li>
                Katıldığınız aramaların kayıtları, yöneticinin dinlemeye izin
                verdiği yerde. Portal dinleme sunar, yönetici indirme denetimi
                sunmaz.
              </li>
              <li>
                Arayan kimliği, oynatma, okundu durumu ve silme ile sesli mesaj
                kutusu.
              </li>
              <li>Cevapsız, meşgul ve ulaşılamaz yönlendirme, ayrıca DND.</li>
              <li>Rehber durumu ve gelen arama bildirimleri.</li>
            </ul>
            <p>
              Bir tarayıcı ve masa telefonu aynı dahili için çalabilir. İlk
              cevaplayan cihaz aramayı tutar.
            </p>
          </>
        ),
      },
      {
        id: "requirements",
        title: "HTTPS, mikrofon ve ortam",
        content: (
          <>
            <p>
              Mikrofon güvenli bir HTTPS bağlamı ve tarayıcı izni ister. SIP
              sinyali WSS üzerinden gider, WebRTC ortamı DTLS-SRTP kullanır.
              Uzak ağlar ayarlanan TURN/TURNS aktarımına ihtiyaç duyabilir.
            </p>
            <p>
              Mikrofon izni sunucu güvenlik duvarını yapılandırmaz. Kaydı ve
              çift yönlü sesi, ofis ağı dışından da ayrıca deneyin.
            </p>
          </>
        ),
      },
      {
        id: "mobile",
        title: "Mobil arka plan davranışını anlayın",
        content: (
          <>
            <p>
              Mobil tarayıcılar sekme arka plana düşünce veya ekran kapanınca
              sekmeyi durdurabilir; bu durumda gelen tarayıcı aramaları
              güvenilir değildir. Mobil erişim şartsa, QR ile hazırlanan uyumlu
              bir yerel SIP telefonu kullanın ve davranışı kendi cihazlarınızda
              doğrulayın.
            </p>
            <p>
              MunaSIP birinci taraf mobil veya masaüstü uygulaması sunmaz.
              Yealink, Fanvil ve Grandstream masa telefonları için belgeli
              hazırlama profilleri sunar.
            </p>
          </>
        ),
      },
    ],
  },
  voicemail: {
    title: "Her mesaj, elinizin altında.",
    summary:
      "Cevapsız aramaları bir dahiliye ait kutuya gönderin, sonra mesajları çalışan portalından dinleyip yönetin. v1.7.5 ile gelir.",
    source: "USER-PORTAL",
    sections: [
      {
        id: "routing",
        title: "Cevapsız aramalara bir hedef verin",
        content: (
          <>
            <p>
              Çağrı akışınızda veya dahili yönlendirmede hedef olarak sesli
              mesajı seçin. Cevapsız, meşgul ve ulaşılamaz yönlendirme ayrı
              kurallardır; her durumu ayrı ele alabilirsiniz.
            </p>
            <p>
              Dahili izinleri yine geçerlidir. Bir mobile veya dış numaraya
              yönlendirmek, yöneticinin o hedefe izin vermesini gerektirir.
            </p>
            <Link className="text-link" href={href("/docs/ivr/")}>
              IVR’nize bir sesli mesaj adımı bağlayın →
            </Link>
          </>
        ),
      },
      {
        id: "inbox",
        title: "Kendi sesli mesaj kutunuzu açın",
        content: (
          <>
            <p>
              Dahili numaranızla girin ve Sesli mesajı açın. v{site.version}{" "}
              portalı arayanı ve mesaj zamanını listeler, okunmamış mesajları
              ayırır ve bir mesaj seçince oynatıcıyı açar.
            </p>
            <figure className="image-frame">
              <ProductMockup screen="voicemail" />
              <figcaption>
                Örnek arayanlarla açıklayıcı bir kutu. Buradaki oynatma bir
                canlandırmadır, canlı ses değildir.
              </figcaption>
            </figure>
            <ol>
              <li>
                Oynatıcıyı açmak ve okundu işaretlemek için bir mesaj seçin.
              </li>
              <li>Portalda dinleyin; kutu, giriş yapan dahiliye aittir.</li>
              <li>
                Mesajı kaldırmak istediğinizde Sil’i kullanın ve onaylayın.
              </li>
            </ol>
          </>
        ),
      },
      {
        id: "recordings",
        title: "Kutu, arama kaydından farklıdır",
        content: (
          <>
            <p>
              Sesli mesaj, bir dahiliye bırakılan mesajdır. Arama kayıtları,
              çalışanın katıldığı konuşmaların kayıtlarıdır ve yöneticinin
              dinleme izinlerine bağlıdır. Portaldaki arama kaydı oynatıcısı
              yalnızca dinlemeye açıktır.
            </p>
            <p>
              Kalıcı veriyi ve kayıt depolamasını birlikte yedekleyin.
              Konteyneri mevcut birimiyle yeniden oluşturmak durumu korur;
              birimi silmek korumaz.
            </p>
          </>
        ),
      },
      {
        id: "development",
        title: "Sonraki portal iyileştirmelerini izleyin",
        content: (
          <>
            <p>
              Ana dal satır içi dalga biçimleri, duyulmamış sayıları ve kayıtlı
              sesli mesaj karşılama anonslarını ekler. Bu sürüm sonrası
              değişiklikler, bu rehberlerin kullandığı v{site.version}{" "}
              anlığından ayrı izlenir.
            </p>
            <Link className="text-link" href={href("/updates/#main-work")}>
              Geliştirmede olanlara bakın →
            </Link>
          </>
        ),
      },
    ],
  },
  integrations: {
    title: "Doğru bağlantıları kurun.",
    summary:
      "Arama olaylarını araçlarınıza taşıyın, iş akışınızdan arama başlatın ve IVR’de kendi verinizi kullanın.",
    source: "API",
    sections: [
      {
        id: "surfaces",
        title: "Doğru API yüzeyini seçin",
        content: (
          <>
            <p>
              MunaSIP oturumla doğrulanan yönetici API’sini, dahiliyle
              doğrulanan portal API’sini ve API anahtarıyla doğrulanan
              entegrasyon API’sini ayırır. Dış entegrasyonlar{" "}
              <code>/api/v1/ext</code> kullanır.
            </p>
            <Table
              headings={["Entegrasyon ucu", "Amaç"]}
              rows={[
                [
                  "POST /api/v1/ext/calls/originate",
                  "Tıkla-ara: önce bir dahiliyi çaldırın, sonra hedefi arayın.",
                ],
                ["GET /api/v1/ext/cdr", "Arama ayrıntı kayıtlarını okuyun."],
                [
                  "GET /api/v1/ext/recordings/:id/stream",
                  "Gerekli anahtar izinleriyle bir kaydı akıtın.",
                ],
              ]}
            />
            <p>
              API anahtarlarını Yönetici → Entegrasyonlar’da oluşturup yönetin.
              Kimlik doğrulama, izinler ve istek gövdeleri için{" "}
              <a href={sourceDoc("API")}>API sözleşmesine</a> ve güncel uygulama
              şemalarına bakın.
            </p>
          </>
        ),
      },
      {
        id: "webhooks",
        title: "Araçlarınız ne olduğunu bilsin",
        content: (
          <>
            <p>
              Webhook olayları çalan, cevaplanan, biten ve kaçan aramaları
              kapsar. Proje HMAC imzalı gövdeler ve üç yeniden deneme belgeler.
              Alıcınızda özgünlüğü doğrulamak için ayarlanan webhook sırrını
              kullanın ve olay işlemeyi tekrar etmeye dayanıklı yapın.
            </p>
            <CodeBlock
              code={"call.ringing\ncall.answered\ncall.ended\ncall.missed"}
              title="webhook olayları"
            />
            <p>
              Örneğin kendi CRM entegrasyonunuz, çalma olayında arayanın kaydını
              açabilir. Bu bir entegrasyon örüntüsüdür, paketlenmiş bir CRM
              bağlayıcısı değildir.
            </p>
          </>
        ),
      },
      {
        id: "ivr-lookups",
        title: "Verinizi IVR’nin içinde kullanın",
        content: (
          <>
            <p>
              Bir API isteği düğümü müşteriyi arayabilir, yanıt alanlarını
              değişkenlere eşleyebilir ve sonraki hedefi seçebilir. API kimlik
              bilgilerini şifreli Ayarlar → Sırlar’da tutun. Başarısız, yavaş
              veya bozuk yanıtlar için bir hata rotası verin.
            </p>
            <p>
              Arayanın beklemeyi anlaması için sorguya kısa bir anons eşleyin.
              Gerçek bir uca bağlamadan önce sahte veriyle simüle edin. İstek
              yöntemleri, eşleme ve zaman aşımı için{" "}
              <Link href={href("/docs/ivr/#api-node")}>IVR rehberine</Link>{" "}
              bakın.
            </p>
          </>
        ),
      },
      {
        id: "widget",
        title: "Sitenize bir arama düğmesi koyun",
        content: (
          <>
            <p>
              Yönetici → Entegrasyonlar’da bir site arama bileşeni oluşturun ve
              üretilen gömme kodunu kopyalayın. Tarayıcı WebRTC araması kullanır
              ve isteğe bağlı bir geri arama formu destekler.
            </p>
            <CodeBlock
              code={
                '<!-- Örnek biçim: santralinizin ürettiği gerçek gömme kodunu kullanın. -->\n<script\n  src="https://pbx.example.com/widget.js"\n  data-widget="YOUR_GENERATED_WIDGET_ID">\n</script>'
              }
              title="site bileşeni"
              language="html"
            />
            <p>
              Bileşenin ortam bağlantısı yine santralinizin HTTPS, WSS ve
              RTP/TURN kurulumunu ister. Bu ürün sitesi canlı bir bileşen gömmez
              ve mikrofon izni istemez.
            </p>
          </>
        ),
      },
      {
        id: "operations",
        title: "Bilinçli bağlayın",
        content: (
          <>
            <ul>
              <li>
                Ayrı entegrasyonlar için ayrı anahtarlar üretin ve her birine
                yalnızca ihtiyacı olan erişimi verin.
              </li>
              <li>
                Anahtarları ve webhook sırlarını, herkese açık gönderilen
                tarayıcı kodunun dışında, güvenilen bir sunucuda tutun.
              </li>
              <li>
                HTTPS kullanın ve iç yönetici API’lerini herkese açık
                entegrasyon uçları gibi açmayın.
              </li>
              <li>
                İş akışlarını açmadan önce hata yollarını ve yeniden denemeleri
                kendi alıcınızla deneyin.
              </li>
            </ul>
          </>
        ),
      },
    ],
  },
  security: {
    title: "Sunucunuz. Sorumluluğunuz.",
    summary:
      "Belgeli denetimleri anlayın, erişimi bilinçli yapılandırın ve telefon sistemini nasıl kurtaracağınızı planlayın.",
    source: "SERVER-SECURITY",
    sections: [
      {
        id: "access",
        title: "Erişimle başlayın",
        content: (
          <>
            <p>
              MunaSIP isteğe bağlı yönetici TOTP iki adımlı doğrulama,
              yönetici/portal/SIP IP izin listeleri, giriş taşkını yasakları,
              SIP tarama görünürlüğü, denetim günlüğü ve giden arama denetimleri
              sağlar. Kurulumunuzun ihtiyaç duyduğu denetimleri açıp
              yapılandırın.
            </p>
            <p>
              Tüm laboratuvar kimlik bilgilerini değiştirin, yönetici erişimini
              kısıtlayın ve operatörün giden ülke ile harcama limitlerini gözden
              geçirin. Bir dahili ele geçirilirse ücret dolandırıcılığı pratik
              bir risktir.
            </p>
            <Callout>
              <p>
                Bazı eski güvenlik notları yönetici 2FA’sını zorunlu, SIP
                sırlarını gizli rastgele değerler olarak anlatır. Güncel kimlik
                doğrulama kodu TOTP’yi isteğe bağlı yapar ve güncel dahililer
                paylaşılan bir portal/SIP parolası kullanır. Bu rehber güncel
                uygulamayı izler.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: "network",
        title: "Ağ sınırını küçük tutun",
        content: (
          <>
            <p>
              Panel ve WSS için güvenilen HTTPS kullanın. Compose yığını
              Ayarlar’dan otomatik Let’s Encrypt HTTP-01 sertifikasını
              destekler; sınamalar için TCP 80 sunucuya ulaşmalıdır. SIP/RTP’yi
              ofis, VPN ve operatör erişim kurallarıyla koruyun.
            </p>
            <p>
              ARI, AMI veya PostgreSQL’i internete yayınlamayın. TURN/TURNS ve
              RTP gereksinimleri gerçek uzak istemcilere ve ağ kenarına
              bağlıdır. Ofis telefonlarını bozuyorsa SIP ALG’yi kapatın.
            </p>
            <p>
              WebRTC ortamı DTLS-SRTP kullanır. Her SIP trunk’ı veya masa
              telefonu için uçtan uca ya da evrensel şifreleme çıkarmayın:
              taşıma ve ortam güvenliği uç ve operatör yapılandırmasına
              bağlıdır.
            </p>
          </>
        ),
      },
      {
        id: "privacy",
        title: "Verinin nereye gittiğini bilin",
        content: (
          <>
            <p>
              CDR ve ses kayıtları sizin altyapınızda saklanır. Role özgü
              erişim, kayıt anonsları, saklama ayarları ve erişim denetimi kendi
              gizlilik sürecinizi destekler; tek başlarına yasal uyum
              oluşturmaz.
            </p>
            <p>
              API sorguları ve webhook’lar veriyi sizin yapılandırdığınız
              hedeflere gönderir. Edge Neural konuşma, sentez sırasında dış bir
              çevrimiçi servis ister. EMA çevrimdışı Türkçe konuşma sunar;
              çevrimdışı İngilizce yoktur.
            </p>
            <p>
              Kaydı, kullanımınıza uygun şekilde çalışanlara ve arayanlara
              söyleyin. Kayıt politikasını ve saklamayı bilinçli ayarlayın.
              Çevrimiçi bir motora hangi anons verisinin gideceğini seçmeden
              önce <a href={sourceDoc("TTS")}>konuşma motoru belgelerini</a>{" "}
              okuyun.
            </p>
          </>
        ),
      },
      {
        id: "backup",
        title: "Kalıcı tutun, yedekleyin, geri yükleyin",
        content: (
          <>
            <p>
              Tek imaj için <code>/data</code> kalıcı kalsın ve{" "}
              <code>/data/.munasip-secrets</code> korunsun. Compose ayrı
              veritabanı, kayıt, yükleme ve Asterisk yapılandırma birimleri ile
              sertifika dosyaları kullanır. Şifreleme anahtarlarını kurtarma
              malzemenizle birlikte tutun.
            </p>
            <p>
              Proje, bağlı bir yol veya SFTP için JSON yedek/geri yükleme ve
              kayıt arşivi seçenekleri içerir. Bir uygulama dışa aktarması, tam
              veritabanı ve ortam kurtarma planının yerini tutmaz. Geri
              yüklemeyi ayrı bir sunucuda deneyin.
            </p>
            <p>
              Kayıt disk kullanımını gerçek trafik ve saklamaya göre planlayın.
              Sunucu veya uplink düşerse gelen yedeklemenin bir mobil numaraya
              gitmesi operatör tarafı bir ayardır; otomatik kümelenmiş yedekleme
              belgeli bir MunaSIP özelliği değildir.
            </p>
          </>
        ),
      },
      {
        id: "maintenance",
        title: "Güncellemeler ve sorumlu bildirim",
        content: (
          <>
            <p>
              Kontrollü yükseltme istediğinizde bir imaj sürümünü sabitleyin.
              Sürüm notlarını okuyun, yedek alın, servisi mevcut birimleriyle
              yeniden oluşturun ve güncellemeden sonra aramayı doğrulayın.
            </p>
            <p>
              MIT, telif notuyla çatallamaya, değiştirmeye ve yeniden dağıtmaya
              izin verir. Güncel geliştirme, katkı ve güvenlik bildirimi için
              resmi depoya bakın. Güvenlik açığı ayrıntılarını herkese açmadan
              önce mevcut özel bildirim seçeneklerini gözden geçirin.
            </p>
            <p>
              Güncel yönergeler için{" "}
              <a href="https://github.com/MunaSIP/MunaSIP#readme">
                proje açıklamasını
              </a>{" "}
              ve <a href={sourceDoc("DEPLOY-VPS")}>VPS kurulum rehberini</a>{" "}
              okuyun.
            </p>
          </>
        ),
      },
    ],
  },
};
