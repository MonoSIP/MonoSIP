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
                "Released 28 November 2026 · Linux / AMD64 · MIT",
                "28 Kasım 2026’da yayımlandı · Linux / AMD64 · MIT",
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
        <h2 id="main-work">{L("Also in this release.", "Bu sürümde ayrıca.")}</h2>
        <p>
          {tr ? (
            <>
              {site.reviewed.replace("November", "Kasım")} tarihinde{" "}
              <a href={`${site.repo}/commit/${site.developmentRevision}`}>
                <code>{site.developmentRevision}</code>
              </a>{" "}
              kaydına göre incelendi. Ana daldaki her şey v{site.version}{" "}
              sürümündedir.
            </>
          ) : (
            <>
              Reviewed against commit{" "}
              <a href={`${site.repo}/commit/${site.developmentRevision}`}>
                <code>{site.developmentRevision}</code>
              </a>{" "}
              on {site.reviewed}. Everything on the main branch is in the
              v{site.version} release.
            </>
          )}
        </p>
        <div className="development-grid">
          <article>
            <h3>{L("Marketing site on Next.js 16.4.6.", "Tanıtım sitesi Next.js 16.4.6.")}</h3>
            <p>
              {L(
                "The public site ships on a patched Next.js release with WCAG AA contrast fixes for light and dark themes.",
                "Herkese açık site, yamalı bir Next.js sürümünde ve açık/koyu temalar için WCAG AA kontrast düzeltmeleriyle geliyor.",
              )}
            </p>
          </article>
          <article>
            <h3>{L("External forward guard copy.", "Harici yönlendirme uyarısı.")}</h3>
            <p>
              {L(
                "Enabling an external forward without Mobile forward OK now shows a clear Turkish and English message before save.",
                "Cebe yönlendirme serbest olmadan harici yönlendirme kaydı, kayıt öncesi net bir Türkçe ve İngilizce uyarı gösterir.",
              )}
            </p>
          </article>
          <article>
            <h3>{L("Trunk status from AMI.", "AMI’den hat durumu.")}</h3>
            <p>
              {L(
                "Registered and idle trunks map to up; unreachable and AMI errors map to down, so the panel no longer inverts live status.",
                "Kayıtlı ve boşta hatlar up, ulaşılamayan ve AMI hataları down olur; panel canlı durumu ters göstermez.",
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
