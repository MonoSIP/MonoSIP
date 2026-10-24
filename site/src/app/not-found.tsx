"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { chrome, localeFromPath, pathFor } from "@/lib/locale";

export default function NotFound() {
  const locale = localeFromPath(usePathname() || "/");
  const t = chrome[locale];
  return (
    <div className="container not-found">
      <p className="eyebrow">{t.notFoundEyebrow}</p>
      <h1>
        {t.notFoundTitleA}
        <br />
        <span>{t.notFoundTitleB}</span>
      </h1>
      <p>{t.notFoundBody}</p>
      <div className="button-row">
        <Link className="button primary" href={pathFor(locale, "/")}>
          {t.notFoundHome} <Icon name="arrow" />
        </Link>
        <Link className="button secondary" href={pathFor(locale, "/docs/")}>
          {t.notFoundDocs}
        </Link>
      </div>
    </div>
  );
}
