import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { BrandPage } from "@/views/brand";

export const metadata: Metadata = pageMetadata(
  "Marka dosyaları",
  "Özgün projeden korunan resmi MonoSIP SVG logo dosyaları, tek renkli işaret ve marka renkleri.",
  "/tr/brand/",
  "tr",
);

export default function TurkishBrand() {
  return <BrandPage locale="tr" />;
}
