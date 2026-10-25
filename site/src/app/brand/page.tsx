import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { BrandPage } from "@/views/brand";

export const metadata: Metadata = pageMetadata(
  "Brand assets",
  "MonoSIP logo files: the sound mark, wordmark, lockups and app icons.",
  "/brand/",
);

export default function Brand() {
  return <BrandPage locale="en" />;
}
