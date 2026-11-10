import { defineConfig } from "vite";
import type { ProxyOptions } from 'vite';
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const apiProxy: ProxyOptions = {
  target: `http://127.0.0.1:${process.env.API_PORT || 5176}`,
  changeOrigin: false,
  configure(proxy) { proxy.on('proxyReq', (outgoing, incoming) => outgoing.setHeader('x-dreambusta-client', incoming.socket.remoteAddress || 'unknown')); },
};
export default defineConfig({
  plugins: [vue(), tailwindcss()],
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
    port: Number(process.env.WEB_PORT || 5175),
    strictPort: true,
    proxy: {
      "/api": apiProxy,
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5175,
    proxy: {
      "/api": apiProxy,
    },
  },
  esbuild: { jsx: "automatic" },
});
