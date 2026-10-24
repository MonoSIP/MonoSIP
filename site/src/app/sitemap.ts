import type { MetadataRoute } from "next";
import { docNav, site } from "@/lib/site";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  const english = [
    "/",
    "/download/",
    "/updates/",
    "/brand/",
    "/docs/",
    ...docNav.map(({ slug }) => `/docs/${slug}/`),
  ];
  return [
    ...english,
    ...english.map((path) => (path === "/" ? "/tr/" : `/tr${path}`)),
  ].map((path) => ({
    url: `${site.url}${path}`,
    changeFrequency: "monthly" as const,
    priority: path === "/" ? 1 : path === "/tr/" ? 0.9 : 0.7,
  }));
}
