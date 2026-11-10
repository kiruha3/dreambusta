import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { makePdf, makeDocx, makePptx } from "./fixtures/documents.mjs";
const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try {
    return require("playwright");
  } catch {
    return require("C:/Users/kirill/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
  }
})();
const dir = mkdtempSync(join(tmpdir(), "dreambusta-e2e-"));
const env = {
  ...process.env,
  DATA_DIR: dir,
  API_PORT: "5186",
  WEB_PORT: "5185",
  API_HOST: "127.0.0.1",
};
const log = [];
const children = [
  ["--experimental-strip-types", "server/index.ts"],
  ["node_modules/vite/bin/vite.js"],
].map((args) => {
  const p = spawn(process.execPath, args, {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", (x) => log.push(String(x)));
  p.stderr.on("data", (x) => log.push(String(x)));
  return p;
});
const base = "http://localhost:5185";
let browser;
let page;
const artifacts = ".superpowers/e2e";
mkdirSync(artifacts, { recursive: true });
try {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base)).ok && (await fetch(base + "/api/session")).ok)
        break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/library");
  await page.getByText("Ваша библиотека начинается здесь").waitFor();
  await page
    .getByRole("link", { name: "Создать редактора", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("editor@example.test");
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("test-only-password-12345");
  await page
    .getByRole("button", { name: "Создать редактора", exact: true })
    .click();
  await page.waitForURL("**/admin/materials");
  await page.goto(base + "/admin/add");
  await page.getByLabel("Выбрать файлы", { exact: true }).setInputFiles({
    name: "Первые шаги.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# Первые шаги\n\nПервый абзац помогает разобраться в библиотеке.\n\nВторой абзац содержит полезный материал для скорочтения и проверки сохранения позиции.",
    ),
  });
  await page.waitForURL(/\/admin\/materials\/[^/]+$/);
  await page
    .getByLabel("Название", { exact: true })
    .fill("Руководство команды");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Изменения сохранены" })
    .waitFor();
  await page.getByRole("link", { name: "Открыть", exact: true }).click();
  await page.waitForURL("**/library/pervye-shagi");
  await page.getByRole("button", { name: "Статья", exact: true }).click();
  await page
    .locator(".reading-article h1")
    .filter({ hasText: "Первые шаги" })
    .waitFor();
  await page.getByRole("button", { name: "Текст", exact: true }).click();
  await page
    .locator(".reading-word")
    .filter({ hasText: /^помогает$/ })
    .click({ timeout: 3000 });
  assert.ok(
    Number(await page.locator(".reader-controls").getAttribute("data-index")) >
      1,
  );
  await page.getByRole("button", { name: "Скорочтение", exact: true }).click();
  await page
    .getByRole("button", { name: "Начать чтение", exact: true })
    .click();
  await page.waitForTimeout(850);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  const progress = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((x) => x.startsWith("dreambusta-progress:"))
      .map((x) => JSON.parse(localStorage.getItem(x))),
  );
  assert.ok(progress[0].index > 0);
  await page.reload();
  await page
    .getByRole("button", { name: "Начать чтение", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".reader-controls").getAttribute("data-index"),
    String(progress[0].index),
  );
  await page.screenshot({
    path: artifacts + "/reader-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Добавить в избранное" }).click();
  await page.goto(base + "/library?view=favorites");
  await page
    .locator(".material-card")
    .filter({ hasText: "Руководство команды" })
    .waitFor();
  await page.goto(base + "/admin/collections/new");
  await page.getByLabel("Название", { exact: true }).fill("Старт команды");
  await page
    .getByRole("button", { name: "Руководство команды", exact: true })
    .click();
  await page.getByRole("button", { name: "Сохранить подборку" }).click();
  await page.waitForURL("**/collections/start-komandy");
  await page.locator(".material-card").waitFor();
  assert.equal(await page.locator(".material-card").count(), 1);
  const { csrf } = await (await page.request.get(base + "/api/session")).json();
  const upload = async (name, bytes) => {
    const response = await page.request.post(
      base + "/api/uploads?name=" + encodeURIComponent(name),
      {
        data: bytes,
        headers: {
          "x-csrf-token": csrf,
          "Content-Type": "application/octet-stream",
        },
      },
    );
    assert.equal(response.status(), 201);
    const m = await response.json();
    assert.equal(m.state, "ready", m.error);
    return m;
  };
  const scan = await upload("Скан.pdf", makePdf());
  await page.goto(base + "/library/" + scan.slug);
  await page.locator(".pdf-canvas-stage canvas").waitFor();
  await page.waitForFunction(
    () => document.querySelector(".pdf-canvas-stage canvas")?.width > 100,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Скорочтение", exact: true })
      .count(),
    0,
  );
  await page.screenshot({ path: artifacts + "/scan-pdf.png", fullPage: true });
  const docx = await upload("Договор.docx", await makeDocx());
  await page.goto(base + "/library/" + docx.slug);
  await page.getByRole("button", { name: "Документ", exact: true }).click();
  await page
    .locator(".docx-island")
    .getByText("Документ с таблицей", { exact: true })
    .waitFor();
  await page.locator(".docx-island table").waitFor();
  assert.equal(await page.locator('.docx-island [contenteditable=true]').count(), 0, 'Word must stay read-only');
  await page.screenshot({ path: artifacts + "/word.png", fullPage: true });
  const pptx = await upload("Презентация.pptx", await makePptx());
  await page.goto(base + "/library/" + pptx.slug);
  await page.getByRole("button", { name: "Слайды", exact: true }).click();
  await page.locator(".slides-stage").getByText("Первый слайд").waitFor();
  await page.getByRole("button", { name: "Следующий слайд" }).click();
  await page.locator(".slides-stage").getByText("Второй по порядку").waitFor();
  await page.screenshot({ path: artifacts + "/slides.png", fullPage: true });
  const long = await upload('Большая книга.txt', Buffer.from(Array.from({length: 700}, (_, i) => `Абзац ${i}. ` + 'Слова большой книги. '.repeat(25)).join('\n\n')));
  await page.goto(base + '/library/' + long.slug); await page.locator('.reading-word').first().waitFor(); assert.ok(await page.locator('.reading-word').count() < 1500, 'large book renders only visible rows');
  await page.getByLabel('Позиция в тексте', {exact:true}).fill('50000'); await page.getByRole('button',{name:'Моё место'}).click();
  await page.waitForFunction(() => document.querySelector('.virtual-reader').scrollTop > 5000);
  const wav = Buffer.alloc(44 + 8000 * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length - 44,40);
  const audio = await upload('Подкаст.wav', wav); await page.goto(base + '/library/' + audio.slug); await page.waitForFunction(() => document.querySelector('audio')?.duration > 0); assert.equal(await page.getByRole('button', {name:'Текст',exact:true}).count(),0);
  await page.goto(base + "/library");
  await page.locator(".material-card").first().waitFor();
  await page.screenshot({
    path: artifacts + "/catalog-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: artifacts + "/catalog-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "mobile catalogue overflow",
  );
  await page.getByRole("button", { name: "Тёмная тема" }).click();
  await page.screenshot({
    path: artifacts + "/catalog-dark.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: editor setup → MD upload → title/stable link → article → reader/progress → favorites → collection → PDF scan → DOCX table → ordered PPTX slides → mobile/dark.",
  );
} catch (e) {
  if (page) {
    await page
      .screenshot({ path: artifacts + "/failure.png", fullPage: true })
      .catch(() => {});
    console.error(
      "Browser state:",
      await page
        .locator("main")
        .innerText()
        .catch(() => "no main"),
    );
  }
  throw e;
} finally {
  if (browser) await browser.close();
  await Promise.all(
    children.map(
      (p) =>
        new Promise((r) => {
          if (p.exitCode !== null) return r();
          p.once("exit", r);
          p.kill();
        }),
    ),
  );
  writeFileSync(artifacts + "/server.log", log.join(""));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
