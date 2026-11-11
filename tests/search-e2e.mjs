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
const model = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const b = JSON.parse(Buffer.concat(chunks).toString());
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify(
      req.url === "/api/embed"
        ? { embeddings: b.input.map(() => [1, 0]) }
        : {
            message: {
              content: JSON.stringify({
                sentences: [
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
    .getByRole("button", { name: "Спросить по найденному", exact: true })
    .click();
  await dialog
    .getByText("Договор согласует руководитель отдела.", { exact: false })
    .first()
    .waitFor();
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
  await page.locator(".reader-controls").waitFor();
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
  await page.setViewportSize({ width: 390, height: 844 });
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
  assert.deepEqual(errors, []);
  console.log(
    "PASS: global search, keyboard, grounded answer, hidden sources, paragraph/publication/PDF/slide links, collection scope, mobile, escaping and stale version.",
  );
} catch (e) {
  if (page)
    await page.screenshot({ path: artifacts + "/failure.png" }).catch(() => {});
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
  await new Promise((r) => model.close(r));
  writeFileSync(artifacts + "/server.log", logs.join(""));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
