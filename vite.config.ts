import { defineConfig } from "vite";
import type { ProxyOptions } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { pdfjsAssets } from "./scripts/pdfjs-assets";
const privateStorage = resolve(process.env.DATA_DIR || "data").replaceAll(
  "\\",
  "/",
);
function inside(path: string, directory: string) {
  const part = relative(directory, path);
  return (
    !part ||
    (part !== ".." && !part.startsWith(".." + sep) && !isAbsolute(part))
  );
}
const apiProxy: ProxyOptions = {
  target: `http://127.0.0.1:${process.env.API_PORT || 5176}`,
  changeOrigin: false,
  configure(proxy) {
    proxy.on("proxyReq", (outgoing, incoming) =>
      outgoing.setHeader(
        "x-dreambusta-client",
        incoming.socket.remoteAddress || "unknown",
      ),
    );
  },
};
export default defineConfig({
  plugins: [
    pdfjsAssets(),
    vue(),
    tailwindcss(),
    {
      name: "private-library-storage",
      configResolved(config) {
        // Vite intentionally skips fs.deny for publicDir; never place storage there.
        if (
          (config.publicDir && inside(privateStorage, config.publicDir)) ||
          inside(privateStorage, resolve(config.root, config.build.outDir)) ||
          inside(config.root, privateStorage)
        ) {
          throw new Error(
            "DATA_DIR должен находиться вне public/, dist/ и не содержать исходники приложения. Используйте отдельную папку data/.",
          );
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@docx": fileURLToPath(
        new URL("./vendor/docx-editor/src", import.meta.url),
      ),
    },
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.WEB_PORT || 5173),
    strictPort: true,
    fs: {
      // API authorization is the only route to private storage, including /@fs/.
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/data/**",
        `${privateStorage}/**`,
      ],
    },
    proxy: {
      "/api": apiProxy,
    },
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.WEB_PORT || 5173),
    proxy: {
      "/api": apiProxy,
    },
  },
  esbuild: { jsx: "automatic" },
});
