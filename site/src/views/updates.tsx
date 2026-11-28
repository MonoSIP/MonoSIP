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
              kaydına göre incelendi. v{site.version} sürümünden sonra ana dalda:
            </>
          ) : (
            <>
              Reviewed against commit{" "}
              <a href={`${site.repo}/commit/${site.developmentRevision}`}>
                <code>{site.developmentRevision}</code>
              </a>{" "}
              on {site.reviewed}. On main after v{site.version}:
            </>
          )}
        </p>
        <div className="development-grid">
          <article>
            <h3>{L("Answered calls stay answered.", "Yanıtlanan arama yanıtlı kalır.")}</h3>
            <p>
              {L(
                "IVR → extension transfers with a recording no longer finish as NOANSWER when the caller hangs up mid-bridge. Hangup CDR and recording finalize keep disposition and billsec correct.",
                "Kayıtlı IVR → dahili aktarımları, arayan köprüde kapatsa bile artık NOANSWER bitmez. Hangup CDR ve kayıt sonlandırma disposition ile billsec’i doğru tutar.",
              )}
            </p>
          </article>
          <article>
            <h3>{L("Trunk UDP 5070 is required.", "Trunk için UDP 5070 şart.")}</h3>
            <p>
              {L(
                "Publish 5070/udp and set MONOSIP_TRUNK_SIP_PUBLISHED=1. Health warns when it is missing; the softphone banner only shows RTP and host issues.",
                "5070/udp yayınlayın ve MONOSIP_TRUNK_SIP_PUBLISHED=1 koyun. Eksikte health uyarır; yazılımsal telefon bandı yalnızca RTP ve host sorunlarını gösterir.",
              )}
            </p>
          </article>
          <article>
            <h3>
              {L(
                "Recordings after trunk continue.",
                "Trunk continue sonrası kayıt.",
              )}
            </h3>
            <p>
              {L(
                "MixMonitor registers on hangup after Stasis continue to trunk dial, so answered outbound legs keep their recording file.",
                "Stasis continue ile trunk aramasından sonra MixMonitor hangup’ta kaydı kapatır; yanıtlanan dış bacakların ses dosyası kalır.",
              )}
            </p>
          </article>
        </div>
        <a
          className="text-link"
          href={`${site.repo}/commits/main`}
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
