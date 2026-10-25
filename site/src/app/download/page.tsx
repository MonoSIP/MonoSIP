import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { site } from "@/lib/site";
import { DownloadPage } from "@/views/download";

export const metadata: Metadata = pageMetadata(
  "Download & install",
  `Get MonoSIP ${site.version} for your Linux x86-64 server: pull the prebuilt Docker image or download the release source.`,
  "/download/",
);

export default function Download() {
  return <DownloadPage locale="en" />;
}
