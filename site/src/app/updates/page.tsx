import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { CodeBlock } from "@/components/code-block";
import { pageMetadata } from "@/lib/metadata";
import { site, releaseHighlights } from "@/lib/site";

export const metadata: Metadata = pageMetadata(
  "What's new",
  `MunaSIP ${site.version}: voicemail inbox, provider caller ID and a PBX readiness gate. Release notes and the latest main-branch work.`,
  "/updates/",
);

export default function Updates() {
  return (
    <div className="container">
      <div className="page-hero">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>What’s new
        </nav>
        <p className="eyebrow">FROM THE OFFICIAL PROJECT</p>
        <h1>
          A better connection.
          <br />
          <span>With every release.</span>
        </h1>
        <p>
          Changes you can use today, with a clear view of what is still being
          developed.
        </p>
      </div>
      <section className="release-detail" aria-labelledby="stable-release">
        <div className="release-heading">
          <div>
            <span className="release-status">LATEST RELEASE</span>
            <h2 id="stable-release">MunaSIP {site.version}</h2>
            <p>Released 21 October 2026 · Linux / AMD64 · MIT</p>
          </div>
          <a className="text-link" href={site.release}>
            Official release notes <Icon name="external" />
          </a>
        </div>
        <div className="release-cards">
          {releaseHighlights.map((item) => (
            <article key={item.title}>
              <Icon name={item.icon} />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
        <div className="release-upgrade">
          <div>
            <h3>Move to the published image.</h3>
            <p>
              Back up your persistent data, pull the pinned tag and recreate the
              container with the same volume and configuration. The project
              notes that the v1.7.4 image did not publish; use v{site.version}.
            </p>
            <Link className="text-link" href="/docs/getting-started/#updates">
              Upgrade checklist <Icon name="arrow" />
            </Link>
          </div>
          <CodeBlock
            code={`docker pull ${site.image}`}
            title="Pull the release"
          />
        </div>
      </section>
      <section className="development-note" aria-labelledby="main-work">
        <span className="release-status development">
          MAIN BRANCH / AFTER v{site.version}
        </span>
        <h2 id="main-work">In the works.</h2>
        <p>
          Reviewed against commit{" "}
          <a href={`${site.repo}/commit/${site.developmentRevision}`}>
            <code>{site.developmentRevision}</code>
          </a>{" "}
          on {site.reviewed}. These changes are in the source branch, rather
          than the v{site.version} release snapshot.
        </p>
        <div className="development-grid">
          <article>
            <h3>A more useful mailbox.</h3>
            <p>
              Inline message waveforms, unheard counts and saved greetings
              before the voicemail beep.
            </p>
          </article>
          <article>
            <h3>A clearer portal.</h3>
            <p>
              Missed-call counts clear when the list opens, with updated layouts
              and immediately applied settings.
            </p>
          </article>
          <article>
            <h3>Connection status you can trust.</h3>
            <p>
              The softphone marks a dropped PBX connection as disconnected and
              keeps trying to register again.
            </p>
          </article>
        </div>
        <a
          className="text-link"
          href={`${site.repo}/compare/v${site.version}...${site.developmentRevision}`}
        >
          Follow the source changes <Icon name="external" />
        </a>
      </section>
      <div className="updates-next">
        <Link className="button primary" href="/download/">
          Install MunaSIP {site.version} <Icon name="arrow" />
        </Link>
        <Link className="button secondary" href="/docs/">
          Read the guides <Icon name="arrow" />
        </Link>
      </div>
    </div>
  );
}
