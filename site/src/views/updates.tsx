import Link from "next/link";
import { Icon } from "@/components/icon";
import { CodeBlock } from "@/components/code-block";
import { highlightsFor } from "@/lib/catalog";
import type { Locale } from "@/lib/locale";
import { pathFor } from "@/lib/locale";
import { site } from "@/lib/site";

export function UpdatesPage({ locale = "en" }: { locale?: Locale }) {
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
          {L("What’s new", "Yenilikler")}
        </nav>
        <p className="eyebrow">
          {L("FROM THE OFFICIAL PROJECT", "RESMİ PROJEDEN")}
        </p>
        <h1>
          {L("A better connection.", "Daha iyi bir bağlantı.")}
          <br />
          <span>{L("With every release.", "Her sürümle.")}</span>
        </h1>
        <p>
          {L(
            "Changes you can use today, with a clear view of what is still being developed.",
            "Bugün kullanabileceğiniz değişiklikler ve hâlâ geliştirilenlerin net görünümü.",
          )}
        </p>
      </div>
      <section className="release-detail" aria-labelledby="stable-release">
        <div className="release-heading">
          <div>
            <span className="release-status">
              {L("LATEST RELEASE", "SON SÜRÜM")}
            </span>
            <h2 id="stable-release">MonoSIP {site.version}</h2>
            <p>
              {L(
                "Released 25 November 2026 · Linux / AMD64 · MIT",
                "25 Kasım 2026’da yayımlandı · Linux / AMD64 · MIT",
              )}
            </p>
          </div>
          <a className="text-link" href={site.release}>
            {L("Official release notes", "Resmi sürüm notları")}{" "}
            <Icon name="external" />
          </a>
        </div>
        <div className="release-cards">
          {highlightsFor(locale).map((item) => (
            <article key={item.title}>
              <Icon name={item.icon} />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
        <div className="release-upgrade">
          <div>
            <h3>
              {L("Move to the published image.", "Yayımlanan imaja geçin.")}
            </h3>
            <p>
              {L(
                `Back up your persistent data, pull ${site.image} and recreate the container with the same volume and configuration.`,
                `Kalıcı veriyi yedekleyin, ${site.image} imajını çekin ve konteyneri aynı birim ve yapılandırmayla yeniden oluşturun.`,
              )}
            </p>
            <Link
              className="text-link"
              href={href("/docs/getting-started/#updates")}
            >
              {L("Upgrade checklist", "Yükseltme listesi")}{" "}
              <Icon name="arrow" />
            </Link>
          </div>
          <CodeBlock
            code={`docker pull ${site.image}`}
            title={L("Pull the release", "Sürümü çekin")}
          />
        </div>
      </section>
      <section className="development-note" aria-labelledby="main-work">
        <span className="release-status development">
          {L("MAIN BRANCH / AFTER", "ANA DAL / SONRA")} v{site.version}
        </span>
        <h2 id="main-work">{L("In the works.", "Geliştirmede.")}</h2>
        <p>
          {tr ? (
            <>
              {site.reviewed.replace("November", "Kasım")} tarihinde{" "}
              <a href={`${site.repo}/commit/${site.developmentRevision}`}>
                <code>{site.developmentRevision}</code>
              </a>{" "}
              kaydına göre incelendi. Ana daldaki her şey v{site.version}
              sürümündedir. 1.8.4’ten bu yana gelen düzeltmeler:
            </>
          ) : (
            <>
              Reviewed against commit{" "}
              <a href={`${site.repo}/commit/${site.developmentRevision}`}>
                <code>{site.developmentRevision}</code>
              </a>{" "}
              on {site.reviewed}. Everything on the main branch is in the
              v{site.version} release. Fixes since 1.8.4:
            </>
          )}
        </p>
        <div className="development-grid">
          <article>
            <h3>{L("The real caller ID.", "Gerçek arayan numarası.")}</h3>
            <p>
              {L(
                "Inbound calls from a provider show the caller’s own number instead of the trunk’s, and a provider login without a DID no longer returns 404.",
                "Operatörden gelen aramalarda trunk numarası yerine arayanın kendi numarası görünür; DID içermeyen operatör kaydı artık 404 vermez.",
              )}
            </p>
          </article>
          <article>
            <h3>{L("Softphone on the right host.", "Doğru adreste yazılımsal telefon.")}</h3>
            <p>
              {L(
                "A redeploy can no longer point softphones at the container address. Set PUBLIC_HOST and the browser always connects to your hostname.",
                "Yeniden dağıtım, yazılımsal telefonları artık konteyner adresine yönlendiremez. PUBLIC_HOST ayarlayın; tarayıcı her zaman alan adınıza bağlanır.",
              )}
            </p>
          </article>
          <article>
            <h3>
              {L(
                "Flow tests that match live calls.",
                "Canlı aramayla aynı akış testi.",
              )}
            </h3>
            <p>
              {L(
                "The flow simulation sends the API node’s secret, headers and body, so a key that works on a call no longer fails with 401 in the test.",
                "Akış simülasyonu API düğümünün gizli değerini, başlıklarını ve gövdesini gönderir; aramada çalışan bir anahtar testte artık 401 vermez.",
              )}
            </p>
          </article>
        </div>
        <a
          className="text-link"
          href={`${site.repo}/commits/v${site.version}`}
        >
          {L("Follow the source changes", "Kaynak değişikliklerini izleyin")}{" "}
          <Icon name="external" />
        </a>
      </section>
      <div className="updates-next">
        <Link className="button primary" href={href("/download/")}>
          {L("Install", "Kurun")} MonoSIP {site.version} <Icon name="arrow" />
        </Link>
        <Link className="button secondary" href={href("/docs/")}>
          {L("Read the guides", "Rehberleri okuyun")} <Icon name="arrow" />
        </Link>
      </div>
    </div>
  );
}
