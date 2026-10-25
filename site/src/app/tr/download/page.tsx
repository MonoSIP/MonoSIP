import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { site } from "@/lib/site";
import { DownloadPage } from "@/views/download";

export const metadata: Metadata = pageMetadata(
  "İndir ve kur",
  `Linux x86-64 sunucunuz için MonoSIP ${site.version}: hazır Docker imajını çekin veya sürüm kaynağını indirin.`,
  "/tr/download/",
  "tr",
);

export default function TurkishDownload() {
  return <DownloadPage locale="tr" />;
}
