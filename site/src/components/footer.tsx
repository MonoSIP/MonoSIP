"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";
import { chrome, localeFromPath, pathFor } from "@/lib/locale";
import { site } from "@/lib/site";

export function Footer() {
  const pathname = usePathname() || "/";
  const locale = localeFromPath(pathname);
  const t = chrome[locale];
  const href = (path: string) => pathFor(locale, path);
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-intro">
            <Link className="brand" href={href("/")}>
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
              {t.footerLeadA}
              <br />
              {t.footerLeadB}
            </p>
            <span className="mono footer-small">{t.footerKicker}</span>
          </div>
          <div>
            <h2>{t.product}</h2>
            <Link href={href("/#features")}>{t.features}</Link>
            <Link href={href("/#ivr")}>{t.visualIvr}</Link>
            <Link href={href("/#softphone")}>{t.softphone}</Link>
            <Link href={href("/download/")}>{t.download}</Link>
            <Link href={href("/updates/")}>{t.updates}</Link>
            <a href={site.release}>
              {locale === "tr" ? "Sürüm" : "Release"} {site.version}
            </a>
          </div>
          <div>
            <h2>{t.resources}</h2>
            <Link href={href("/docs/")}>{t.docs}</Link>
            <Link href={href("/docs/getting-started/")}>{t.install}</Link>
            <Link href={href("/docs/architecture/")}>{t.architecture}</Link>
            <Link href={href("/docs/security/")}>{t.security}</Link>
            <Link href={href("/brand/")}>{t.brand}</Link>
          </div>
          <div>
            <h2>{t.openSource}</h2>
            <a href={site.repo}>
              GitHub <Icon name="external" className="tiny" />
            </a>
            <a href={`${site.repo}/blob/main/LICENSE`}>{t.license}</a>
            <a href={`${site.repo}#readme`}>{t.readme}</a>
            <a href="https://github.com/diggyen">{t.author}</a>
            <a href={site.websiteRepo}>{t.website}</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{t.copyright}</span>
          <span className="footer-end">
            <span className="status-dot" /> {t.built}
            <a href="#top" aria-label={t.top}>
              ↑
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
