import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { Store } from "../server/store.ts";
import { makePdf } from "./fixtures/documents.mjs";

// Exercise the actual app under the same /library prefix used beside Academy.
const dir = mkdtempSync(join(tmpdir(), "dreambusta-mount-"));
const store = new Store(dir);
mkdirSync(join(dir, "files"));
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
writeFileSync(join(dir, "files/icon.png"), image);
const document = store.createMaterial({
  title: "Монтажная инструкция",
  kind: "document",
  source: { type: "share", url: "https://source.test/root" },
  representations: ["article", "text"],
  paragraphs: ["Монтажныйконтекст для проверки поиска."],
  html: '<img src="snapshot:icon"><p>Монтажныйконтекст для проверки поиска.</p><a href="https://source.test/child">Вложенная глава</a>',
  files: {
    icon: {
      path: "files/icon.png",
      name: "icon.png",
      mime: "image/png",
      size: image.length,
    },
  },
  pages: [
    {
      slug: "chapter",
      title: "Глава монтажа",
      sourceUrl: "https://source.test/child",
      parentSourceUrl: "https://source.test/root",
      html: "<p>Текст главы</p>",
      paragraphs: ["Текст главы"],
      wordCount: 2,
    },
  ],
});
const pdfBytes = makePdf("Mounted PDF", 1);
writeFileSync(join(dir, "files/document.pdf"), pdfBytes);
const pdf = store.createMaterial({
  title: "PDF под префиксом",
  kind: "document",
  source: { type: "file" },
  representations: ["pdf"],
  files: {
    pdf: {
      path: "files/document.pdf",
      name: "document.pdf",
      mime: "application/pdf",
      size: pdfBytes.length,
    },
  },
});
store.close();
const env = {
  ...process.env,
  DATA_DIR: dir,
  DREAMBUSTA_BASE_PATH: "/library",
  DREAMBUSTA_AI: "off",
  WEB_PORT: "5215",
  API_PORT: "5216",
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
const origin = "http://localhost:5215";
const base = origin + "/library";
let browser, page;
const errors = [],
  escapedRequests = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/session")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready, "mounted API starts");
  const password = "temporary-mount-test-password";
  const setup = await fetch("http://127.0.0.1:5216/api/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "mounted@test.test", password }),
  });
  assert.equal(setup.status, 201);
  assert.match(setup.headers.get("set-cookie"), /Path=\/library;/);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (
      u.origin === origin &&
      /^\/(api|embed|pdfjs|fonts)(\/|\.)/.test(u.pathname)
    )
      escapedRequests.push(u.pathname);
  });
  await page.goto(base + "/");
  const card = page
    .locator(".material-card")
    .filter({ hasText: document.title });
  await card.waitFor();
  assert.equal(
    await card.getAttribute("href"),
    `/library/materials/${document.slug}`,
  );
  await card.click();
  await page.locator(".reading-article img").waitFor();
  await page.waitForFunction(() => {
    const i = window.document.querySelector(".reading-article img");
    return i?.complete && i.naturalWidth > 0;
  });
  await page
    .locator(".reading-article")
    .getByRole("link", { name: "Вложенная глава" })
    .click();
  await page.waitForURL(/\/library\/materials\/.*\?page=chapter/);
  await page.reload();
  await page
    .locator(".reading-article")
    .getByText("Текст главы", { exact: true })
    .waitFor();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Поиск по библиотеке" });
  await dialog
    .getByRole("combobox", { name: "Поисковый запрос" })
    .fill("Монтажныйконтекст");
  await dialog
    .getByRole("option")
    .filter({ hasText: document.title })
    .first()
    .click();
  await page.waitForURL(/\/library\/materials\/.*paragraph=0/);
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill("mounted@test.test");
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL(base + "/admin/materials");
  const cookie = (await context.cookies()).find((c) => c.name === "db_session");
  assert.equal(cookie.path, "/library");
  const session = await (
    await context.request.get(base + "/api/session")
  ).json();
  assert.equal(session.editor, true);
  const created = await context.request.post(base + "/api/widgets", {
    headers: { "x-csrf-token": session.csrf, origin },
    data: {
      name: "Mounted assistant",
      state: "published",
      allowedOrigins: [origin],
    },
  });
  assert.equal(created.status(), 201);
  const widget = await created.json();
  await page.goto(base + "/admin/widgets");
  await page
    .getByRole("navigation", { name: "Помощники", exact: true })
    .getByRole("button")
    .filter({ hasText: "Mounted assistant" })
    .click();
  const preview = page.frameLocator(".widget-preview");
  await preview.getByLabel("Ваш вопрос").waitFor();
  await page.goto(base + `/materials/${pdf.slug}`);
  await page.locator(".pdf-workspace canvas").first().waitFor();
  const version = JSON.parse(
    readFileSync("node_modules/pdfjs-dist/package.json", "utf8"),
  ).version;
  assert.equal(
    (
      await context.request.get(
        `${base}/pdfjs/${version}/standard_fonts/LiberationSans-Regular.ttf`,
      )
    ).status(),
    200,
  );
  assert.deepEqual(
    escapedRequests,
    [],
    "API, snapshot, widget and PDF requests stay within the mount",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: /library catalogue, snapshot, article links/reload, search, login cookie, widget preview and PDF assets.",
  );
} catch (error) {
  mkdirSync(".superpowers/mount", { recursive: true });
  if (page) {
    writeFileSync(".superpowers/mount/failure.html", await page.content());
    await page.screenshot({ path: ".superpowers/mount/failure.png" });
  }
  console.error({ errors, escapedRequests });
  console.error(logs.join("").slice(-3000));
  throw error;
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
  rmSync(dir, { recursive: true, force: true });
}
