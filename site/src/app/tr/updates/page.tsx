import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { site } from "@/lib/site";
import { UpdatesPage } from "@/views/updates";

export const metadata: Metadata = pageMetadata(
  "Yenilikler",
  `MonoSIP ${site.version}: MonoSIP adı, göz önünde kalan sesli mesaj kutusu ve içeriye taşınan giriş tercihleri.`,
  "/tr/updates/",
  "tr",
);

export default function TurkishUpdates() {
  return <UpdatesPage locale="tr" />;
}
