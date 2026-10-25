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
                "Released 21 October 2026 · Linux / AMD64 · MIT",
                "21 Ekim 2026’da yayımlandı · Linux / AMD64 · MIT",
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
                `Back up your persistent data, pull the pinned tag and recreate the container with the same volume and configuration. The project notes that the v1.7.4 image did not publish; use v${site.version}.`,
                `Kalıcı veriyi yedekleyin, sabitlenen etiketi çekin ve konteyneri aynı birim ve yapılandırmayla yeniden oluşturun. Proje, v1.7.4 imajının yayımlanmadığını belirtir; v${site.version} kullanın.`,
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
              {site.reviewed.replace("October", "Ekim")} tarihinde{" "}
              <a href={`${site.repo}/commit/${site.developmentRevision}`}>
                <code>{site.developmentRevision}</code>
              </a>{" "}
              kaydına göre incelendi. Bu değişiklikler v{site.version} sürüm
              anlığında değil, kaynak dalındadır.
            </>
          ) : (
            <>
              Reviewed against commit{" "}
              <a href={`${site.repo}/commit/${site.developmentRevision}`}>
                <code>{site.developmentRevision}</code>
              </a>{" "}
              on {site.reviewed}. These changes are in the source branch, rather
              than the v{site.version} release snapshot.
            </>
          )}
        </p>
        <div className="development-grid">
          <article>
            <h3>{L("A more useful mailbox.", "Daha işe yarar bir kutu.")}</h3>
            <p>
              {L(
                "Inline message waveforms, unheard counts and saved greetings before the voicemail beep.",
                "Satır içi mesaj dalga biçimleri, duyulmamış sayılar ve sesli mesaj sinyalinden önce kayıtlı karşılama anonsları.",
              )}
            </p>
          </article>
          <article>
            <h3>{L("A clearer portal.", "Daha net bir portal.")}</h3>
            <p>
              {L(
                "Missed-call counts clear when the list opens, with updated layouts and immediately applied settings.",
                "Liste açılınca kaçan arama sayıları temizlenir; yerleşimler güncellenir ve ayarlar hemen uygulanır.",
              )}
            </p>
          </article>
          <article>
            <h3>
              {L(
                "Connection status you can trust.",
                "Güvenebileceğiniz bağlantı durumu.",
              )}
            </h3>
            <p>
              {L(
                "The softphone marks a dropped PBX connection as disconnected and keeps trying to register again.",
                "Yazılımsal telefon düşen santral bağlantısını kopuk işaretler ve kaydı yeniden denemeye devam eder.",
              )}
            </p>
          </article>
        </div>
        <a
          className="text-link"
          href={`${site.repo}/compare/v${site.version}...${site.developmentRevision}`}
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
