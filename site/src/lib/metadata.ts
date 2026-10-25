import type { Metadata } from "next";
import type { Locale } from "./locale";
import { pathFor } from "./locale";
import { brandFile, site } from "./site";

export function pageMetadata(
  title: string,
  description: string,
  path: string,
  locale: Locale = "en",
): Metadata {
  const en = pathFor("en", path);
  const tr = pathFor("tr", path);
  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: { en, tr, "x-default": en },
    },
    openGraph: {
      type: "website",
      locale: locale === "tr" ? "tr_TR" : "en_US",
      siteName: site.name,
      title: `${title} — MonoSIP`,
      description,
      url: path,
      images: [
        {
          url: brandFile("og-image.png"),
          width: 1200,
          height: 630,
          alt: "MonoSIP — self-hosted company PBX",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — MonoSIP`,
      description,
      images: [brandFile("og-image.png")],
    },
  };
}
