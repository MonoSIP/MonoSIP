"use client";

import { usePathname } from "next/navigation";
import { chrome, localeFromPath } from "@/lib/locale";

export function SkipLink() {
  const locale = localeFromPath(usePathname() || "/");
  return (
    <a href="#main" className="skip-link">
      {chrome[locale].skip}
    </a>
  );
}
