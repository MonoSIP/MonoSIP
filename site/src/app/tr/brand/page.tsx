import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { BrandPage } from "@/views/brand";

export const metadata: Metadata = pageMetadata(
  "Marka dosyaları",
  "MonoSIP logo dosyaları: ses işareti, yazı işareti, kilitli düzenler ve uygulama ikonları.",
  "/tr/brand/",
  "tr",
);

export default function TurkishBrand() {
  return <BrandPage locale="tr" />;
}
