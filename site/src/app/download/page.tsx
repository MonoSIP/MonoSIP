import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { Icon } from "@/components/icon";
import { dockerCommand, composeCommand, site } from "@/lib/site";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata(
  "Download & install",
  `Get MunaSIP ${site.version} for your Linux x86-64 server: pull the prebuilt Docker image or download the release source.`,
  "/download/",
);
export default function Download() {
  return (
    <div className="container">
      <div className="page-hero">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>Download
        </nav>
        <p className="eyebrow">YOUR SERVER. YOUR NEXT CONVERSATION.</p>
        <h1>
          A phone system.
          <br />
          <span>Ready to make yours.</span>
        </h1>
        <p>
          Choose a prebuilt image or start from the source. The same open PBX,
          on your own infrastructure.
        </p>
      </div>
      <div className="download-layout">
        <div>
          <div className="download-summary">
            <span className="status-dot" />
            <strong>Current release: v{site.version}</strong>
            <span className="mono">LINUX / AMD64</span>
            <span className="mono">MIT LICENSE</span>
          </div>
          <h2>Pull the prebuilt image.</h2>
          <p className="download-release-note">
            v{site.version} adds the employee voicemail inbox, provider caller
            ID and PBX readiness checks.{" "}
            <Link href="/updates/">Read what’s new →</Link>
          </p>
          <p>
            The recommended starting point for a Linux x86-64 Docker host. Pin
            the release tag, persist <code>/data</code> and configure HTTPS and
            media networking.
          </p>
          <CodeBlock code={dockerCommand} title="install MunaSIP" />
          <div className="terminal-note">
            <Icon name="shield" />
            <p>
              Replace the example IP and hostname before running. This command
              exposes application port 3000 and RTP media; use a public HTTPS
              proxy. Read the guide before connecting your provider.
            </p>
          </div>
          <Link className="button primary" href="/docs/getting-started/">
            Follow the setup guide <Icon name="arrow" />
          </Link>
          <div className="download-requirements">
            <h2>A small office. A proper host.</h2>
            <dl>
              <dt>Platform</dt>
              <dd>Linux x86-64. Debian 12/13 or Ubuntu 22.04+ recommended.</dd>
              <dt>Runtime</dt>
              <dd>
                Docker Engine; Compose v2 for the multi-service deployment.
              </dd>
              <dt>Resources</dt>
              <dd>2–4 vCPU, 4–8 GB RAM. Neural speech uses the PBX CPU.</dd>
              <dt>Data</dt>
              <dd>Persistent storage and a tested backup plan.</dd>
              <dt>Networking</dt>
              <dd>
                Public hostname, HTTPS/WSS, reachable RTP or configured TURN.
              </dd>
            </dl>
          </div>
        </div>
        <div className="download-options">
          <article className="download-option">
            <Icon name="code" />
            <h2>Start from the source.</h2>
            <p>
              Download the source archive for v{site.version}, or clone the
              repository and check out the release tag. Build the complete stack
              using Docker Compose.
            </p>
            <a className="button secondary" href={site.sourceZip}>
              <Icon name="download" /> Download source ZIP
            </a>
            <div style={{ marginTop: 16 }}>
              <Link className="text-link" href="/docs/getting-started/#compose">
                Build with Compose <Icon name="arrow" />
              </Link>
            </div>
            <details className="source-install-details">
              <summary>Show the source install commands</summary>
              <CodeBlock
                code={composeCommand}
                title="Build from the release source"
              />
            </details>
          </article>
          <article className="download-option">
            <Icon name="server" />
            <h2>Know what’s in the image.</h2>
            <p>
              Asterisk, API, web panel, embedded PostgreSQL and speech engines.
              The published image targets <code>linux/amd64</code>. Native
              Windows/macOS installers and ARM images are not published by this
              release.
            </p>
            <a
              className="text-link"
              href="https://github.com/orgs/MunaSIP/packages/container/package/munasip"
            >
              View container package <Icon name="external" />
            </a>
          </article>
          <article className="download-option">
            <Icon name="flow" />
            <h2>Read what changed.</h2>
            <p>
              Review the release notes before an upgrade. Recreate the container
              with its existing persistent volume and configuration after
              pulling the image.
            </p>
            <a className="text-link" href={site.release}>
              Release v{site.version} <Icon name="external" />
            </a>
          </article>
          <article className="download-option">
            <Icon name="github" />
            <h2>Open source, with clear ownership.</h2>
            <p>
              MIT licensed. Fork and adapt it under the license, keeping the
              copyright notice. Visit the official repository for current
              development and contribution guidance.
            </p>
            <a className="text-link" href={`${site.repo}#readme`}>
              Explore the project <Icon name="external" />
            </a>
          </article>
        </div>
      </div>
    </div>
  );
}
