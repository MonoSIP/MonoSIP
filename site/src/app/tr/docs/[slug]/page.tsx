import type { Metadata } from "next";
import { navFor } from "@/lib/catalog";
import { getDocs } from "@/lib/docs";
import { pageMetadata } from "@/lib/metadata";
import { DocArticle } from "@/views/doc-article";

export const dynamicParams = false;
export function generateStaticParams() {
  return navFor("tr").map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocs("tr")[slug];
  if (!doc) return {};
  const title = navFor("tr").find((item) => item.slug === slug)!.title;
  return pageMetadata(title, doc.summary, `/tr/docs/${slug}/`, "tr");
}
export default async function TurkishDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <DocArticle locale="tr" slug={slug} />;
}
