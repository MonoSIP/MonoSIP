import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  // GitHub Pages project site: https://monosip.github.io/MonoSIP/
  basePath: "/MonoSIP",
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default config;
