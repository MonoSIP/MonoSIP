import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { docs } from "@/lib/docs";
import { docNav, site, sourceDoc } from "@/lib/site";
import { Icon } from "@/components/icon";
import { pageMetadata } from "@/lib/metadata";

export const dynamicParams = false;
export function generateStaticParams() {
  return docNav.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = docs[slug];
  if (!doc) return {};
  const title = docNav.find((item) => item.slug === slug)!.title;
  return pageMetadata(title, doc.summary, `/docs/${slug}/`);
}
export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = docs[slug];
  if (!doc) notFound();
  const index = docNav.findIndex((item) => item.slug === slug);
  const next = docNav[(index + 1) % docNav.length];
  return (
    <div className="container docs-layout">
      <aside className="docs-sidebar" aria-label="Documentation navigation">
        <p className="eyebrow">MUNASIP / DOCUMENTATION</p>
        {docNav.map((item) => (
          <Link
            href={`/docs/${item.slug}/`}
            key={item.slug}
            aria-current={item.slug === slug ? "page" : undefined}
          >
            {item.title}
          </Link>
        ))}
      </aside>
      <article className="doc-article">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href="/docs/">Docs</Link>
          <span>/</span>
          {docNav[index].title}
        </nav>
        <h1>{doc.title}</h1>
        <p className="doc-summary">{doc.summary}</p>
        <div className="doc-meta">
          <span className="mono">MUNASIP v{site.version}</span>
          <span>
            Reviewed {site.reviewed} · v{site.version}
          </span>
          <a href={sourceDoc(doc.source)}>Upstream reference ↗</a>
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
          <Link href="/docs/">← All guides</Link>
          <Link href={`/docs/${next.slug}/`}>
            {next.title} <Icon name="arrow" />
          </Link>
        </div>
      </article>
      <aside className="doc-toc" aria-label="On this page">
        <p className="mono">ON THIS PAGE</p>
        {doc.sections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.title}
          </a>
        ))}
      </aside>
    </div>
  );
}
