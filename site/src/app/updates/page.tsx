import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { site } from "@/lib/site";
import { UpdatesPage } from "@/views/updates";

export const metadata: Metadata = pageMetadata(
  "What's new",
  `MunaSIP ${site.version}: voicemail inbox, provider caller ID and a PBX readiness gate. Release notes and the latest main-branch work.`,
  "/updates/",
);

export default function Updates() {
  return <UpdatesPage locale="en" />;
}
