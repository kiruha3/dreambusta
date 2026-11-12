import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { Store } from "../server/store.ts";
import { makePdf } from "./fixtures/documents.mjs";

// The real temporary library catches lost context on deep links/reloads and
// reader layout controls that appear to work without changing the reading area.
const dir = mkdtempSync(join(tmpdir(), "dreambusta-reading-"));
const store = new Store(dir);
const paragraphs = Array.from(
  { length: 150 },
  (_, i) =>
    `Абзац ${i + 1}. ${"Текст для чтения и сохранения позиции. ".repeat(12)}`,
);
const rootUrl = "https://example.test/publication";
const material = store.createMaterial({
  title: "Руководство",
  source: { type: "share", url: rootUrl },
  representations: ["article", "text"],
  paragraphs,
  html:
    '<p><a href="https://example.test/child">Открыть главу</a> · <a href="#paragraph-45">К середине</a></p>' +
    paragraphs.map((p, i) => `<p id="paragraph-${i}">${p}</p>`).join(""),
  pages: [
    {
      slug: "chapter",
      sourceUrl: "https://example.test/child",
      parentSourceUrl: rootUrl,
      title: "Глава",
      html: '<p><a href="https://example.test/leaf">Вложенная инструкция</a></p>',
      paragraphs: ["Глава"],
      wordCount: 1,
    },
    {
      slug: "instruction",
      sourceUrl: "https://example.test/leaf",
      parentSourceUrl: "https://example.test/child",
      title: "Инструкция",
      html: "<p>Содержимое инструкции</p>",
      paragraphs: ["Содержимое инструкции"],
      wordCount: 2,
    },
  ],
});
const collection = store.saveCollection({
  title: "Рабочая подборка",
  materialIds: [material.id],
});
const unrelated = store.saveCollection({
  title: "Другая подборка",
  materialIds: [],
});
const hidden = store.saveCollection({
  title: "Скрытая подборка",
  visible: false,
  materialIds: [material.id],
});
mkdirSync(join(dir, "files"));
const bytes = makePdf("Reading fixture", 3);
writeFileSync(join(dir, "files/reading.pdf"), bytes);
const pdf = store.createMaterial({
  title: "PDF для чтения",
  source: { type: "file" },
  representations: ["pdf"],
  files: {
    pdf: {
      path: "files/reading.pdf",
      name: "reading.pdf",
      mime: "application/pdf",
      size: bytes.length,
    },
  },
});
store.close();
const env = {
  ...process.env,
  DATA_DIR: dir,
  DREAMBUSTA_AI: "off",
  API_PORT: "5206",
  WEB_PORT: "5205",
  API_HOST: "127.0.0.1",
};
const logs = [];
const children = [["server/index.ts"], ["node_modules/vite/bin/vite.js"]].map(
  (args) => {
    const p = spawn(process.execPath, args, {
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    p.stdout.on("data", (s) => logs.push(String(s)));
    p.stderr.on("data", (s) => logs.push(String(s)));
    return p;
  },
);
const base = "http://localhost:5205";
let browser;
let page;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/session")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({
    viewport: { width: 1550, height: 950 },
  });
  const errors = [];
  let collectionRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/collections/"))
      collectionRequests++;
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const materialPath = `/library/${material.slug}?from=collection&collection=${collection.slug}`;
  await page.goto(base + materialPath);
  const crumbs = page.getByRole("navigation", { name: "Хлебные крошки" });
  await crumbs
    .getByRole("link", { name: "Рабочая подборка", exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator('.sidebar nav[aria-label="Библиотека"] a.active')
      .innerText(),
    "Подборки",
  );
  const readingBox = await page.locator(".viewer-panel").boundingBox();
  const menuBox = await page.locator(".publication-sidebar").boundingBox();
  const sideButtons = page.getByRole("group", {
    name: "Боковые панели",
    exact: true,
  });
  const sideButtonsBox = await sideButtons.boundingBox();
  assert.ok(
    sideButtonsBox.x >= readingBox.x + readingBox.width,
    "contents and material buttons live in the right pane",
  );
  assert.equal(
    await page
      .locator(
        '.reading-controls button[aria-controls="publication-tree"], .reading-controls button[aria-controls="material-info"]',
      )
      .count(),
    0,
    "individual panel buttons are absent from the upper toolbar",
  );
  assert.ok(
    await sideButtons.evaluate((el) =>
      [...el.querySelectorAll("button")].every((button) => {
        const box = button.getBoundingClientRect();
        const parent = el.getBoundingClientRect();
        return box.left >= parent.left && box.right <= parent.right + 1;
      }),
    ),
    "side buttons fit their pane",
  );
  assert.ok(
    menuBox.x >= readingBox.x + readingBox.width,
    "publication pages remain to the right of reading",
  );
  const splitter = page.getByRole("separator", { name: "Ширина оглавления" });
  const separatorBox = await splitter.boundingBox();
  await page.locator(".reading-article").evaluate((el) => {
    el.scrollTop = 500;
  });
  const windowBeforeResize = await page.evaluate(() => scrollY);
  await page.mouse.move(
    separatorBox.x + separatorBox.width / 2,
    separatorBox.y + 60,
  );
  await page.mouse.down();
  await page.mouse.move(separatorBox.x - 80, separatorBox.y + 60, { steps: 4 });
  await page.mouse.up();
  const resizedMenu = await page.locator(".publication-sidebar").boundingBox();
  assert.ok(
    resizedMenu.width > menuBox.width + 50,
    "dragging the divider expands the contents pane",
  );
  assert.ok(
    (await page.locator(".reading-article").evaluate((el) => el.scrollTop)) >
      250,
    "resizing contents preserves the article viewport position",
  );
  assert.equal(
    await page.evaluate(() => scrollY),
    windowBeforeResize,
    "resizing does not scroll the document",
  );
  const savedTreeWidth = resizedMenu.width;
  await page
    .getByRole("button", { name: "Скрыть оглавление", exact: true })
    .click();
  assert.equal(await page.locator(".publication-sidebar").count(), 0);
  await page.reload();
  await page
    .getByRole("button", { name: "Показать оглавление", exact: true })
    .click();
  assert.ok(
    Math.abs(
      (await page.locator(".publication-sidebar").boundingBox()).width -
        savedTreeWidth,
    ) < 2,
    "contents width and hidden state survive reload",
  );
  await splitter.press("Home");
  assert.equal(await splitter.getAttribute("aria-valuenow"), "200");
  await splitter.press("ArrowLeft");
  assert.equal(await splitter.getAttribute("aria-valuenow"), "220");
  mkdirSync(".superpowers/reading", { recursive: true });
  await page.screenshot({ path: ".superpowers/reading/contents-resized.png" });
  await page
    .locator(".reading-article")
    .getByRole("link", { name: "Открыть главу" })
    .click();
  await page
    .locator(".reading-article")
    .getByRole("link", { name: "Вложенная инструкция" })
    .click();
  await crumbs.getByText("Инструкция", { exact: true }).waitFor();
  assert.equal(
    await crumbs
      .getByRole("link", { name: "Глава", exact: true })
      .getAttribute("href"),
    `/library/${material.slug}?page=chapter&from=collection&collection=${collection.slug}`,
  );
  await page.reload();
  await crumbs
    .getByRole("link", { name: "Рабочая подборка", exact: true })
    .waitFor();
  await crumbs.getByText("Инструкция", { exact: true }).waitFor();
  await crumbs.getByRole("link", { name: "Руководство", exact: true }).click();
  await page.locator(".reading-article p").nth(10).waitFor();
  const articleFillsPanel = () =>
    page.locator(".reading-article").evaluate((el) => {
      const viewport = el.getBoundingClientRect();
      const panel = el.closest(".viewer-panel").getBoundingClientRect();
      return (
        Math.abs(viewport.left - panel.left - 1) < 2 &&
        Math.abs(panel.right - viewport.right - 1) < 2
      );
    });
  assert.ok(
    await articleFillsPanel(),
    "article scrollbar sits at the panel edge even with a bounded text column",
  );
  const narrow = await page
    .locator(".article-content")
    .evaluate((el) => el.clientWidth);
  await page.getByLabel("Ширина текста", { exact: true }).selectOption("wide");
  await page
    .getByRole("button", { name: "Скрыть боковые панели", exact: true })
    .click();
  await page.waitForTimeout(100);
  assert.ok(
    (await page.locator(".article-content").evaluate((el) => el.clientWidth)) >
      narrow,
    "wide mode increases available text width",
  );
  assert.ok(
    await articleFillsPanel(),
    "article viewport stays full width when side panels are hidden",
  );
  assert.equal(
    await page
      .locator(".publication-sidebar:visible, .material-info:visible")
      .count(),
    0,
  );
  mkdirSync(".superpowers/reading", { recursive: true });
  await page.screenshot({ path: ".superpowers/reading/article-desktop.png" });
  const articleViewport = page.locator(".reading-article");
  assert.ok(
    await articleViewport.evaluate(
      (el) =>
        /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
        el.scrollHeight > el.clientHeight + 2,
    ),
    "article has its own bounded scroll viewport",
  );
  await articleViewport.scrollIntoViewIfNeeded();
  const windowBeforeArticleWheel = await page.evaluate(() => scrollY);
  await articleViewport.hover();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(120);
  assert.ok(
    (await articleViewport.evaluate((el) => el.scrollTop)) > 100,
    "wheel scrolls inside article",
  );
  assert.equal(await page.evaluate(() => scrollY), windowBeforeArticleWheel);
  const contextRequestsBeforeFragment = collectionRequests;
  const routeBeforeFragment =
    new URL(page.url()).pathname + new URL(page.url()).search;
  if (process.env.READING_SCROLL_DEBUG)
    await articleViewport.evaluate((el) => {
      window.__articleScrollTimeline = [];
      const record = (kind, extra = {}) =>
        window.__articleScrollTimeline.push({
          kind,
          time: performance.now(),
          hash: location.hash,
          top: el.scrollTop,
          remaining: el.scrollHeight - el.clientHeight,
          ...extra,
        });
      const descriptor = Object.getOwnPropertyDescriptor(
        Element.prototype,
        "scrollTop",
      );
      Object.defineProperty(el, "scrollTop", {
        get() {
          return descriptor.get.call(this);
        },
        set(value) {
          record("set", { value, stack: new Error().stack });
          descriptor.set.call(this, value);
        },
        configurable: true,
      });
      for (const type of ["popstate", "hashchange"])
        window.addEventListener(type, () => record(type));
      el.addEventListener("scroll", () => record("scroll"));
    });
  await articleViewport.evaluate((el) => {
    el.scrollTop = 0;
  });
  await articleViewport
    .getByRole("link", { name: "К середине", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector(".reading-article").scrollTop > 1000,
  );
  assert.ok(
    await articleViewport.evaluate((el) => {
      const target = el.querySelector("#paragraph-45").getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return target.top >= box.top && target.top < box.top + 50;
    }),
    "fragment target is positioned at the top of the article viewport",
  );
  assert.equal(
    await page.evaluate(() => scrollY),
    windowBeforeArticleWheel,
    "fragment scroll stays inside article",
  );
  await articleViewport.evaluate((el) => {
    el.scrollTop = 0;
  });
  await articleViewport
    .getByRole("link", { name: "К середине", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector(".reading-article").scrollTop > 1000,
  );
  await page.goBack();
  await page.waitForFunction(async (fullPath) => {
    const { router } = await import("/src/router.ts");
    return router.currentRoute.value.fullPath === fullPath;
  }, routeBeforeFragment);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  assert.equal(
    collectionRequests,
    contextRequestsBeforeFragment,
    "fragment history reuses the validated collection without rewriting article content",
  );
  await articleViewport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await articleViewport.hover();
  const windowBeforeArticleBoundary = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(120);
  if (process.env.READING_SCROLL_DEBUG)
    writeFileSync(
      ".superpowers/reading/scroll-trace-fixed.json",
      JSON.stringify(
        await page.evaluate(() => window.__articleScrollTimeline),
        null,
        2,
      ),
    );
  assert.equal(
    await page.evaluate(() => scrollY),
    windowBeforeArticleBoundary,
    "article boundary does not chain wheel into document",
  );
  assert.equal(
    await page
      .getByRole("progressbar", { name: "Позиция чтения статьи" })
      .getAttribute("value"),
    "100",
  );
  await articleViewport.evaluate((el) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.4;
  });
  await page.waitForTimeout(200);
  assert.match(
    await page.getByRole("status", { name: "Позиция в статье" }).innerText(),
    /[1-9]\d*%/,
  );
  const readPercent = await page
    .getByRole("progressbar", { name: "Позиция чтения статьи" })
    .getAttribute("value");
  await page.reload();
  await page
    .getByRole("button", { name: "Показать боковые панели", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Ширина текста", { exact: true }).inputValue(),
    "wide",
  );
  await page.waitForFunction(
    (percent) =>
      Math.abs(
        Number(
          document.querySelector('progress[aria-label="Позиция чтения статьи"]')
            .value,
        ) - Number(percent),
      ) < 3,
    readPercent,
  );
  await page.getByRole("button", { name: "Текст", exact: true }).click();
  assert.equal(
    await page
      .getByRole("slider", { name: "Позиция в тексте", exact: true })
      .count(),
    0,
    "normal text has one compact toolbar without the word slider",
  );
  const lineRatio = await page
    .locator(".virtual-reader-rows")
    .evaluate(
      (el) =>
        parseFloat(getComputedStyle(el).lineHeight) /
        parseFloat(getComputedStyle(el).fontSize),
    );
  assert.ok(
    lineRatio <= 1.65 && lineRatio >= 1.5,
    "compact line spacing reaches virtual text rows",
  );
  await page.getByRole("button", { name: "WBook", exact: true }).click();
  await page
    .getByRole("slider", { name: "Позиция в тексте", exact: true })
    .fill("1400");
  await page.getByRole("button", { name: "Текст", exact: true }).click();
  await page.getByRole("button", { name: "Моё место", exact: true }).click();
  await page.locator('.selected-word[data-token-index="1400"]').waitFor();
  const textViewport = page.locator(".virtual-reader");
  const textFillsPanel = () =>
    textViewport.evaluate((el) => {
      const viewport = el.getBoundingClientRect();
      const panel = el.closest(".viewer-panel").getBoundingClientRect();
      return (
        Math.abs(viewport.left - panel.left - 1) < 2 &&
        Math.abs(panel.right - viewport.right - 1) < 2
      );
    });
  assert.ok(
    await textFillsPanel(),
    "Text scrollbar spans the panel independently of the text column",
  );
  const wideTextColumn = await page
    .locator(".virtual-reader-column")
    .evaluate((el) => el.clientWidth);
  await page
    .getByLabel("Ширина текста", { exact: true })
    .selectOption("narrow");
  await page.waitForFunction(
    (wide) =>
      document.querySelector(".virtual-reader-column").clientWidth < wide,
    wideTextColumn,
  );
  assert.ok(
    await textFillsPanel(),
    "narrowing Text leaves its scrollbar at the panel edge",
  );
  await page.getByLabel("Ширина текста", { exact: true }).selectOption("wide");
  await textViewport.scrollIntoViewIfNeeded();
  await textViewport.evaluate((el) => {
    el.scrollTop = 0;
  });
  const windowBeforeTextWheel = await page.evaluate(() => scrollY);
  await textViewport.hover();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(120);
  assert.ok(
    (await textViewport.evaluate((el) => el.scrollTop)) > 100,
    "wheel scrolls inside the text viewport",
  );
  assert.equal(
    await page.evaluate(() => scrollY),
    windowBeforeTextWheel,
    "reading text does not scroll the document",
  );
  await textViewport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(120);
  assert.equal(
    await page.evaluate(() => scrollY),
    windowBeforeTextWheel,
    "text boundary does not chain wheel into the document",
  );
  assert.ok(
    await textViewport.evaluate(
      (el) => el.getBoundingClientRect().bottom <= innerHeight + 1,
    ),
    "text viewport fits below its fixed toolbar",
  );
  await textViewport.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: ".superpowers/reading/text-desktop.png" });
  await page.getByRole("button", { name: "WBook", exact: true }).click();
  assert.ok(
    await textFillsPanel(),
    "WBook full text also uses the whole panel for scrolling",
  );
  const wbookPanel = await page.locator(".viewer-panel").boundingBox();
  for (const selector of [
    ".chapter-controls",
    ".focus-stage",
    ".reader-controls",
    ".reader-full-text",
  ]) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(
      Math.abs(box.x - wbookPanel.x - 1) < 2 &&
        Math.abs(box.width - wbookPanel.width + 2) < 2,
      `${selector} shares the full WBook panel width`,
    );
  }
  const controlsBox = await page.locator(".reader-controls").boundingBox();
  const fullTextBox = await page.locator(".reader-full-text").boundingBox();
  assert.ok(
    Math.abs(controlsBox.x - fullTextBox.x) < 2 &&
      Math.abs(controlsBox.width - fullTextBox.width) < 2,
    "playback and text share the same reading column",
  );
  const toolbarBoxes = await Promise.all(
    ["Поиск в тексте", "Уменьшить шрифт", "Увеличить шрифт"].map((label) =>
      page.getByLabel(label, { exact: true }).boundingBox(),
    ),
  );
  const placeBox = await page
    .getByRole("button", { name: "Моё место", exact: true })
    .boundingBox();
  assert.ok(
    toolbarBoxes.every(
      (box) =>
        Math.abs(box.y + box.height / 2 - placeBox.y - placeBox.height / 2) < 3,
    ),
    "desktop search and reading actions form one aligned row",
  );
  await page.locator(".reader-controls").scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".superpowers/reading/wbook-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "WBook controls fit mobile width",
  );
  assert.ok(
    await page.locator(".text-toolbar").evaluate((el) => {
      const box = el.getBoundingClientRect();
      return [...el.querySelectorAll("button,input")].every((control) => {
        const b = control.getBoundingClientRect();
        return b.left >= box.left && b.right <= box.right + 1;
      });
    }),
    "mobile reading controls stay within toolbar",
  );
  await page.locator(".reader-controls").scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".superpowers/reading/wbook-mobile.png" });
  await page.setViewportSize({ width: 1550, height: 950 });
  for (const bad of [unrelated.slug, hidden.slug, "missing"]) {
    await page.goto(
      base + `/library/${material.slug}?from=collection&collection=${bad}`,
    );
    await crumbs.getByText("Руководство", { exact: true }).waitFor();
    assert.equal(
      await crumbs
        .getByRole("link", { name: "Все материалы", exact: true })
        .count(),
      1,
      "invalid or unrelated collections fall back to library",
    );
    assert.equal(
      await crumbs.getByRole("link", { name: "Подборки", exact: true }).count(),
      0,
    );
  }
  for (const [from, label, target] of [
    ["knowledge", "База знаний", "/knowledge"],
    ["favorites", "Избранное", "/library?view=favorites"],
    ["continue", "Продолжить чтение", "/library?view=continue"],
  ]) {
    await page.goto(base + `/library/${material.slug}?from=${from}`);
    await crumbs.getByRole("link", { name: label, exact: true }).waitFor();
    assert.equal(
      await page
        .locator('.sidebar nav[aria-label="Библиотека"] a.active')
        .innerText(),
      label,
    );
    assert.equal(
      await crumbs
        .getByRole("link", { name: label, exact: true })
        .getAttribute("href"),
      target,
    );
    await page.getByRole("button", { name: "Статья", exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get("from"), from);
  }
  await page.goto(
    base +
      `/library/${material.slug}?from=collection&collection=${collection.id}`,
  );
  await crumbs
    .getByRole("link", { name: collection.title, exact: true })
    .waitFor();
  await page.waitForURL(
    (url) => url.searchParams.get("collection") === collection.slug,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "mobile article does not overflow horizontally",
  );
  await page.screenshot({ path: ".superpowers/reading/article-mobile.png" });
  await page.setViewportSize({ width: 1550, height: 950 });
  await page.goto(base + `/library/${pdf.slug}`);
  await page.getByRole("button", { name: "Миниатюры", exact: true }).click();
  const pdfPanelBox = await page.locator(".viewer-panel").boundingBox();
  const pdfPagesBox = await page
    .getByRole("button", { name: "Страницы PDF", exact: true })
    .boundingBox();
  assert.ok(
    pdfPagesBox.x - pdfPanelBox.x < 20,
    "PDF page navigation starts at the left edge",
  );
  await page.locator(".pdf-thumbnails canvas").first().waitFor();
  await page.screenshot({ path: ".superpowers/reading/pdf-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  await page.screenshot({ path: ".superpowers/reading/pdf-mobile.png" });
  assert.equal(
    await page
      .getByRole("button", { name: "Миниатюры", exact: true })
      .getAttribute("title"),
    "Миниатюры страниц",
  );
  await page.getByRole("button", { name: "Список", exact: true }).click();
  await page
    .getByRole("button", { name: "Перейти к странице 3", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Номер страницы"]').value === "3",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "mobile reader does not overflow horizontally",
  );
  assert.deepEqual(errors, []);
  console.log("Reading and breadcrumb E2E passed");
} catch (e) {
  mkdirSync(".superpowers/reading", { recursive: true });
  if (page && process.env.READING_SCROLL_DEBUG)
    writeFileSync(
      ".superpowers/reading/scroll-trace-failure.json",
      JSON.stringify(
        await page
          .evaluate(() => window.__articleScrollTimeline || [])
          .catch(() => []),
        null,
        2,
      ),
    );
  await page
    ?.screenshot({ path: ".superpowers/reading/failure.png", fullPage: false })
    .catch(() => {});
  if (page)
    writeFileSync(
      ".superpowers/reading/failure.html",
      await page.content().catch(() => ""),
    );
  console.error(logs.join("").slice(-5000));
  throw e;
} finally {
  await browser?.close();
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
  const target = resolve(dir);
  assert.ok(
    target.startsWith(resolve(tmpdir()) + "\\") ||
      target.startsWith(resolve(tmpdir()) + "/"),
  );
  rmSync(target, { recursive: true, force: true });
}
