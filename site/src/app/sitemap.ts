import type { MetadataRoute } from "next";
import { docNav, site } from "@/lib/site";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "/",
    "/download/",
    "/updates/",
    "/brand/",
    "/docs/",
    ...docNav.map(({ slug }) => `/docs/${slug}/`),
  ].map((path) => ({
    url: `${site.url}${path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
