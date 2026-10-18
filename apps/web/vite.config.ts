import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as {
  version: string;
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Keep React ecosystem in one chunk to avoid circular vendor↔react splits.
          if (
            id.includes("react-dom") ||
            id.includes("react-router") ||
            id.includes("/react/") ||
            id.includes("scheduler")
          ) {
            return "react-vendor";
          }
          if (id.includes("@xyflow") || id.includes("/xyflow")) return "flow-vendor";
          if (id.includes("wavesurfer")) return "wave-vendor";
          if (id.includes("sip.js") || id.includes("/sipjs")) return "sip-vendor";
          if (id.includes("recharts") || id.includes("/d3-")) return "charts-vendor";
          if (id.includes("lucide-react")) return "icons-vendor";
          if (id.includes("i18next")) return "i18n-vendor";
          if (id.includes("@tanstack")) return "query-vendor";
        },
      },
    },
  },
});
