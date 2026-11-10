import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";

test("frontend cannot serve database, WAL or hidden originals, including configured storage and @fs", async () => {
  const root = mkdtempSync(join(tmpdir(), "dreambusta-vite-"));
  const previous = process.env.DATA_DIR;
  const storage = join(root, "private-library");
  process.env.DATA_DIR = storage;
  const paths = [
    "library.sqlite",
    "library.sqlite-wal",
    "files/hidden/original.pdf",
  ];
  for (const folder of ["data", "private-library"]) {
    mkdirSync(join(root, folder, "files/hidden"), { recursive: true });
    for (const path of paths)
      writeFileSync(join(root, folder, path), "private fixture");
  }
  const server = await createServer({
    configFile: resolve("vite.config.ts"),
    root,
    publicDir: false,
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
  });
  try {
    await server.listen();
    const port = (server.httpServer!.address() as { port: number }).port;
    for (const folder of ["data", "private-library"])
      for (const path of paths) {
        for (const url of [
          `/${folder}/${path}`,
          `/@fs/${join(root, folder, path).replaceAll("\\", "/")}`,
        ]) {
          const response = await fetch(`http://127.0.0.1:${port}${url}`, {
            method: "HEAD",
          });
          assert.ok(
            [403, 404].includes(response.status),
            `${url} exposed with HTTP ${response.status}`,
          );
        }
      }
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("storage cannot be configured under public assets or build output", async () => {
  const root = mkdtempSync(join(tmpdir(), "dreambusta-vite-public-"));
  const previous = process.env.DATA_DIR;
  try {
    for (const folder of ["public/library", "dist/library"]) {
      process.env.DATA_DIR = join(root, folder);
      let server: Awaited<ReturnType<typeof createServer>> | undefined;
      try {
        await assert.rejects(async () => {
          server = await createServer({
            configFile: resolve("vite.config.ts"),
            root,
            server: { port: 0 },
          });
        }, /DATA_DIR/);
      } finally {
        await server?.close();
      }
    }
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
