import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { navFor } from "@/lib/catalog";
import { getDocs } from "@/lib/docs";
import type { Locale } from "@/lib/locale";
import { pathFor } from "@/lib/locale";
import { site, sourceDoc } from "@/lib/site";

export function DocArticle({
  locale = "en",
  slug,
}: {
  locale?: Locale;
  slug: string;
}) {
  const docs = getDocs(locale);
  const docNav = navFor(locale);
  const doc = docs[slug];
  if (!doc) notFound();
  const index = docNav.findIndex((item) => item.slug === slug);
  const next = docNav[(index + 1) % docNav.length];
  const href = (path: string) => pathFor(locale, path);
  const tr = locale === "tr";
  return (
    <div className="container docs-layout">
      <aside
        className="docs-sidebar"
        aria-label={tr ? "Belge menüsü" : "Documentation navigation"}
      >
        <p className="eyebrow">
          {tr ? "MUNASIP / BELGELER" : "MUNASIP / DOCUMENTATION"}
        </p>
        {docNav.map((item) => (
          <Link
            href={href(`/docs/${item.slug}/`)}
            key={item.slug}
            aria-current={item.slug === slug ? "page" : undefined}
          >
            {item.title}
          </Link>
        ))}
      </aside>
      <article className="doc-article">
        <nav
          className="breadcrumb"
          aria-label={tr ? "Sayfa yolu" : "Breadcrumb"}
        >
          <Link href={href("/")}>{tr ? "Ana sayfa" : "Home"}</Link>
          <span>/</span>
          <Link href={href("/docs/")}>{tr ? "Belgeler" : "Docs"}</Link>
          <span>/</span>
          {docNav[index].title}
        </nav>
        <h1>{doc.title}</h1>
        <p className="doc-summary">{doc.summary}</p>
        <div className="doc-meta">
          <span className="mono">MUNASIP v{site.version}</span>
          <span>
            {tr ? "İncelendi" : "Reviewed"}{" "}
            {tr ? "22 Ekim 2026" : site.reviewed} · v{site.version}
          </span>
          <a href={sourceDoc(doc.source)}>
            {tr ? "Kaynak referans" : "Upstream reference"} ↗
          </a>
        </div>
        <div className="prose">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.content}
            </section>
          ))}
        </div>
        <div className="doc-next">
          <Link href={href("/docs/")}>
            {tr ? "← Tüm rehberler" : "← All guides"}
          </Link>
          <Link href={href(`/docs/${next.slug}/`)}>
            {next.title} <Icon name="arrow" />
          </Link>
        </div>
      </article>
      <aside
        className="doc-toc"
        aria-label={tr ? "Bu sayfada" : "On this page"}
      >
        <p className="mono">{tr ? "BU SAYFADA" : "ON THIS PAGE"}</p>
        {doc.sections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.title}
          </a>
        ))}
      </aside>
    </div>
  );
}
