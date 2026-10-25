import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { DocsIndex } from "@/views/docs-index";

export const metadata: Metadata = pageMetadata(
  "Belgeler",
  "MonoSIP’i kurun, IVR akışları tasarlayın, tarayıcı telefonunu bağlayın ve kendi sunucunuzdaki santralin mimarisini anlayın.",
  "/tr/docs/",
  "tr",
);

export default function TurkishDocs() {
  return <DocsIndex locale="tr" />;
}
