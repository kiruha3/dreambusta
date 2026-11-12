import { createServer as httpServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer as viteServer } from "vite";
import { createApp } from "../server/app.ts";
import { LocalModels } from "../server/search/models.ts";

const dir = mkdtempSync(join(tmpdir(), "dreambusta-models-browser-"));
const installed = [
  { name: "embeddinggemma:latest", size: 600000000 },
  { name: "gemma4:e2b", size: 3000000000 },
];
let online = true,
  pulls = 0,
  unloads = 0,
  cancelled = false,
  polls = 0;
const daemon = httpServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  const data = text ? JSON.parse(text) : {};
  if (!online) {
    res.writeHead(503);
    return res.end();
  }
  res.setHeader("content-type", "application/json");
  if (req.url === "/api/tags") {
    polls++;
    return res.end(JSON.stringify({ models: installed }));
  }
  if (req.url === "/api/ps")
    return res.end(
      JSON.stringify({
        models: unloads
          ? []
          : [{ name: "gemma4:e2b", size: 4000000000, size_vram: 0 }],
      }),
    );
  if (req.url === "/api/generate") {
    assert.equal(data.keep_alive, 0);
    unloads++;
    return res.end("{}");
  }
  if (req.url === "/api/pull") {
    pulls++;
    if (data.model === "qwen2.5:1.5b") {
      installed.push({ name: data.model, size: 1000000000 });
      return res.end('{"status":"success"}');
    }
    res.write('{"status":"downloading","completed":25,"total":100}\n');
    res.on("close", () => (cancelled = true));
    return;
  }
  res.writeHead(404);
  res.end("{}");
});
const listen = (server) => new Promise((r) => server.listen(0, "127.0.0.1", r));
let app, web, browser;
try {
  await listen(daemon);
  const daemonUrl = `http://127.0.0.1:${daemon.address().port}`;
  delete process.env.DREAMBUSTA_AI;
  app = createApp({
    dataDir: dir,
    searchModels: new LocalModels({ url: daemonUrl, enabled: false }),
  });
  await listen(app.server);
  process.env.DATA_DIR = dir;
  process.env.API_PORT = String(app.server.address().port);
  process.env.DREAMBUSTA_BASE_PATH = "/library";
  web = await viteServer({
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    logLevel: "error",
  });
  await web.listen();
  const base = `http://localhost:${web.httpServer.address().port}/library`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const setup = await context.request.post(base + "/api/setup", {
    data: {
      email: "models@example.test",
      password: "models-browser-password-123",
    },
  });
  assert.equal(setup.status(), 201);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/admin/ai");
  await page
    .getByRole("heading", { name: "Ollama доступна", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Локальные модели", exact: true })
      .getAttribute("href"),
    "/library/admin/ai",
  );
  await page.getByLabel("Имя модели Ollama").fill("extra:latest");
  await page.getByRole("button", { name: "Скачать", exact: true }).click();
  await page.getByText("25% ·", { exact: false }).waitFor();
  assert.equal(pulls, 1);
  await page.getByRole("button", { name: "Отменить загрузку" }).click();
  await page.getByText("Загрузка отменена", { exact: true }).waitFor();
  assert.equal(cancelled, true);
  await page.getByLabel("Имя модели Ollama").fill("qwen2.5:1.5b");
  await page.getByRole("button", { name: "Скачать", exact: true }).click();
  await page.getByText("Модель скачана", { exact: true }).waitFor();
  await page
    .getByLabel("Модель для ответов", { exact: true })
    .selectOption("qwen2.5:1.5b");
  await page.getByLabel("Включить поиск по смыслу и ответы").check();
  await page.getByRole("button", { name: "Сохранить выбор" }).click();
  await page
    .getByText("Настройки моделей сохранены", { exact: true })
    .waitFor();
  assert.equal(app.search.models.enabled, true);
  assert.equal(app.search.models.answerModel, "qwen2.5:1.5b");
  await page.getByRole("button", { name: "Выгрузить", exact: true }).click();
  await page
    .getByText("Загруженных в память моделей нет.", { exact: true })
    .waitFor();
  assert.equal(unloads, 1);
  await page.getByLabel("Имя модели Ollama").fill("http://evil.test/x");
  await page.getByRole("button", { name: "Скачать", exact: true }).click();
  await page
    .getByRole("alert")
    .getByText(/Укажите имя модели/)
    .waitFor();
  assert.equal(pulls, 2, "invalid model is rejected before daemon request");
  online = false;
  await page.getByRole("button", { name: "Обновить", exact: true }).click();
  await page
    .getByRole("heading", { name: "Ollama недоступна", exact: true })
    .waitFor();
  assert.match(
    await page.getByText(/При первой установке/).innerText(),
    /systemd/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "models page fits phone width",
  );
  online = true;
  await page.getByRole("button", { name: "Обновить", exact: true }).click();
  await page
    .getByRole("heading", { name: "Ollama доступна", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "Настройки", exact: true }).click();
  await page
    .getByRole("heading", { name: "Настройки библиотеки", exact: true })
    .waitFor();
  await page.waitForTimeout(200);
  const finalPolls = polls;
  await page.waitForTimeout(1700);
  assert.equal(polls, finalPolls, "page unmount stops model polling");
  assert.deepEqual(errors, []);
  console.log(
    "Models browser checks passed: mounted auth UI, pull progress/cancel, selection, RAM unload, validation, offline/systemd status, phone layout and poll cleanup.",
  );
} finally {
  await browser?.close();
  await web?.close();
  if (app) {
    app.modelManagement?.close();
    await app.search.close();
    app.server.closeAllConnections();
    await new Promise((r) => app.server.close(r));
    app.store.close();
  }
  daemon.closeAllConnections();
  await new Promise((r) => daemon.close(r));
  rmSync(dir, { recursive: true, force: true });
}
