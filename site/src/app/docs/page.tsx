import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { DocsIndex } from "@/views/docs-index";

export const metadata: Metadata = pageMetadata(
  "Documentation",
  "Install MunaSIP, design IVR flows, connect a browser softphone and understand the self-hosted PBX architecture.",
  "/docs/",
);

export default function DocsIndexPage() {
  return <DocsIndex locale="en" />;
}
