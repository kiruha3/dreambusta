import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import { LocalModels } from "../server/search/models.ts";
import { SearchService } from "../server/search/service.ts";
import { Store } from "../server/store.ts";
import { modelName } from "../server/search/management.ts";

const sleep = (ms = 10) => new Promise((r) => setTimeout(r, ms));
async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean) {
  for (let i = 0; i < 2000; i++) {
    const value = await read();
    if (accept(value)) return value;
    await sleep();
  }
  throw new Error("Timed out waiting for model job");
}
test("model management HTTP enforces auth/CSRF, fixed loopback requests, download lifecycle, selection, persistence, unloading and offline status", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-models-http-"));
  const installed = [
    { name: "embeddinggemma:latest", size: 600000000 },
    { name: "gemma4:e2b", size: 3000000000 },
    { name: "unused:latest", size: 25 },
  ];
  let online = true,
    pullMode = "waiting",
    aborted = false;
  const requests: { path: string; method: string; body: any }[] = [];
  const daemon = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : {};
    requests.push({ path: req.url!, method: req.method!, body: data });
    if (!online) {
      res.writeHead(503);
      return res.end();
    }
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/tags")
      return res.end(JSON.stringify({ models: installed }));
    if (req.url === "/api/ps")
      return res.end(
        JSON.stringify({
          models: [{ name: "gemma4:e2b", size: 4000, size_vram: 2000 }],
        }),
      );
    if (req.url === "/api/pull") {
      if (pullMode === "headers") return;
      if (pullMode === "error")
        return res.end(JSON.stringify({ error: "registry rejected model" }));
      if (pullMode === "success") {
        installed.push({ name: data.model, size: 200 });
        return res.end('{"status":"success"}');
      }
      res.write('{"status":"downloading","completed":25,"total":100}\n');
      res.on("close", () => {
        aborted = true;
      });
      return;
    }
    if (req.url === "/api/generate") return res.end("{}");
    if (req.url === "/api/delete") {
      installed.splice(
        installed.findIndex((m) => m.name === data.model),
        1,
      );
      return res.end("{}");
    }
    res.writeHead(404);
    res.end("{}");
  });
  await new Promise<void>((r) => daemon.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(daemon.address() as any).port}`;
  const app = createApp({
    dataDir: dir,
    searchModels: new LocalModels({ url, enabled: false }),
  });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    app.modelManagement?.close();
    await app.search.close();
    app.server.closeAllConnections();
    await new Promise<void>((r) => app.server.close(() => r()));
    app.store.close();
    daemon.closeAllConnections();
    await new Promise<void>((r) => daemon.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://localhost:${(app.server.address() as any).port}/api`;
  const setup = await fetch(base + "/setup", {
    method: "POST",
    body: JSON.stringify({
      email: "model@example.test",
      password: "model-test-password-123",
    }),
  });
  const session = await setup.json();
  const cookie = setup.headers.get("set-cookie")!.split(";")[0];
  const req = (
    path: string,
    method = "GET",
    body?: any,
    headers: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method,
      headers: { cookie, "x-csrf-token": session.csrf, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const state = async () => (await req("/ai")).json();
  assert.equal((await fetch(base + "/ai")).status, 401);
  assert.equal(
    (
      await fetch(base + "/ai/pull", {
        method: "POST",
        headers: { cookie },
        body: '{"model":"x"}',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await req(
        "/ai/pull",
        "POST",
        { model: "x" },
        { origin: "https://bad.test" },
      )
    ).status,
    403,
  );
  const first = await state();
  assert.equal(first.online, true);
  assert.equal(first.installed.length, 3);
  assert.equal(first.running[0].sizeVram, 2000);
  const beforeInvalid = requests.length;
  for (const model of [
    "http://evil.test/model",
    "../../etc/passwd",
    "gemma;touch evil",
    "x\nanything",
    "C:\\x",
    "--bad",
    "a:tag/other",
    "x".repeat(181),
  ])
    assert.equal((await req("/ai/pull", "POST", { model })).status, 400);
  assert.equal(
    requests.length,
    beforeInvalid,
    "invalid identifiers never reach daemon",
  );
  assert.equal(
    (
      await req("/ai/pull", "POST", {
        model: "extra",
        url: "http://evil.test",
        command: "whoami",
      })
    ).status,
    202,
  );
  await until(state, (s) => s.pull?.completed === 25);
  assert.equal(
    (await req("/ai/pull", "POST", { model: "second" })).status,
    409,
  );
  assert.equal(
    (await req("/ai/models", "DELETE", { model: "extra" })).status,
    409,
  );
  assert.equal((await req("/ai/pull", "DELETE")).status, 200);
  await until(state, (s) => s.pull?.state === "cancelled");
  await until(async () => aborted, Boolean);
  pullMode = "error";
  assert.equal(
    (await req("/ai/pull", "POST", { model: "missing" })).status,
    202,
  );
  assert.match(
    (await until(state, (s) => s.pull?.state === "failed")).pull.error,
    /registry/,
  );
  pullMode = "success";
  assert.equal((await req("/ai/pull", "POST", { model: "extra" })).status, 202);
  await until(state, (s) => s.pull?.state === "complete");
  pullMode = "headers";
  await req("/ai/pull", "POST", { model: "stalled" });
  assert.match(
    (await until(state, (s) => s.pull?.state === "failed")).pull.error,
    /не ответила/,
  );
  const settings = {
    enabled: true,
    embeddingModel: "embeddinggemma:latest",
    answerModel: "gemma4:e2b",
  };
  assert.equal(
    (
      await req("/ai/settings", "PATCH", {
        ...settings,
        answerModel: "missing",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req("/ai/settings", "PATCH", {
        ...settings,
        url: "http://evil.test",
      })
    ).status,
    400,
  );
  assert.equal((await req("/ai/settings", "PATCH", settings)).status, 200);
  assert.equal(app.search.models.enabled, process.env.DREAMBUSTA_AI !== "off");
  assert.deepEqual(JSON.parse(app.store.setting("aiModels")), settings);
  assert.equal(
    (await req("/ai/models", "DELETE", { model: "gemma4:e2b" })).status,
    409,
  );
  assert.equal(
    (await req("/ai/models", "DELETE", { model: "unused" })).status,
    200,
  );
  assert.equal(
    (await req("/ai/unload", "POST", { model: "gemma4:e2b" })).status,
    200,
  );
  assert.deepEqual(requests.find((r) => r.path === "/api/generate")?.body, {
    model: "gemma4:e2b",
    keep_alive: 0,
  });
  online = false;
  assert.equal((await state()).online, false);
  assert.equal(
    (await req("/ai/settings", "PATCH", { ...settings, enabled: false }))
      .status,
    200,
    "can disable even if daemon is offline",
  );
  assert.equal(app.search.models.enabled, false);
  assert.equal(
    (await req("/ai/unload", "POST", { model: "gemma4:e2b" })).status,
    503,
  );
  assert.ok(
    requests.every((r) =>
      [
        "/api/tags",
        "/api/ps",
        "/api/pull",
        "/api/generate",
        "/api/delete",
      ].includes(r.path),
    ),
  );
  const reopened = createApp({
    dataDir: dir,
    searchModels: new LocalModels({ url, enabled: true }),
  });
  assert.equal(
    reopened.search.models.enabled,
    false,
    "saved disable survives app recreation",
  );
  await reopened.search.close();
  reopened.modelManagement?.close();
  reopened.store.close();
});

test("reconfiguration fences pending index vectors and answers even when a model ignores abort", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-models-race-"));
  const store = new Store(dir);
  store.createMaterial({
    title: "Договор",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор согласует руководитель."],
  });
  let finishEmbedding!: (vectors: number[][]) => void,
    finishAnswer!: (answer: any) => void;
  let embeddingStarted!: () => void, answerStarted!: () => void;
  const embeddingReady = new Promise<void>((r) => (embeddingStarted = r)),
    answerReady = new Promise<void>((r) => (answerStarted = r));
  const old = {
    enabled: true,
    embeddingModel: "old",
    embed: async () => {
      embeddingStarted();
      return new Promise<number[][]>((r) => (finishEmbedding = r));
    },
    generate: async () => {
      answerStarted();
      return new Promise<any>((r) => (finishAnswer = r));
    },
  };
  const search = new SearchService(store, { models: old });
  t.after(async () => {
    await search.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const indexing = search.idle();
  await embeddingReady;
  search.reconfigure({
    enabled: false,
    embeddingModel: "new",
    embed: async () => [],
    generate: async () => ({ sentences: [] }),
  });
  finishEmbedding([
    [1, 0],
    [1, 0],
  ]);
  await indexing;
  assert.equal(
    store.db
      .prepare(
        "SELECT COUNT(*) AS n FROM search_chunks WHERE model IS NOT NULL",
      )
      .get()!.n,
    0,
    "old embedding cannot receive a new model label",
  );
  search.reconfigure({ ...old, enabled: true });
  const answer = search.answer({ query: "согласует" }, () => true);
  await answerReady;
  search.reconfigure({
    enabled: false,
    embeddingModel: "new",
    embed: async () => [],
    generate: async () => ({ sentences: [] }),
  });
  finishAnswer({ sentences: [{ text: "Устаревший ответ", sources: [1] }] });
  assert.equal((await answer).status, "unavailable");
});

test("LocalModels rejects arbitrary network targets before any request", () => {
  for (const url of [
    "https://127.0.0.1:11434",
    "http://evil.test",
    "http://127.0.0.1/api",
    "http://user:pass@127.0.0.1",
    "http://127.0.0.1?x=1",
  ])
    assert.throws(() => new LocalModels({ url }), /локальном/);
});
test("Ollama dotted model and tag names are valid without enabling registry hosts or path traversal", () => {
  assert.equal(modelName("qwen2.5:1.5b"), "qwen2.5:1.5b");
  assert.equal(modelName("library/llama3.2"), "library/llama3.2:latest");
  for (const value of [
    "evil.test/library/gemma",
    "../gemma",
    "library/../gemma",
    ".",
    "..",
  ])
    assert.throws(() => modelName(value));
});

test("DREAMBUSTA_AI=off overrides saved enabled and prevents embeddings and answers until restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-models-off-"));
  const seed = new Store(dir);
  seed.setSetting(
    "aiModels",
    JSON.stringify({
      enabled: true,
      embeddingModel: "embeddinggemma:latest",
      answerModel: "gemma4:e2b",
    }),
  );
  seed.createMaterial({
    title: "Договор",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор согласует руководитель."],
  });
  seed.close();
  const previous = process.env.DREAMBUSTA_AI;
  process.env.DREAMBUSTA_AI = "off";
  let app: ReturnType<typeof createApp> | undefined;
  try {
    // Port 1 is deliberately unavailable; disabled AI must never need the daemon.
    app = createApp({
      dataDir: dir,
      searchModels: new LocalModels({
        url: "http://127.0.0.1:1",
        enabled: true,
      }),
    });
    assert.equal(app.search.models.enabled, false);
    await app.search.idle();
    assert.equal(
      (await app.search.answer({ query: "согласует" }, () => true)).status,
      "unavailable",
    );
    assert.equal(JSON.parse(app.store.setting("aiModels")).enabled, true);
    delete process.env.DREAMBUSTA_AI;
    assert.equal(
      app.search.models.enabled,
      false,
      "environment override remains fixed for this app lifetime",
    );
    await app.search.close();
    app.modelManagement?.close();
    app.store.close();
    app = undefined;
    app = createApp({
      dataDir: dir,
      searchModels: new LocalModels({
        url: "http://127.0.0.1:1",
        enabled: false,
      }),
    });
    assert.equal(
      app.search.models.enabled,
      true,
      "restart applies saved enabled after removing override",
    );
  } finally {
    if (app) {
      await app.search.close();
      app.modelManagement?.close();
      app.store.close();
    }
    if (previous === undefined) delete process.env.DREAMBUSTA_AI;
    else process.env.DREAMBUSTA_AI = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reconfiguration clears query embeddings while preserving vectors with matching model identity", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-query-cache-"));
  const store = new Store(dir);
  store.createMaterial({
    title: "Договор",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор согласует руководитель."],
  });
  let oldQueries = 0,
    newQueries = 0;
  const models = {
    enabled: true,
    embeddingModel: "same",
    embed: async (texts: string[]) => {
      if (texts[0].startsWith("task:")) oldQueries++;
      return texts.map(() => [1, 0]);
    },
    generate: async () => ({ sentences: [] }),
  };
  const search = new SearchService(store, { models });
  try {
    await search.idle();
    await search.search({ query: "согласует" }, true);
    await search.search({ query: "согласует" }, true);
    assert.equal(oldQueries, 1);
    search.reconfigure({
      ...models,
      embed: async (texts: string[]) => {
        if (texts[0].startsWith("task:")) newQueries++;
        return texts.map(() => [1, 0]);
      },
    });
    await search.search({ query: "согласует" }, true);
    assert.equal(newQueries, 1);
  } finally {
    await search.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
