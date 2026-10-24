import type { Metadata } from "next";
import { navFor } from "@/lib/catalog";
import { getDocs } from "@/lib/docs";
import { pageMetadata } from "@/lib/metadata";
import { DocArticle } from "@/views/doc-article";

export const dynamicParams = false;
export function generateStaticParams() {
  return navFor("en").map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocs("en")[slug];
  if (!doc) return {};
  const title = navFor("en").find((item) => item.slug === slug)!.title;
  return pageMetadata(title, doc.summary, `/docs/${slug}/`);
}
export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <DocArticle locale="en" slug={slug} />;
}
