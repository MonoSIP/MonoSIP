import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { site } from "@/lib/site";
import { UpdatesPage } from "@/views/updates";

export const metadata: Metadata = pageMetadata(
  "What's new",
  `MonoSIP ${site.version}: the MonoSIP name, a voicemail inbox that stays in view, and sign-in preferences that follow you in.`,
  "/updates/",
);

export default function Updates() {
  return <UpdatesPage locale="en" />;
}
