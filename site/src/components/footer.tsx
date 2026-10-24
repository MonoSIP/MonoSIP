import Link from "next/link";
import Image from "next/image";
import { Icon } from "./icon";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-intro">
            <Link className="brand" href="/">
              <Image
                src="/brand/munasip-mark.svg"
                width={32}
                height={32}
                alt=""
              />
              <span>
                Müna<span className="brand-sip">SIP</span>
                <span className="brand-period">.</span>
              </span>
            </Link>
            <p>
              Good conversations.
              <br />
              Your infrastructure.
            </p>
            <span className="mono footer-small">
              OPEN SOURCE. ON YOUR TERMS.
            </span>
          </div>
          <div>
            <h2>Product</h2>
            <Link href="/#features">Features</Link>
            <Link href="/#ivr">Visual IVR</Link>
            <Link href="/#softphone">Browser softphone</Link>
            <Link href="/download/">Download</Link>
            <Link href="/updates/">What’s new</Link>
            <a href={site.release}>Release {site.version}</a>
          </div>
          <div>
            <h2>Resources</h2>
            <Link href="/docs/">Documentation</Link>
            <Link href="/docs/getting-started/">Installation</Link>
            <Link href="/docs/architecture/">Architecture</Link>
            <Link href="/docs/security/">Security & operations</Link>
            <Link href="/brand/">Brand assets</Link>
          </div>
          <div>
            <h2>Open source</h2>
            <a href={site.repo}>
              GitHub <Icon name="external" className="tiny" />
            </a>
            <a href={`${site.repo}/blob/main/LICENSE`}>MIT license</a>
            <a href={`${site.repo}#readme`}>Project readme</a>
            <a href="https://github.com/diggyen">Original author</a>
            <a href={site.websiteRepo}>Website source</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 diggyen. MunaSIP is MIT licensed.</span>
          <span className="footer-end">
            <span className="status-dot" /> Built for your own server.
            <a href="#top" aria-label="Back to top">
              ↑
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
