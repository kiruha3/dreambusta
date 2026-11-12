import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { Store } from "../server/store.ts";
const dir = mkdtempSync(join(tmpdir(), "dreambusta-knowledge-ui-"));
const store = new Store(dir);
const doc = store.createMaterial({
  title: "Руководство",
  kind: "document",
  source: { type: "file" },
  representations: ["article"],
  paragraphs: ["Рабочая инструкция"],
  html: "<p>Рабочая инструкция</p>",
});
const book = store.createMaterial({
  title: "Книга с длинным названием для проверки сетки",
  kind: "book",
  source: { type: "file" },
  paragraphs: ["Книжный текст"],
});
const hidden = store.createMaterial({
  title: "Скрытая инструкция",
  kind: "document",
  visible: false,
  source: { type: "file" },
  paragraphs: ["Закрытый текст"],
});
store.saveCollection({ title: "Подборка", materialIds: [doc.id, book.id] });
store.saveCollection({
  title:
    "Подборка с очень длинным заголовком, который занимает несколько строк",
  materialIds: [doc.id],
});
store.close();
const env = {
  ...process.env,
  DATA_DIR: dir,
  DREAMBUSTA_AI: "off",
  API_PORT: "5216",
  WEB_PORT: "5215",
  API_HOST: "127.0.0.1",
};
const logs = [];
const children = [
  ["--experimental-strip-types", "server/index.ts"],
  ["node_modules/vite/bin/vite.js"],
].map((args) => {
  const child = spawn(process.execPath, args, {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => logs.push(String(data)));
  child.stderr.on("data", (data) => logs.push(String(data)));
  return child;
});
const base = "http://localhost:5215";
let browser;
const artifacts = ".superpowers/knowledge";
mkdirSync(artifacts, { recursive: true });
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/session")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const setup = await context.request.post(base + "/api/setup", {
    data: {
      email: "editor@example.test",
      password: "temporary-test-password-123",
    },
  });
  assert.equal(setup.status(), 201);
  const auth = await setup.json();
  await page.goto(base + "/admin");
  await page.getByRole("heading", { name: "Кабинет редактора" }).waitFor();
  const grid = await page.locator(".admin-tile").evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      const h = n.querySelector("h2").getBoundingClientRect();
      const p = n.querySelector("p").getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        title: h.y,
        description: p.y,
      };
    }),
  );
  assert.equal(grid.length, 6);
  for (let i = 1; i < 3; i++) {
    assert.ok(Math.abs(grid[0].y - grid[i].y) < 1);
    assert.ok(Math.abs(grid[0].height - grid[i].height) < 1);
    assert.ok(Math.abs(grid[0].title - grid[i].title) < 1);
    assert.ok(Math.abs(grid[0].description - grid[i].description) < 1);
  }
  await page.screenshot({
    path: artifacts + "/admin-desktop.png",
    fullPage: true,
  });
  const search = await page.locator(".top-search").boundingBox();
  const header = await page.locator(".topbar").boundingBox();
  assert.ok(search.width > header.width * 0.65);
  await page.getByLabel("Поиск по всем материалам").fill("Руководство");
  await page
    .getByRole("button", { name: "Поиск по библиотеке", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Поисковый запрос" }).waitFor();
  assert.equal(
    await page.getByRole("combobox", { name: "Поисковый запрос" }).inputValue(),
    "Руководство",
  );
  await page.keyboard.press("Escape");
  await page.goto(base + "/admin/settings");
  await page.getByLabel("Руководство", { exact: true }).check();
  await page.getByLabel(book.title, { exact: true }).check();
  await page.getByLabel("Скрытая инструкция", { exact: false }).check();
  await page
    .getByRole("button", { name: `Поднять ${book.title}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Сохранить настройки", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Настройки сохранены" })
    .waitFor();
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(base + "/knowledge");
  await guestPage
    .getByRole("heading", { name: "База знаний", exact: true })
    .waitFor();
  const pins = guestPage.getByRole("navigation", {
    name: "Выбранные материалы",
  });
  await pins.getByRole("link", { name: "Руководство", exact: true }).waitFor();
  assert.deepEqual(await pins.getByRole("link").allTextContents(), [
    book.title,
    doc.title,
  ]);
  assert.equal(await guestPage.locator(".material-card").count(), 1);
  await page.goto(base + `/admin/materials/${book.id}`);
  await page.getByLabel("Включить в базу знаний").check();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Изменения сохранены" })
    .waitFor();
  await guestPage.reload();
  await guestPage.waitForFunction(
    () => document.querySelectorAll(".material-card").length === 2,
  );
  await page.goto(base + "/admin/widgets");
  await page
    .getByRole("button", { name: "Создать помощника", exact: true })
    .click();
  await page.getByLabel("Название в кабинете").fill("Помощник поддержки");
  await page.getByLabel("Заголовок окна").fill("Спросите Дримбусту");
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "origin" }).waitFor();
  await page.getByLabel("Разрешённые сайты").fill("https://example.test");
  await page.getByLabel("Руководство", { exact: true }).check();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await page
    .getByRole("button", { name: "Приостановить", exact: true })
    .waitFor();
  const frame = page.frameLocator(".widget-preview");
  await frame.getByLabel("Ваш вопрос").waitFor();
  await frame.getByLabel("Ваш вопрос").fill("Что в руководстве?");
  const snippet = await page.getByLabel("Код для вставки").inputValue();
  assert.match(snippet, /data-mode="floating"/);
  assert.match(snippet, /http:\/\/localhost:5215\/embed.js/);
  await page.getByLabel("Вид размещения").selectOption("inline");
  assert.match(
    await page.getByLabel("Код для вставки").inputValue(),
    /data-target="dreambusta-assistant"/,
  );
  await page
    .getByRole("button", { name: "Приостановить", exact: true })
    .click();
  await page
    .getByText("Предпросмотр появится после публикации", { exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await page
    .getByRole("button", { name: "Приостановить", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: artifacts + "/widgets-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.goto(base + "/admin");
  await page.getByRole("heading", { name: "Кабинет редактора" }).waitFor();
  const mobile = await page
    .locator(".admin-tile")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().x));
  assert.ok(mobile.every((x) => Math.abs(x - mobile[0]) < 1));
  await page.goto(base + "/collections");
  await page.locator(".collection-card").first().waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const boxes = await page.locator(".collection-card").evaluateAll((ns) =>
    ns.map((n) => {
      const b = n.getBoundingClientRect();
      return { y: b.y, height: b.height };
    }),
  );
  assert.equal(boxes[0].y, boxes[1].y);
  assert.equal(boxes[0].height, boxes[1].height);
  const widgetList = await (
    await context.request.get(base + "/api/widgets")
  ).json();
  assert.equal(widgetList.length, 1);
  assert.deepEqual(widgetList[0].materialIds, [doc.id]);
  page.once("dialog", (d) => d.accept());
  await page.goto(base + "/admin/widgets");
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page
    .getByText("Создайте помощника, укажите сайты", { exact: false })
    .waitFor();
  assert.deepEqual(errors, []);
  await guest.close();
  console.log(
    "PASS: dashboard/common grid, full-width seeded search, ordered guest menu, knowledge flag, widget create/validation/publish/preview/pause/embed code/delete, mobile.",
  );
} catch (e) {
  console.error(logs.join(""));
  throw e;
} finally {
  await browser?.close();
  for (const child of children) child.kill();
  await Promise.all(
    children.map(
      (child) =>
        new Promise((r) =>
          child.exitCode !== null ? r() : child.once("exit", r),
        ),
    ),
  );
  rmSync(dir, { recursive: true, force: true });
}
