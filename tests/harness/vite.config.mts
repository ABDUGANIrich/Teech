import { defineConfig } from "vite";
import path from "node:path";
export default defineConfig({
  root: path.resolve("tests/harness"),
  resolve: {
    alias: {
      "@": path.resolve("src"),
      "next/link": path.resolve("tests/harness/link.tsx"),
      "next/navigation": path.resolve("tests/harness/navigation.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
    fs: { allow: [path.resolve(".")] },
  },
  esbuild: { jsx: "automatic" },
});
