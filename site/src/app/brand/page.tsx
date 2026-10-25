import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { BrandPage } from "@/views/brand";

export const metadata: Metadata = pageMetadata(
  "Brand assets",
  "Official MonoSIP SVG logo files, monochrome mark and brand colors, preserved from the original project.",
  "/brand/",
);

export default function Brand() {
  return <BrandPage locale="en" />;
}
