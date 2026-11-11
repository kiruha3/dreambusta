import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { Store } from "../server/store.ts";
import {
  makePdf,
  makeDocx,
  makePptx,
  makeDensePptx,
  makeStyledPptx,
  makeTablePptx,
  makeVectorPptx,
  makeJpxPdf,
} from "./fixtures/documents.mjs";
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
  DREAMBUSTA_AI: 'off',
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
  await page.getByRole("button", { name: "WBook", exact: true }).click();
  await page
    .locator(".reading-word")
    .filter({ hasText: /^Второй$/ })
    .click({ timeout: 3000 });
  assert.equal(
    await page.locator(".selected-word").innerText(),
    "Второй",
    "speed reading exposes clickable context",
  );
  assert.equal(
    (await page.locator(".focus-word").innerText()).replace(/\s/g, ""),
    "Второй",
    "context selection seeks the focus word",
  );
  const contextBox = await page.locator(".reader-text").boundingBox();
  const controlsBox = await page.locator(".reader-controls").boundingBox();
  assert.ok(
    contextBox.y >= controlsBox.y + controlsBox.height,
    "context belongs below speed controls",
  );
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
  const fixtureStore = new Store(dir);
  const iconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#222" d="M0 0h24v24H0z"/></svg>';
  mkdirSync(join(dir, "snapshots", "e2e"), { recursive: true });
  writeFileSync(join(dir, "snapshots", "e2e", "root.svg"), iconSvg);
  const publication = fixtureStore.createMaterial({
    title: "Публикация с разделами",
    kind: "document",
    source: {
      type: "share",
      provider: "techhelper",
      url: "https://docs.example.test/shared/kb/tree",
      status: "saved",
    },
    sourcePageId: "10",
    icon: { type: "image", value: "snapshot:icon-root" },
    files: {
      "icon-root": {
        path: "snapshots/e2e/root.svg",
        name: "root.svg",
        mime: "image/svg+xml",
        size: Buffer.byteLength(iconSvg),
      },
    },
    representations: ["article", "text"],
    html: '<p><a href="https://docs.example.test/shared/kb/tree?page_id=11" target="_blank"><span class="publication-link-icon" aria-hidden="true">📙</span>База знаний</a></p><p><a href="https://docs.example.test/shared/kb/tree?page_id=12"><img class="publication-link-icon" src="snapshot:icon-root" width="20" height="20" alt="" />Вложенная страница</a></p>',
    paragraphs: ["Главная статья"],
    pages: [
      {
        sourceUrl: "https://docs.example.test/shared/kb/tree?page_id=11",
        parentSourceUrl: "https://docs.example.test/shared/kb/tree",
        slug: "baza-znaniy",
        title: "База знаний",
        icon: { type: "emoji", value: "📙" },
        html: '<h2 id="start">Содержимое раздела</h2><p><a href="#end">К заключению</a></p><div style="height:1000px"></div><h2 id="end">Заключение</h2><p><a href="https://docs.example.test/shared/kb/tree?page_id=10" target="_blank">Главная статья</a></p>',
        paragraphs: ["Текст раздела для чтения"],
        wordCount: 5,
      },
      {
        sourceUrl: "https://docs.example.test/shared/kb/tree?page_id=12",
        parentSourceUrl: "https://docs.example.test/shared/kb/tree?page_id=11",
        slug: "vnutri",
        title: "Вложенная страница",
        icon: { type: "emoji", value: "🗂️" },
        html: "<h2>Глубокое содержимое</h2>",
        paragraphs: ["Глубокое содержимое"],
        wordCount: 2,
      },
    ],
  });
  fixtureStore.close();
  let submittedOptions;
  await page.route("**/api/links/preview", (r) =>
    r.fulfill({
      json: {
        type: "share",
        provider: "techhelper",
        kind: "document",
        url: publication.source.url,
      },
    }),
  );
  await page.route("**/api/links/navigation", (r) =>
    r.fulfill({
      json: [
        { sourceUrl: publication.source.url, title: publication.title },
        ...publication.pages.map((p) => ({
          sourceUrl: p.sourceUrl,
          parentSourceUrl: p.parentSourceUrl,
          title: p.title,
        })),
      ],
    }),
  );
  await page.route("**/api/links", (r) => {
    submittedOptions = r.request().postDataJSON().importOptions;
    return r.fulfill({ json: publication });
  });
  await page.goto(base + "/admin/add");
  await page.getByRole("button", { name: "По ссылке", exact: true }).click();
  await page
    .getByLabel("Ссылка на материал")
    .fill(publication.source.url + "?utm_source=copy");
  await page.getByLabel("Название").click();
  await page
    .getByRole("radio", { name: "Статья и подстраницы", exact: true })
    .waitFor({ timeout: 3000 });
  const scopeRadio = await page
    .getByRole("radio", { name: "Статья и подстраницы", exact: true })
    .boundingBox();
  const scopeField = await page.locator(".import-scope").boundingBox();
  assert.ok(
    scopeRadio.width <= 24 && scopeRadio.height <= 24,
    "scope radio remains a compact native control",
  );
  assert.ok(
    scopeRadio.x < scopeField.x + 40,
    "radio and label stay together on the left",
  );
  assert.equal(
    await page
      .getByRole("radio", { name: "Статья и подстраницы", exact: true })
      .isChecked(),
    true,
  );
  await page
    .getByRole("radio", { name: "Всё публичное меню", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Вложенная страница", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Добавить в библиотеку", exact: true })
    .click();
  await page.waitForURL("**/admin/materials/" + publication.id);
  assert.equal(submittedOptions.scope, "menu");
  assert.deepEqual(submittedOptions.selectedUrls, [
    publication.source.url,
    publication.pages[0].sourceUrl,
  ]);
  await page.unroute("**/api/links");
  await page.unroute("**/api/links/preview");
  await page.unroute("**/api/links/navigation");
  await page.goto(base + "/library/" + publication.slug);
  await page.getByRole("navigation", { name: "Дерево публикации" }).waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".publication-icon")).some(
      (i) => i.tagName === "IMG" && i.complete && i.naturalWidth > 0,
    ),
  );
  const iconResponse = await page.request.get(
    base + "/api/materials/" + publication.id + "/file/icon-root",
  );
  assert.match(iconResponse.headers()["content-security-policy"], /sandbox/);
  assert.match(
    await page.locator(".publication-cover-icon").getAttribute("src"),
    /\/file\/icon-root$/,
  );
  assert.match(await page.locator(".publication-sidebar").innerText(), /📙/);
  const inlineIcons = page.locator(".reading-article .publication-link-icon");
  assert.equal(await inlineIcons.count(), 2);
  await page.waitForFunction(() => {
    const img = document.querySelector(".reading-article img.publication-link-icon");
    return img?.complete && img.naturalWidth > 0;
  });
  for (const icon of await inlineIcons.all()) {
    const box = await icon.boundingBox();
    assert.ok(box.width > 10 && box.width < 32 && box.height < 32, "article icons stay inline and compact");
  }
  assert.match(await page.locator('.reading-article a').first().getAttribute('href'), /^\/library\/.+\?page=baza-znaniy$/);
  const articleBox = await page.locator(".viewer-panel").boundingBox();
  const publicationMenuBox = await page
    .locator(".publication-sidebar")
    .boundingBox();
  assert.ok(
    publicationMenuBox.x >= articleBox.x + articleBox.width,
    "publication pages sit to the right of reading",
  );
  const rootDisclosure = page
    .locator("#publication-tree > .publication-tree-list > li > details")
    .first();
  await rootDisclosure.locator("summary").first().press("Enter");
  assert.equal(
    await rootDisclosure.getAttribute("open"),
    null,
    "keyboard collapses a page branch",
  );
  await rootDisclosure.locator("summary").first().press("Enter");
  assert.notEqual(
    await rootDisclosure.getAttribute("open"),
    null,
    "keyboard expands a page branch",
  );
  let refreshed = 0;
  await page.route("**/api/materials/" + publication.id + "/refresh", (r) => {
    refreshed++;
    return r.fulfill({
      json: {
        ...publication,
        source: { ...publication.source, savedAt: new Date().toISOString() },
      },
    });
  });
  await page
    .getByRole("button", { name: "Обновить ветку", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Сохранённая ветка обновлена" })
    .waitFor();
  assert.equal(refreshed, 1);
  await page
    .getByRole("navigation", { name: "Дерево публикации" })
    .getByRole("link", { name: "Вложенная страница", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Глубокое содержимое", exact: true })
    .waitFor();
  assert.equal(await page.locator(".publication-cover-icon").innerText(), "🗂️");
  assert.equal(
    await page
      .getByRole("navigation", { name: "Дерево публикации" })
      .getByRole("link", { name: "Вложенная страница", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page
    .getByRole("heading", { name: "Глубокое содержимое", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Страницы публикации", exact: true })
      .getAttribute("aria-expanded"),
    "false",
    "mobile tree starts collapsed",
  );
  await page
    .getByRole("button", { name: "Страницы публикации", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Страницы публикации", exact: true })
      .getAttribute("aria-expanded"),
    "true",
  );
  await page.screenshot({
    path: artifacts + "/publication-tree-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Страницы публикации", exact: true })
    .click();
  await page.screenshot({
    path: artifacts + "/publication-tree-mobile-collapsed.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(base + "/library/" + publication.slug);
  await page.getByRole("button", { name: "Статья", exact: true }).click();
  await page
    .locator(".reading-article")
    .getByRole("link", { name: "База знаний", exact: true })
    .click();
  await page.waitForURL("**?page=baza-znaniy", { timeout: 3000 });
  await page
    .getByRole("heading", { name: "Содержимое раздела", exact: true })
    .waitFor();
  await page
    .locator(".reading-article")
    .getByRole("link", { name: "К заключению", exact: true })
    .click();
  await page.waitForFunction(() => {
    const r = document.getElementById("end").getBoundingClientRect();
    return r.top >= 0 && r.bottom < innerHeight;
  });
  await page.getByRole("button", { name: "Текст", exact: true }).click();
  assert.match(
    await page.locator(".reader-full-text").innerText(),
    /Текст раздела/,
  );
  assert.equal(
    await page.locator(".focus-stage").count(),
    0,
    "ordinary reading stays separate from speed reading",
  );
  await page.getByRole("button", { name: "WBook", exact: true }).click();
  assert.equal(await page.locator(".focus-stage").count(), 1);
  await page.getByRole("button", { name: "Статья", exact: true }).click();
  await page
    .locator(".reading-article")
    .getByRole("link", { name: "Главная статья", exact: true })
    .click();
  await page.waitForURL(base + "/library/" + publication.slug);
  await page.goBack();
  await page
    .getByRole("heading", { name: "Содержимое раздела", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "Содержимое раздела", exact: true })
    .waitFor();
  await page.screenshot({
    path: artifacts + "/publication-navigation.png",
    fullPage: true,
  });
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
  await page.locator(".pdf-canvas-stage canvas").first().waitFor();
  await page.waitForFunction(
    () => document.querySelector(".pdf-canvas-stage canvas")?.width > 100,
  );
  assert.equal(
    await page.locator('.app-shell > .sidebar').evaluate(el => getComputedStyle(el).position),
    'fixed',
    'PDF styles must not override the library navigation',
  );
  assert.equal(
    await page
      .getByRole("button", { name: "WBook", exact: true })
      .count(),
    0,
  );
  await page.screenshot({ path: artifacts + "/scan-pdf.png", fullPage: true });
  const jpx = await upload("JPX scan.pdf", makeJpxPdf());
  await page.goto(base + "/library/" + jpx.slug);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.pdf-canvas-stage canvas');
    if (!canvas || canvas.width < 100) return false;
    const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let colored=0; for(let i=0;i<pixels.length;i+=4) if(pixels[i+1]>pixels[i]+30 && pixels[i+1]>pixels[i+2]+20) colored++;
    return colored>100;
  },undefined,{timeout:5000});
  const paged = await upload(
    "Многостраничный.pdf",
    makePdf("Readable text in the document.", 3),
  );
  await page.goto(base + "/library/" + paged.slug);
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Номер страницы"]')?.max === "3",
  );
  assert.equal(await page.locator('.pdf-canvas-stage .page').count(),3,'PDF pages must form a continuous scroll');
  await page.locator('.pdf-canvas-stage .textLayer').first().getByText('Readable text in the document.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('complementary',{name:'Страницы PDF',exact:true}).count(),0,'PDF page list starts closed');
  await page.getByRole('button',{name:'Страницы PDF',exact:true}).click();
  assert.equal(await page.locator('.pdf-page-list canvas').count(),0,'page navigation is a compact list');
  await page.getByRole('button',{name:'Миниатюры',exact:true}).click();
  await page.locator('.pdf-thumbnail').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('.pdf-thumbnail')?.width===96);
  await page.getByRole('button',{name:'Список',exact:true}).click();
  assert.equal(await page.locator('.pdf-thumbnail').count(),0);
  await page.getByRole('button',{name:'Перейти к странице 2',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Номер страницы"]')?.value==='2');
  await page.getByRole('button',{name:'Страницы PDF',exact:true}).click();
  assert.equal(await page.getByRole('complementary',{name:'Страницы PDF',exact:true}).count(),0);
  assert.equal(await page.getByLabel('Номер страницы',{exact:true}).inputValue(),'2','closing the list retains current page');
  await page.locator('.pdf-canvas-stage').evaluate(el=>{el.scrollTop=0;});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Номер страницы"]')?.value==='1');
  await page.getByLabel("Номер страницы", { exact: true }).fill("3");
  await page.getByLabel("Номер страницы", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Текст", exact: true }).click();
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Номер страницы"]')?.max === "3",
  );
  assert.equal(
    await page.getByLabel("Номер страницы", { exact: true }).inputValue(),
    "3",
    "PDF position survives mode switch",
  );
  await page.reload();
  await page.locator(".pdf-canvas-stage canvas").first().waitFor();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Номер страницы"]')?.max === "3",
  );
  assert.equal(
    await page.getByLabel("Номер страницы", { exact: true }).inputValue(),
    "3",
    "PDF position survives reopening",
  );
  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify({ page: 99, zoom: 1 })),
    `dreambusta-view:${paged.id}:${paged.textVersion}:pdf`,
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Номер страницы"]')?.max === "3",
  );
  assert.equal(
    await page.getByLabel("Номер страницы", { exact: true }).inputValue(),
    "3",
    "outdated page is clamped",
  );
  const replacement = await page.request.post(
    base + `/api/materials/${paged.id}/version?name=New.pdf`,
    {
      data: makePdf("New version.", 2),
      headers: {
        "x-csrf-token": csrf,
        "Content-Type": "application/octet-stream",
      },
    },
  );
  assert.equal(replacement.status(), 200);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Номер страницы"]')?.max === "2",
  );
  assert.equal(
    await page.getByLabel("Номер страницы", { exact: true }).inputValue(),
    "1",
    "new version has an independent position",
  );
  const docx = await upload("Договор.docx", await makeDocx());
  await page.goto(base + "/library/" + docx.slug);
  await page.getByRole("button", { name: "Документ", exact: true }).click();
  await page
    .locator(".docx-island")
    .getByText("Документ с таблицей", { exact: true })
    .waitFor();
  await page.locator(".docx-island table").waitFor();
  assert.equal(
    await page.locator(".docx-island [contenteditable=true]").count(),
    0,
    "Word must stay read-only",
  );
  await page.screenshot({ path: artifacts + "/word.png", fullPage: true });
  const pptx = await upload("Презентация.pptx", await makePptx());
  await page.goto(base + "/library/" + pptx.slug);
  await page.getByRole("button", { name: "Слайды", exact: true }).click();
  await page.locator(".slides-stage").getByText("Первый слайд").waitFor();
  await page.getByRole("button", { name: "Следующий слайд" }).click();
  await page.locator(".slides-stage").getByText("Второй по порядку").waitFor();
  await page.getByRole("button", { name: "Текст", exact: true }).click();
  await page.getByRole("button", { name: "Слайды", exact: true }).click();
  await page
    .locator(".slides-stage")
    .getByText("Второй по порядку")
    .waitFor({ timeout: 3000 });
  await page.screenshot({ path: artifacts + "/slides.png", fullPage: true });
  const styledDeck = await upload(
    "Оформленная презентация.pptx",
    await makeStyledPptx(),
  );
  await page.goto(base + "/library/" + styledDeck.slug);
  await page.getByRole("button", { name: "Слайды", exact: true }).click();
  await page
    .locator(".slides-stage")
    .getByText("Основной текст", { exact: false })
    .waitFor();
  const slideRuns = page.locator(".slides-stage .slide-text-object span");
  assert.equal(
    await slideRuns.count(),
    2,
    "mixed runs must retain their own typography",
  );
  const typography = await slideRuns.evaluateAll((runs) =>
    runs.map((run) => {
      const style = getComputedStyle(run);
      return {
        color: style.color,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
      };
    }),
  );
  assert.equal(typography[0].color, "rgb(14, 165, 233)");
  assert.equal(typography[1].color, "rgb(15, 23, 42)");
  assert.equal(typography[1].fontSize, "32px");
  assert.equal(typography[1].fontWeight, "700");
  assert.match(typography[0].fontFamily, /Arial, sans-serif$/);
  assert.equal(await page.locator(".slides-stage rect[rx]").count(), 1);
  const vectorDeck = await upload("Векторная презентация.pptx", await makeVectorPptx());
  await page.goto(base + "/library/" + vectorDeck.slug);
  await page.getByRole("button", { name: "Слайды", exact: true }).click();
  await page.locator(".slides-stage").getByText("Первый слайд").waitFor();
  assert.equal(await page.locator(".slides-stage path[d]").count(), 2, "vector icons must draw their paths");
  assert.equal(await page.locator(".slides-stage radialGradient stop").count(), 2);
  assert.match(await page.locator(".slides-stage ellipse").getAttribute("fill"), /^url\(#/);
  const tableDeck = await upload("Таблица в презентации.pptx", await makeTablePptx());
  await page.goto(base + "/library/" + tableDeck.slug);
  await page.getByRole("button", { name: "Слайды", exact: true }).click();
  await page.locator(".slides-stage").getByText("Первый слайд").waitFor();
  assert.equal(await page.locator(".slides-stage table").count(), 1, "native PPTX tables must render cells");
  const tableCells = page.locator(".slides-stage table td");
  assert.equal(await tableCells.count(), 7);
  assert.equal(await tableCells.filter({ hasText: "Реквизиты" }).getAttribute("colspan"), "2");
  assert.equal(await tableCells.filter({ hasText: "Заказчик" }).getAttribute("rowspan"), "2");
  await page.locator(".slides-stage table").getByText("Контракт", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Текст", exact: true }).click();
  await page.getByText("Контракт", { exact: true }).waitFor();
  const deck = await upload("Большая презентация.pptx", await makeDensePptx());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/library/" + deck.slug);
  await page.getByRole("button", { name: "Слайды", exact: true }).click();
  await page
    .getByLabel("Номер слайда", { exact: true })
    .fill("12", { timeout: 3000 });
  await page.getByLabel("Номер слайда", { exact: true }).press("Enter");
  await page
    .locator(".slides-stage")
    .getByText("Плотный слайд 12", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Миниатюры слайдов", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Перейти к слайду 17", exact: true })
    .click();
  await page
    .locator(".slides-stage")
    .getByText("Плотный слайд 17", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Увеличить слайды", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Увеличить слайды", exact: true })
    .click();
  assert.ok(
    await page
      .locator(".slides-viewport")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    "zoom enlarges a dense slide with internal scrolling",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "zoom must not overflow the phone page",
  );
  await page.getByRole("button", { name: "Полный экран", exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page
    .getByRole("button", { name: "Выйти из полного экрана", exact: true })
    .click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.screenshot({
    path: artifacts + "/slides-mobile-zoom.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .locator(".slides-stage")
    .getByText("Плотный слайд 17", { exact: true })
    .waitFor();
  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify({ page: 99, zoom: 1 })),
    `dreambusta-view:${deck.id}:${deck.textVersion}:slides`,
  );
  await page.reload();
  await page
    .locator(".slides-stage")
    .getByText("Плотный слайд 20", { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 1040 });
  const chapterBook = await upload('Главы.txt',Buffer.from(['Вступительный текст.','Глава 1. Рассвет','Первая история светлая.','Глава 2. Полдень','Вторая история жаркая.','Глава 3. Закат','Последняя история.'].join('\n\n')));
  await page.goto(base+'/library/'+chapterBook.slug);
  await page.getByRole('button',{name:'WBook',exact:true}).click();
  await page.getByLabel('Читать по главам',{exact:true}).check();
  await page.getByRole('button',{name:'Оглавление',exact:true}).click();
  await page.getByLabel('Поиск глав',{exact:true}).fill('Полдень');
  await page.getByRole('button',{name:'Глава 2. Полдень',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.reader-controls').dataset.index==='8');
  assert.match(await page.locator('.reader-text').innerText(),/Вторая история/);
  assert.doesNotMatch(await page.locator('.reader-text').innerText(),/Первая история|Последняя история/);
  await page.getByLabel('Читать по главам',{exact:true}).uncheck();
  assert.equal(await page.locator('.reader-controls').getAttribute('data-index'),'8');
  assert.match(await page.locator('.reader-text').innerText(),/Первая история/);
  await page.getByRole('button',{name:'Текст',exact:true}).click();
  assert.equal(await page.getByLabel('Читать по главам',{exact:true}).count(),0);
  await page.getByRole('button',{name:'WBook',exact:true}).click();
  await page.getByLabel('Читать по главам',{exact:true}).check();
  await page.getByRole('button',{name:'Следующая глава',exact:true}).click();
  assert.equal(await page.locator('.reader-controls').getAttribute('data-index'),'14');
  await page.getByRole('button',{name:'Предыдущая глава',exact:true}).click();
  await page.getByLabel('Позиция в тексте',{exact:true}).fill('13');
  await page.getByRole('button',{name:'Начать чтение',exact:true}).click();
  await page.getByRole('button',{name:'Начать чтение',exact:true}).waitFor();
  assert.equal(await page.locator('.reader-controls').getAttribute('data-index'),'13','playback stops at the chapter end');
  await page.getByRole('button',{name:'Настроить главы',exact:true}).click();
  await page.getByLabel('По началу заголовка',{exact:true}).check();
  await page.getByLabel('Начало заголовка',{exact:true}).fill('Не существует');
  await page.getByRole('button',{name:'Найти главы',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Применить разбивку',exact:true}).isDisabled(),true);
  assert.equal(await page.locator('.reader-controls').getAttribute('data-index'),'13');
  await page.getByLabel('Начало заголовка',{exact:true}).fill('Глава 2.');
  await page.getByRole('button',{name:'Найти главы',exact:true}).click();
  await page.getByRole('button',{name:'Применить разбивку',exact:true}).click();
  await page.reload();
  await page.getByLabel('Читать по главам',{exact:true}).waitFor();
  assert.equal(await page.locator('.reader-controls').getAttribute('data-index'),'13','chapter settings preserve global progress on reload');
  await page.getByRole('button',{name:'Настроить главы',exact:true}).click();
  assert.equal(await page.getByLabel('Начало заголовка',{exact:true}).inputValue(),'Глава 2.');
  await page.getByLabel('Автоматически',{exact:true}).check();
  await page.getByRole('button',{name:'Найти главы',exact:true}).click();
  await page.getByRole('button',{name:'Применить разбивку',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Следующая глава',exact:true}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'chapter controls fit a phone');
  await page.screenshot({path:artifacts+'/wbook-chapters-mobile.png',fullPage:true});
  const beforeClearing=await page.locator('.reader-controls').getAttribute('data-index');
  await page.getByRole('button',{name:'Настроить главы',exact:true}).click();
  await page.getByRole('button',{name:'Убрать разбивку',exact:true}).click();
  assert.equal(await page.locator('.reader-controls').getAttribute('data-index'),beforeClearing);
  assert.match(await page.locator('.reader-text').innerText(),/Вступительный текст/);
  assert.equal(await page.getByLabel('Читать по главам',{exact:true}).isChecked(),false);
  await page.setViewportSize({width:1440,height:1040});
  const long = await upload(
    "Большая книга.txt",
    Buffer.from(
      Array.from(
        { length: 700 },
        (_, i) => `Абзац ${i}. ` + "Слова большой книги. ".repeat(25),
      ).join("\n\n"),
    ),
  );
  await page.goto(base + "/library/" + long.slug);
  await page.locator(".reading-word").first().waitFor();
  assert.ok(
    (await page.locator(".reading-word").count()) < 1500,
    "large book renders only visible rows",
  );
  await page.getByLabel("Позиция в тексте", { exact: true }).fill("50000");
  await page.getByRole("button", { name: "Моё место" }).click();
  await page.waitForFunction(
    () => document.querySelector(".virtual-reader").scrollTop > 5000,
  );
  await page.getByRole("button", { name: "WBook", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (let i = 0; i < 10; i++)
    await page
      .getByRole("button", { name: "Увеличить шрифт", exact: true })
      .click();
  await page.getByLabel("Позиция в тексте", { exact: true }).fill("50040");
  await page.getByRole("button", { name: "Моё место", exact: true }).click();
  await page.waitForFunction(
    () => {
      const viewport = document
        .querySelector(".reader-text")
        ?.getBoundingClientRect();
      const selected = document
        .querySelector(".selected-word")
        ?.getBoundingClientRect();
      return (
        viewport &&
        selected &&
        selected.top >= viewport.top &&
        selected.bottom <= viewport.bottom
      );
    },
    undefined,
    { timeout: 3000 },
  );
  await page.screenshot({
    path: artifacts + "/reader-mobile-context.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1040 });
  const wav = Buffer.alloc(44 + 8000 * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  const audio = await upload("Подкаст.wav", wav);
  await page.goto(base + "/library/" + audio.slug);
  await page.waitForFunction(
    () => document.querySelector("audio")?.duration > 0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Текст", exact: true }).count(),
    0,
  );
  await page.goto(base + "/library");
  await page.locator(".material-card").first().waitFor();
  await page.screenshot({
    path: artifacts + "/catalog-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.querySelector(".sidebar").getBoundingClientRect().right <= 1,
  );
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
    "PASS: editor setup → MD upload → stable links → reader/progress → collection → PDF scan/position/version → readOnly Word → ordered PPTX/position → dense mobile slides/zoom/thumbnails/fullscreen → large book → WAV → mobile/dark.",
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
