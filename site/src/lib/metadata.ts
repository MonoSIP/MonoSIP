import type { Metadata } from "next";
import { site } from "./site";

export function pageMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: site.name,
      title: `${title} — MunaSIP`,
      description,
      url: path,
      images: [
        {
          url: "/brand/og-image.png",
          width: 1200,
          height: 630,
          alt: "MunaSIP — self-hosted company PBX",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — MunaSIP`,
      description,
      images: ["/brand/og-image.png"],
    },
  };
}
