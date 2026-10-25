import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  // Published at the root of https://www.monosip.com.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default config;
