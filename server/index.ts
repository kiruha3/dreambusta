import { resolve } from "node:path";
import { createApp } from "./app.ts";
const { server, store } = createApp({
  dataDir: resolve(process.env.DATA_DIR || "data"),
});
const port = Number(process.env.API_PORT || 5176);
server.requestTimeout = 10 * 60 * 1000;
server.listen(port, process.env.API_HOST || "0.0.0.0", () =>
  console.log(`DreamBusta API: http://localhost:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
