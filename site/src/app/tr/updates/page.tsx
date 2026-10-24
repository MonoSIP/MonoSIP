import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { site } from "@/lib/site";
import { UpdatesPage } from "@/views/updates";

export const metadata: Metadata = pageMetadata(
  "Yenilikler",
  `MunaSIP ${site.version}: sesli mesaj kutusu, operatör arayan kimliği ve santral hazır olma kapısı. Sürüm notları ve ana daldaki son iş.`,
  "/tr/updates/",
  "tr",
);

export default function TurkishUpdates() {
  return <UpdatesPage locale="tr" />;
}
