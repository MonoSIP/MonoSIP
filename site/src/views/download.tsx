import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { Icon } from "@/components/icon";
import type { Locale } from "@/lib/locale";
import { pathFor } from "@/lib/locale";
import { dockerCommand, composeCommand, site } from "@/lib/site";

export function DownloadPage({ locale = "en" }: { locale?: Locale }) {
  const L = (en: string, tr: string) => (locale === "tr" ? tr : en);
  const href = (path: string) => pathFor(locale, path);
  const tr = locale === "tr";
  return (
    <div className="container">
      <div className="page-hero">
        <nav
          className="breadcrumb"
          aria-label={tr ? "Sayfa yolu" : "Breadcrumb"}
        >
          <Link href={href("/")}>{tr ? "Ana sayfa" : "Home"}</Link>
          <span>/</span>
          {tr ? "İndir" : "Download"}
        </nav>
        <p className="eyebrow">
          {L(
            "YOUR SERVER. YOUR NEXT CONVERSATION.",
            "SUNUCUNUZ. SONRAKİ KONUŞMANIZ.",
          )}
        </p>
        <h1>
          {L("A phone system.", "Bir telefon sistemi.")}
          <br />
          <span>{L("Ready to make yours.", "Sizin olmaya hazır.")}</span>
        </h1>
        <p>
          {L(
            "Choose a prebuilt image or start from the source. The same open PBX, on your own infrastructure.",
            "Hazır bir imaj seçin ya da kaynaktan başlayın. Aynı açık santral, kendi altyapınızda.",
          )}
        </p>
      </div>
      <div className="download-layout">
        <div>
          <div className="download-summary">
            <span className="status-dot" />
            <strong>
              {L("Current release", "Güncel sürüm")}: v{site.version}
            </strong>
            <span className="mono">LINUX / AMD64</span>
            <span className="mono">{tr ? "MIT LİSANSI" : "MIT LICENSE"}</span>
          </div>
          <h2>{L("Pull the prebuilt image.", "Hazır imajı çekin.")}</h2>
          <p className="download-release-note">
            {L(
              `v${site.version} names the product MonoSIP and keeps the voicemail inbox, portal and sign-in preferences together. `,
              `v${site.version} ürüne MonoSIP adını verir ve sesli mesaj kutusunu, portalı ve giriş tercihlerini bir arada tutar. `,
            )}
            <Link href={href("/updates/")}>
              {L("Read what’s new →", "Yenilikleri okuyun →")}
            </Link>
          </p>
          <p>
            {L(
              "The recommended starting point for a Linux x86-64 Docker host. Pin the release tag, persist ",
              "Linux x86-64 Docker sunucusu için önerilen başlangıç. Sürüm etiketini sabitleyin, ",
            )}
            <code>/data</code>
            {L(
              " and configure HTTPS and media networking.",
              " yolunu kalıcı tutun ve HTTPS ile ortam ağını ayarlayın.",
            )}
          </p>
          <CodeBlock
            code={dockerCommand}
            title={L("install MonoSIP", "MonoSIP kurulumu")}
          />
          <div className="terminal-note">
            <Icon name="shield" />
            <p>
              {L(
                "Replace the example IP and hostname before running. This command exposes application port 3000 and RTP media; use a public HTTPS proxy. Read the guide before connecting your provider.",
                "Çalıştırmadan önce örnek IP ve alan adını değiştirin. Bu komut uygulama portu 3000’i ve RTP ortamını açar; herkese açık bir HTTPS vekili kullanın. Operatörünüzü bağlamadan önce rehberi okuyun.",
              )}
            </p>
          </div>
          <Link
            className="button primary"
            href={href("/docs/getting-started/")}
          >
            {L("Follow the setup guide", "Kurulum rehberini izleyin")}{" "}
            <Icon name="arrow" />
          </Link>
          <div className="download-requirements">
            <h2>
              {L(
                "A small office. A proper host.",
                "Küçük bir ofis. Doğru bir sunucu.",
              )}
            </h2>
            <dl>
              <dt>{L("Platform", "Platform")}</dt>
              <dd>
                {L(
                  "Linux x86-64. Debian 12/13 or Ubuntu 22.04+ recommended.",
                  "Linux x86-64. Debian 12/13 veya Ubuntu 22.04+ önerilir.",
                )}
              </dd>
              <dt>{L("Runtime", "Çalışma ortamı")}</dt>
              <dd>
                {L(
                  "Docker Engine; Compose v2 for the multi-service deployment.",
                  "Docker Engine; çok servisli kurulum için Compose v2.",
                )}
              </dd>
              <dt>{L("Resources", "Kaynaklar")}</dt>
              <dd>
                {L(
                  "2–4 vCPU, 4–8 GB RAM. Neural speech uses the PBX CPU.",
                  "2–4 vCPU, 4–8 GB RAM. Nöral konuşma santral işlemcisini kullanır.",
                )}
              </dd>
              <dt>{L("Data", "Veri")}</dt>
              <dd>
                {L(
                  "Persistent storage and a tested backup plan.",
                  "Kalıcı depolama ve denenmiş bir yedek planı.",
                )}
              </dd>
              <dt>{L("Networking", "Ağ")}</dt>
              <dd>
                {L(
                  "Public hostname, HTTPS/WSS, reachable RTP or configured TURN.",
                  "Herkese açık alan adı, HTTPS/WSS, erişilebilir RTP veya ayarlı TURN.",
                )}
              </dd>
            </dl>
          </div>
        </div>
        <div className="download-options">
          <article className="download-option">
            <Icon name="code" />
            <h2>{L("Start from the source.", "Kaynaktan başlayın.")}</h2>
            <p>
              {L(
                `Download the source archive for v${site.version}, or clone the repository and check out the release tag. Build the complete stack using Docker Compose.`,
                `v${site.version} kaynak arşivini indirin ya da depoyu klonlayıp sürüm etiketine geçin. Yığının tamamını Docker Compose ile derleyin.`,
              )}
            </p>
            <a className="button secondary" href={site.sourceZip}>
              <Icon name="download" />{" "}
              {L("Download source ZIP", "Kaynak ZIP’ini indir")}
            </a>
            <div style={{ marginTop: 16 }}>
              <Link
                className="text-link"
                href={href("/docs/getting-started/#compose")}
              >
                {L("Build with Compose", "Compose ile derleyin")}{" "}
                <Icon name="arrow" />
              </Link>
            </div>
            <details className="source-install-details">
              <summary>
                {L(
                  "Show the source install commands",
                  "Kaynak kurulum komutlarını göster",
                )}
              </summary>
              <CodeBlock
                code={composeCommand}
                title={L(
                  "Build from the release source",
                  "Sürüm kaynağından derleyin",
                )}
              />
            </details>
          </article>
          <article className="download-option">
            <Icon name="server" />
            <h2>
              {L("Know what’s in the image.", "İmajda ne olduğunu bilin.")}
            </h2>
            <p>
              {L(
                "Asterisk, API, web panel, embedded PostgreSQL and speech engines. The published image targets ",
                "Asterisk, API, web paneli, gömülü PostgreSQL ve konuşma motorları. Yayımlanan imaj ",
              )}
              <code>linux/amd64</code>
              {L(
                ". Native Windows/macOS installers and ARM images are not published by this release.",
                " içindir. Bu sürüm yerel Windows/macOS kurucuları ve ARM imajları yayımlamaz.",
              )}
            </p>
            <a
              className="text-link"
              href="https://github.com/orgs/MonoSIP/packages/container/package/monosip"
            >
              {L("View container package", "Konteyner paketine bakın")}{" "}
              <Icon name="external" />
            </a>
          </article>
          <article className="download-option">
            <Icon name="flow" />
            <h2>{L("Read what changed.", "Nelerin değiştiğini okuyun.")}</h2>
            <p>
              {L(
                "Review the release notes before an upgrade. Recreate the container with its existing persistent volume and configuration after pulling the image.",
                "Yükseltmeden önce sürüm notlarını okuyun. İmajı çektikten sonra konteyneri mevcut kalıcı birimi ve yapılandırmasıyla yeniden oluşturun.",
              )}
            </p>
            <a className="text-link" href={site.release}>
              {L("Release", "Sürüm")} v{site.version} <Icon name="external" />
            </a>
          </article>
          <article className="download-option">
            <Icon name="github" />
            <h2>
              {L(
                "Open source, with clear ownership.",
                "Açık kaynak, net bir sahiplikle.",
              )}
            </h2>
            <p>
              {L(
                "MIT licensed. Fork and adapt it under the license, keeping the copyright notice. Visit the official repository for current development and contribution guidance.",
                "MIT lisanslı. Telif notunu koruyarak lisans altında çatallayın ve uyarlayın. Güncel geliştirme ve katkı için resmi depoya bakın.",
              )}
            </p>
            <a className="text-link" href={`${site.repo}#readme`}>
              {L("Explore the project", "Projeye bakın")}{" "}
              <Icon name="external" />
            </a>
          </article>
        </div>
      </div>
    </div>
  );
}
