import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { Store } from "../server/store.ts";
import { makePdf, makePptx } from "./fixtures/documents.mjs";
import { processFile } from "../server/processing.ts";
const dir = mkdtempSync(join(tmpdir(), "dreambusta-search-ui-"));
const artifacts = ".superpowers/search/e2e";
mkdirSync(artifacts, { recursive: true });
const store = new Store(dir);
const book = store.createMaterial({
  title: "Книга о договорах",
  kind: "book",
  source: { type: "file" },
  representations: ["text"],
  paragraphs: [
    ...Array.from(
      { length: 25 },
      (_, i) => `Вводный абзац ${i + 1}. Здесь общие сведения.`,
    ),
    "Целевойфрагмент: договор согласует руководитель отдела в течение трёх рабочих дней.",
  ],
  chapters: [{ title: "Практика", paragraph: 25 }],
});
const pub = store.createMaterial({
  title: "Публикация",
  kind: "document",
  source: { type: "share", url: "https://example.test/root" },
  representations: ["article", "text"],
  paragraphs: ["Корень"],
  html: "<p>Корень</p>",
  pages: [
    {
      slug: "dogovory",
      sourceUrl: "https://example.test/child",
      title: "Вложенная страница",
      html: "<p>Вложенныйфрагмент в разделе договоров.</p>",
      paragraphs: ["Вложенныйфрагмент в разделе договоров."],
      wordCount: 5,
    },
  ],
});
store.createMaterial({
  title: "Секретный материал",
  kind: "document",
  visible: false,
  source: { type: "file" },
  paragraphs: ["Целевойфрагмент секретный"],
});
const collection = store.saveCollection({
  title: "Рабочие книги",
  materialIds: [book.id],
});
mkdirSync(join(dir, "files"), { recursive: true });
const pdfBytes = makePdf("PDFUniqueFragment", 3);
writeFileSync(join(dir, "files/search.pdf"), pdfBytes);
const pdfProcessed = await processFile(new File([pdfBytes], "search.pdf"));
const pdf = store.createMaterial({
  ...pdfProcessed,
  title: "PDF инструкция",
  kind: "document",
  source: { type: "file" },
  files: {
    pdf: {
      path: "files/search.pdf",
      name: "search.pdf",
      mime: "application/pdf",
      size: pdfBytes.length,
    },
  },
});
const pptx = await processFile(new File([await makePptx()], "search.pptx"));
writeFileSync(join(dir, "files/slides.json"), JSON.stringify(pptx.scene));
const slides = store.createMaterial({
  ...pptx,
  title: "Слайды",
  kind: "presentation",
  source: { type: "file" },
  paragraphs: [
    "Слайд 1",
    "Слайдовыйфрагмент один",
    "Слайд 2",
    "Слайдовыйфрагмент два",
  ],
  paragraphLocations: [{ slide: 1 }, { slide: 1 }, { slide: 2 }, { slide: 2 }],
  files: {
    slides: {
      path: "files/slides.json",
      name: "slides.json",
      mime: "application/json",
      size: 100,
    },
  },
});
store.close();
let onHeldAnswer;
let releaseHeldAnswer;
const model = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const b = JSON.parse(Buffer.concat(chunks).toString());
  if (
    req.url === "/api/chat" &&
    b.messages.at(-1).content.endsWith("Вопрос: Удержанныйвопрос договор")
  ) {
    await new Promise((resolve) => {
      releaseHeldAnswer = resolve;
      onHeldAnswer?.();
    });
  }
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify(
      req.url === "/api/embed"
        ? { embeddings: b.input.map(() => [1, 0]) }
        : {
            message: {
              content: JSON.stringify({
                sentences: b.messages
                  ?.at(-1)
                  .content.includes("Неизвестныйпроцесс договора")
                  ? []
                  : [
                      {
                        text: "Договор согласует руководитель отдела.",
                        sources: [1],
                      },
                    ],
              }),
            },
          },
    ),
  );
});
await new Promise((r) => model.listen(0, "127.0.0.1", r));
const env = {
  ...process.env,
  DATA_DIR: dir,
  API_PORT: "5196",
  WEB_PORT: "5195",
  API_HOST: "127.0.0.1",
  DREAMBUSTA_OLLAMA_URL: `http://127.0.0.1:${model.address().port}`,
  DREAMBUSTA_AI: "on",
};
const logs = [];
const children = [["server/index.ts"], ["node_modules/vite/bin/vite.js"]].map(
  (args) => {
    const p = spawn(process.execPath, args, {
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    p.stdout.on("data", (d) => logs.push(String(d)));
    p.stderr.on("data", (d) => logs.push(String(d)));
    return p;
  },
);
let browser, page;
const base = "http://localhost:5195";
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/session")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/library");
  await page
    .getByRole("button", { name: "Открыть помощника", exact: true })
    .waitFor();
  const launcherColor = await page
    .locator(".chat-master-avatar")
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  const openingShape = await page
    .locator(".chat-master-avatar")
    .evaluate(async (button) => {
      button.click();
      await new Promise(requestAnimationFrame);
      const node = document.querySelector("#dreambusta-assistant");
      for (const animation of node.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = 0;
      }
      const style = getComputedStyle(node);
      return { opacity: style.opacity, background: style.backgroundColor };
    });
  assert.equal(
    openingShape.opacity,
    "1",
    "the launcher stays visible as it becomes the chat",
  );
  assert.equal(
    openingShape.background,
    launcherColor,
    "the opening shape retains the launcher color",
  );
  await page.locator("#dreambusta-assistant").evaluate((node) => {
    for (const animation of node.getAnimations({ subtree: true }))
      animation.currentTime = 100;
  });
  await page.screenshot({ path: `${artifacts}/assistant-morph.png` });
  await page.locator("#dreambusta-assistant").evaluate((node) => {
    for (const animation of node.getAnimations({ subtree: true }))
      animation.finish();
  });
  await page
    .getByRole("button", { name: "Закрыть помощника", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Открыть помощника", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Поиск по библиотеке", exact: true })
      .count(),
    1,
    "top search remains available",
  );
  await page.evaluate(
    (id) =>
      localStorage.setItem(
        `dreambusta-progress:${id}:1`,
        JSON.stringify({ index: 0, speed: 300, completed: true }),
      ),
    book.id,
  );
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Поиск по библиотеке" });
  await dialog.waitFor();
  const input = dialog.getByRole("combobox", { name: "Поисковый запрос" });
  await input.fill("Целевойфрагмент");
  await dialog.getByRole("option").filter({ hasText: "Практика" }).waitFor();
  assert.ok(!(await dialog.innerText()).includes("Секретный материал"));
  await dialog
    .getByRole("button", { name: "Спросить помощника", exact: true })
    .click();
  const assistant = page.getByRole("dialog", {
    name: "Помощник по библиотеке",
  });
  await assistant.waitFor();
  const assistantLauncher = page.locator(".chat-master-avatar");
  assert.equal(
    await assistantLauncher.isVisible(),
    false,
    "open assistant replaces the launcher",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Закрыть помощника", exact: true })
      .count(),
    1,
    "only the upper-right X closes the assistant",
  );
  await assistant
    .getByText("Договор согласует руководитель отдела.", { exact: false })
    .first()
    .waitFor();
  assert.equal(await dialog.isVisible(), false, "handoff closes search");
  await assistant
    .locator(".library-source-link")
    .filter({ hasText: book.title })
    .first()
    .click();
  await page.waitForURL(/paragraph=25/);
  await page
    .getByRole("button", { name: "Открыть помощника", exact: true })
    .click();
  assert.ok(
    (await assistant.innerText()).includes("Целевойфрагмент"),
    "history survives closing and source navigation",
  );
  await assistant
    .getByRole("button", { name: "Закрыть помощника", exact: true })
    .click();
  await page.keyboard.press("Control+k");
  await dialog.getByRole("option").filter({ hasText: "Практика" }).waitFor();
  await input.press("Enter");
  await page.waitForURL(/paragraph=25/);
  await page
    .locator(".reading-word")
    .filter({ hasText: "Целевойфрагмент:" })
    .waitFor();
  const target = page
    .locator(".reading-word")
    .filter({ hasText: "Целевойфрагмент:" });
  const box = await target.boundingBox();
  assert.ok(
    box && box.y >= 0 && box.y < 1000,
    "target paragraph must be visible",
  );
  const firstWordIndex = await page
    .locator(".reader-controls")
    .getAttribute("data-index");
  await page.keyboard.press("Control+k");
  await dialog.getByRole("option").filter({ hasText: "Практика" }).waitFor();
  assert.equal(
    await dialog.getByRole("region", { name: "Ответ по источникам" }).count(),
    0,
    "reopening must discard the previous answer",
  );
  await page.keyboard.press("Escape");
  await page.goto(
    base + `/library/${book.slug}?view=text&paragraph=25&offset=4&version=1`,
  );
  await page.locator(".virtual-reader").waitFor();
  assert.equal(
    await page.locator(".reader-controls").getAttribute("data-index"),
    firstWordIndex,
    "a character offset inside the matching word must seek to that word",
  );
  await page.keyboard.press("Control+k");
  await input.fill("Вложенныйфрагмент");
  // A fresh result opened in an already mounted reader must load its new text.
  await page.keyboard.press("Escape");
  const changedStore = new Store(dir);
  changedStore.updateMaterial(book.id, {
    paragraphs: [
      ...book.paragraphs.slice(0, 25),
      book.paragraphs[25] + " Актуальнаяверсия",
    ],
    textVersion: 2,
  });
  changedStore.close();
  await page.keyboard.press("Control+k");
  await input.fill("Актуальнаяверсия");
  await dialog
    .getByRole("option")
    .filter({ hasText: "Актуальнаяверсия" })
    .first()
    .click();
  await page.waitForURL(/version=2/);
  await page
    .locator(".reading-word")
    .filter({ hasText: "Актуальнаяверсия" })
    .waitFor();
  await page.keyboard.press("Control+k");
  await input.fill("Вложенныйфрагмент");
  await dialog.getByLabel("Тип материала").selectOption("document");
  await dialog
    .getByRole("option")
    .filter({ hasText: "Вложенная страница" })
    .waitFor();
  await input.press("Enter");
  await page.waitForURL(/page=dogovory/);
  await page
    .locator(".reading-word")
    .filter({ hasText: "Вложенныйфрагмент" })
    .waitFor();
  await page.keyboard.press("Control+k");
  await input.fill("PDFUniqueFragment");
  await dialog.getByLabel("Тип материала").selectOption("");
  const page3 = dialog.getByRole("option").filter({ hasText: "Страница 3" });
  await page3.waitFor();
  await page3.click();
  await page.waitForURL(/pdfPage=3/);
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Номер страницы"]')?.value === "3",
  );
  await page.keyboard.press("Control+k");
  await input.fill("Слайдовыйфрагмент");
  await dialog
    .getByRole("option")
    .filter({ hasText: "Слайдовыйфрагмент два" })
    .click();
  await page.waitForURL(/slide=2/);
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Номер слайда"]')?.value === "2",
  );
  await page.goto(base + "/collections/" + collection.slug);
  await page.keyboard.press("Control+k");
  await input.fill("Целевойфрагмент");
  await dialog
    .getByLabel("Область поиска")
    .selectOption("collection:" + collection.slug);
  await dialog
    .getByRole("option")
    .filter({ hasText: book.title })
    .first()
    .waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Открыть помощника", exact: true })
    .click();
  await assistant.waitFor();
  await assistant
    .getByRole("button", { name: "Новый диалог", exact: true })
    .click();
  assert.equal(await assistant.locator(".assistant-turn").count(), 0);
  const question = assistant.getByRole("textbox", { name: "Вопрос помощнику" });
  await assistant
    .getByLabel("Искать ответ в")
    .selectOption("collection:" + collection.slug);
  await question.fill("Кто согласует договор?");
  await question.press("Enter");
  await assistant
    .getByText("Договор согласует руководитель отдела.", { exact: false })
    .first()
    .waitFor();
  assert.ok((await assistant.innerText()).includes("Рабочие книги"));
  assert.ok(!(await assistant.innerText()).includes("Секретный материал"));
  await assistant
    .getByRole("button", { name: "Новый диалог", exact: true })
    .click();
  await assistant
    .getByRole("button", { name: "Закрыть помощника", exact: true })
    .click();
  await page.keyboard.press("Control+k");
  await input.fill("Целевойфрагмент");
  await dialog.getByLabel("Тип материала").selectOption("");
  await dialog
    .getByRole("option")
    .filter({ hasText: book.title })
    .first()
    .waitFor();
  let releaseCollections, collectionsStarted;
  let collectionGate = new Promise((resolve) => {
    releaseCollections = resolve;
  });
  let collectionStart = new Promise((resolve) => {
    collectionsStarted = resolve;
  });
  let heldCollections = false;
  await page.route("**/api/collections", async (route) => {
    if (!heldCollections) {
      heldCollections = true;
      collectionsStarted();
      await collectionGate;
    }
    await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Спросить помощника", exact: true })
    .click();
  await collectionStart;
  await page
    .getByRole("button", { name: "Поиск по библиотеке", exact: true })
    .click();
  await input.fill("Кто согласует договор?");
  await dialog
    .getByRole("option")
    .filter({ hasText: book.title })
    .first()
    .waitFor();
  await dialog
    .getByRole("button", { name: "Спросить помощника", exact: true })
    .click();
  await assistant
    .getByText("Договор согласует руководитель отдела.", { exact: false })
    .first()
    .waitFor();
  releaseCollections();
  await page.waitForTimeout(200);
  assert.deepEqual(
    await assistant.locator(".assistant-question").allTextContents(),
    ["Кто согласует договор?"],
    "old handoff must not replace or append to a newer question",
  );
  await assistant
    .getByRole("button", { name: "Закрыть помощника", exact: true })
    .click();
  await page.keyboard.press("Control+k");
  await dialog
    .getByRole("option")
    .filter({ hasText: book.title })
    .first()
    .waitFor();
  heldCollections = false;
  collectionGate = new Promise((resolve) => {
    releaseCollections = resolve;
  });
  collectionStart = new Promise((resolve) => {
    collectionsStarted = resolve;
  });
  await dialog
    .getByRole("button", { name: "Спросить помощника", exact: true })
    .click();
  await collectionStart;
  await assistant
    .getByRole("button", { name: "Новый диалог", exact: true })
    .click();
  releaseCollections();
  await page.waitForTimeout(200);
  assert.equal(
    await assistant.locator(".assistant-turn").count(),
    0,
    "new dialog invalidates an unfinished search handoff",
  );
  await page.unroute("**/api/collections");
  await assistant
    .getByRole("button", { name: "Новый диалог", exact: true })
    .click();
  const held = new Promise((resolve) => {
    onHeldAnswer = resolve;
  });
  await question.fill("Удержанныйвопрос договор");
  await question.press("Enter");
  let heldTimeout;
  await Promise.race([
    held,
    new Promise((_, reject) => {
      heldTimeout = setTimeout(
        () => reject(new Error("Held question did not reach model")),
        10000,
      );
    }),
  ]).finally(() => clearTimeout(heldTimeout));
  await assistant
    .getByRole("button", { name: "Остановить ответ", exact: true })
    .click();
  await assistant
    .getByText("Ответ остановлен. Можно повторить вопрос.", { exact: true })
    .waitFor();
  await assistant
    .getByRole("button", { name: "Новый диалог", exact: true })
    .click();
  releaseHeldAnswer();
  await page.waitForTimeout(150);
  assert.equal(
    await assistant.locator(".assistant-turn").count(),
    0,
    "late cancelled response must not restore cleared history",
  );
  await assistant
    .getByRole("button", { name: "Развернуть помощника", exact: true })
    .click();
  assert.ok(
    await assistant.evaluate((el) => el.getBoundingClientRect().width > 450),
  );
  await assistant
    .getByRole("button", { name: "Свернуть помощника", exact: true })
    .click();
  await assistant
    .getByRole("button", { name: "Закрыть помощника", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Открыть помощника", exact: true })
    .click();
  assert.ok(
    await assistant.evaluate(
      (el) => el.getBoundingClientRect().width <= innerWidth,
    ),
  );
  await page.screenshot({ path: artifacts + "/assistant-mobile.png" });
  await assistant
    .getByRole("button", { name: "Закрыть помощника", exact: true })
    .click();
  await page.keyboard.press("Control+k");
  await input.fill("<img src=x onerror=alert(1)>");
  await page.waitForTimeout(350);
  assert.equal(await dialog.locator("img[src=x]").count(), 0);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await input.fill("Целевойфрагмент");
  await dialog
    .getByRole("option")
    .filter({ hasText: book.title })
    .first()
    .waitFor();
  await page.screenshot({ path: artifacts + "/mobile.png" });
  await page.keyboard.press("Escape");
  await page.goto(
    base + `/library/${book.slug}?view=text&paragraph=25&version=999`,
  );
  await page
    .getByText(
      "Материал обновлён. Место из старого результата поиска может отличаться.",
      { exact: true },
    )
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Открыть помощника", exact: true })
    .click();
  await assistant.getByLabel("Искать ответ в").selectOption("current");
  await assistant
    .getByRole("button", { name: "Закрыть помощника", exact: true })
    .click();
  await page.locator("a.brand").click();
  await page.waitForURL(base + "/library");
  await page
    .getByRole("button", { name: "Открыть помощника", exact: true })
    .click();
  assert.equal(
    await assistant.getByLabel("Искать ответ в").inputValue(),
    "",
    "current-material scope resets when leaving the material",
  );
  await assistant
    .getByRole("textbox", { name: "Вопрос помощнику" })
    .fill("Кто согласует договор?");
  await assistant
    .getByRole("button", { name: "Отправить вопрос", exact: true })
    .click();
  await assistant
    .locator(".assistant-turn")
    .last()
    .getByText("Договор согласует руководитель отдела.", { exact: false })
    .waitFor();
  assert.equal(
    await assistant.locator(".assistant-turn-scope").last().innerText(),
    "Вся библиотека",
    "scope label must agree with the actual fallback scope",
  );
  await page.screenshot({ path: artifacts + "/assistant-desktop.png" });
  await assistant
    .getByRole("button", { name: "Закрыть помощника", exact: true })
    .click();
  const launcher = page.getByRole("button", {
    name: "Открыть помощника",
    exact: true,
  });
  await launcher.waitFor({ state: "visible" });
  assert.equal(
    await launcher.evaluate((node) => node === document.activeElement),
    true,
    "closing restores keyboard focus",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await launcher.press("Enter");
  await assistant.waitFor();
  assert.equal(
    await assistant.evaluate((node) => node.getAnimations().length),
    0,
  );
  await page.keyboard.press("Escape");
  await launcher.waitFor({ state: "visible" });
  assert.equal(
    await assistant.isVisible(),
    false,
    "Escape closes without motion",
  );
  assert.equal(
    await launcher.evaluate((node) => node === document.activeElement),
    true,
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await launcher.press("Enter");
  await page.waitForFunction(
    () =>
      document.querySelector(".chat-popup-window")?.getAnimations().length > 0,
  );
  await page.keyboard.press("Escape");
  await launcher.waitFor({ state: "visible" });
  assert.equal(
    await assistant.isVisible(),
    false,
    "Escape can reverse the opening morph",
  );
  const launchBox = await launcher.boundingBox();
  await page.mouse.move(launchBox.x + 25, launchBox.y + 25);
  await page.mouse.down();
  await page.mouse.move(launchBox.x - 175, launchBox.y - 125, { steps: 8 });
  await page.mouse.up();
  assert.equal(
    await assistant.isVisible(),
    false,
    "drag must not toggle the chat",
  );
  const movedBox = await launcher.boundingBox();
  assert.ok(
    movedBox.x < launchBox.x - 100 && movedBox.y < launchBox.y - 80,
    "borrowed launcher drag moves the widget",
  );
  assert.ok(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("dreambusta:assistant-widget-position"))
          .left > 0,
    ),
  );
  await launcher.press("Enter");
  await assistant.waitFor();
  await assistant
    .getByRole("textbox", { name: "Вопрос помощнику" })
    .fill("Неизвестныйпроцесс договора");
  await assistant
    .getByRole("button", { name: "Отправить вопрос", exact: true })
    .click();
  const unanswered = assistant.locator(".assistant-turn").last();
  await unanswered
    .getByText("Близкие по теме материалы", { exact: true })
    .waitFor();
  assert.ok(
    (await unanswered.locator(".library-source-link").count()) > 0,
    "unanswered question must still offer readable sources",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: top search, TechHelper widget handoff/direct questions/history/sources, cancellation/new-dialog races, scopes, drag/expand/mobile, safe text and versioned source links.",
  );
} catch (e) {
  if (page)
    await page.screenshot({ path: artifacts + "/failure.png" }).catch(() => {});
  throw e;
} finally {
  releaseHeldAnswer?.();
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
  await new Promise((r) => model.close(r));
  writeFileSync(artifacts + "/server.log", logs.join(""));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
