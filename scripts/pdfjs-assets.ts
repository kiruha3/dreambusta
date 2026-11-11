import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

/** Keep PDF.js codecs/fonts local and matched to the installed engine version. */
export function pdfjsAssets(): Plugin {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve("pdfjs-dist/package.json");
  const root = dirname(packagePath);
  const version = JSON.parse(readFileSync(packagePath, "utf8")).version;
  const prefix = `pdfjs/${version}/`;
  const viewerCss = join(root, "web", "pdf_viewer.css").replaceAll("\\", "/");
  const assets = new Map<string, string>();
  for (const directory of ["wasm", "cmaps", "standard_fonts"])
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true }))
      if (entry.isFile()) assets.set(`${directory}/${entry.name}`, join(root, directory, entry.name));
  return {
    name: "local-pdfjs-assets",
    enforce: "pre",
    transform(code, id) {
      if (id.split("?")[0].replaceAll("\\", "/") !== viewerCss) return;
      // The upstream viewer also styles generic .sidebar and :root selectors.
      // Keep all of its styles, including inserted page/text layers, in the PDF island.
      return { code: `@scope (.pdf-workspace) {\n${code.replaceAll(":root", ":scope")}\n}`, map: null };
    },
    configureServer(server) {
      server.middlewares.use(`/${prefix}`, (req, res) => {
        const name = (req.url || "").split("?")[0].replace(/^\//, "");
        const path = assets.get(name);
        if (!path) { res.statusCode = 404; res.end(); return; }
        res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".js") ? "application/javascript" : "application/octet-stream");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.end(readFileSync(path));
      });
    },
    generateBundle() {
      for (const [name, path] of assets)
        this.emitFile({ type: "asset", fileName: prefix + name, source: readFileSync(path) });
    },
  };
}
