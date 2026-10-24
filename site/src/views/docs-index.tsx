import Link from "next/link";
import { Icon } from "@/components/icon";
import { navFor, referencesFor } from "@/lib/catalog";
import type { Locale } from "@/lib/locale";
import { pathFor } from "@/lib/locale";
import { site, sourceDoc } from "@/lib/site";

export function DocsIndex({ locale = "en" }: { locale?: Locale }) {
  const tr = locale === "tr";
  const href = (path: string) => pathFor(locale, path);
  return (
    <div className="container">
      <div className="page-hero">
        <nav
          className="breadcrumb"
          aria-label={tr ? "Sayfa yolu" : "Breadcrumb"}
        >
          <Link href={href("/")}>{tr ? "Ana sayfa" : "Home"}</Link>
          <span>/</span>
          {tr ? "Belgeler" : "Documentation"}
        </nav>
        <p className="eyebrow">
          {tr
            ? "SONRAKİ ADIM, NET BAĞLI."
            : "THE NEXT STEP, CLEARLY CONNECTED."}
        </p>
        <h1>
          {tr ? "Telefon sisteminizi" : "Get to know"}
          <br />
          <span>{tr ? "tanıyın." : "your phone system."}</span>
        </h1>
        <p>
          {tr
            ? "İlk Docker komutundan doğru hissettiren bir çağrı akışına. İşlettiğiniz sistem için pratik rehberler."
            : "From your first Docker command to a call flow that feels right. Practical guides for the system you run."}
        </p>
      </div>
      <div className="docs-index">
        {navFor(locale).map((doc) => (
          <Link
            className="doc-card"
            href={href(`/docs/${doc.slug}/`)}
            key={doc.slug}
          >
            <Icon name={doc.icon} />
            <h2>{doc.title}</h2>
            <p>{doc.detail}</p>
            <span className="text-link">
              {tr ? "Rehberi okuyun" : "Read the guide"} <Icon name="arrow" />
            </span>
          </Link>
        ))}
      </div>
      <section className="reference-section" aria-labelledby="reference-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {tr ? "BİRAZ DAHA DERİNE" : "GO A LITTLE DEEPER"}
            </p>
            <h2 id="reference-title">
              {tr ? "Tam referans." : "The complete reference."}
            </h2>
          </div>
          <p>
            {tr
              ? `Rehberinizle kurulumunuz aynı kalsın diye v${site.version} kaynak anlığına bağlı resmi proje belgeleri.`
              : `Official project documentation, linked to the v${site.version} source snapshot so your guide and your installation agree.`}
          </p>
        </div>
        <div className="reference-grid">
          {referencesFor(locale).map(([file, title, detail]) => (
            <a href={sourceDoc(file)} key={file}>
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
              <Icon name="external" />
            </a>
          ))}
        </div>
      </section>
      <div className="docs-source-note">
        {tr ? (
          <>
            Resmi proje kaynaklarına, <a href={site.release}>v{site.version}</a>{" "}
            sürümüne dayanır. Tam API ve işletim referansı için{" "}
            <a href={`${site.repo}/tree/main/docs`}>kaynak belgelere</a> bakın.
          </>
        ) : (
          <>
            Based on the official project sources at release{" "}
            <a href={site.release}>v{site.version}</a>. For the full API and
            operational reference, visit{" "}
            <a href={`${site.repo}/tree/main/docs`}>
              the upstream documentation
            </a>
            .
          </>
        )}
      </div>
    </div>
  );
}
