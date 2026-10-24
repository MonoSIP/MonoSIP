import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { docNav, site, referenceDocs, sourceDoc } from "@/lib/site";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Documentation",
  "Install MunaSIP, design IVR flows, connect a browser softphone and understand the self-hosted PBX architecture.",
  "/docs/",
);
export default function DocsIndex() {
  return (
    <div className="container">
      <div className="page-hero">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>Documentation
        </nav>
        <p className="eyebrow">THE NEXT STEP, CLEARLY CONNECTED.</p>
        <h1>
          Get to know
          <br />
          <span>your phone system.</span>
        </h1>
        <p>
          From your first Docker command to a call flow that feels right.
          Practical guides for the system you run.
        </p>
      </div>
      <div className="docs-index">
        {docNav.map((doc) => (
          <Link className="doc-card" href={`/docs/${doc.slug}/`} key={doc.slug}>
            <Icon name={doc.icon} />
            <h2>{doc.title}</h2>
            <p>{doc.detail}</p>
            <span className="text-link">
              Read the guide <Icon name="arrow" />
            </span>
          </Link>
        ))}
      </div>
      <section className="reference-section" aria-labelledby="reference-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GO A LITTLE DEEPER</p>
            <h2 id="reference-title">The complete reference.</h2>
          </div>
          <p>
            Official project documentation, linked to the v{site.version} source
            snapshot so your guide and your installation agree.
          </p>
        </div>
        <div className="reference-grid">
          {referenceDocs.map(([file, title, detail]) => (
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
        Based on the official project sources at release{" "}
        <a href={site.release}>v{site.version}</a>. For the full API and
        operational reference, visit{" "}
        <a href={`${site.repo}/tree/main/docs`}>the upstream documentation</a>.
      </div>
    </div>
  );
}
