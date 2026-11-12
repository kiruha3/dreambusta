import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { Store } from "../server/store.ts";
import { SearchService } from "../server/search/service.ts";
import { createWidgetHandler } from "../server/widgets.ts";

const dir = mkdtempSync(join(tmpdir(), "dreambusta-widget-browser-"));
const store = new Store(dir);
const search = new SearchService(store, {
  models: {
    enabled: true,
    embeddingModel: "test",
    embed: async () => [],
    generate: async () => ({
      sentences: [
        {
          text: "<img src=x onerror=window.pwned=1> Договор согласует руководитель.",
          sources: [1],
        },
      ],
    }),
  },
});
const handle = createWidgetHandler({ store, search });
let requests = [],
  widget,
  base,
  hostOrigin;
const api = createServer(async (req, res) => {
  if (req.url.startsWith("/api/public/"))
    requests.push({ url: req.url, cookie: req.headers.cookie });
  if (!(await handle(req, res, new URL(req.url, "http://localhost")))) {
    res.writeHead(404);
    res.end();
  }
});
const host = createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  const path = req.url;
  if (path === "/head")
    return res.end(
      `<html><head><script src="${base}/embed.js" data-widget="${widget.id}"></script></head><body>Head loader</body></html>`,
    );
  if (path === "/manual")
    res.end(
      `<iframe id="manual" src="${base}/embed/${widget.id}" style="width:350px;height:600px"></iframe>`,
    );
  else
    res.end(
      `<html><body><div id="inline"></div><script src="${base}/embed.js" data-widget="${widget.id}" ${path === "/inline" ? 'data-mode="inline" data-target="inline"' : ""}></script></body></html>`,
    );
});
const listen = (server) =>
  new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  await listen(api);
  await listen(host);
  base = "http://127.0.0.1:" + api.address().port;
  hostOrigin = "http://127.0.0.1:" + host.address().port;
  store.createMaterial({
    title: "Согласование",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор согласует руководитель."],
  });
  const editorToken = "a".repeat(64);
  store.db
    .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
    .run(
      createHash("sha256").update(editorToken).digest("hex"),
      "editor@test",
      "csrf",
      Date.now() + 600000,
    );
  const create = await fetch(base + "/api/widgets", {
    method: "POST",
    headers: {
      origin: base,
      cookie: "db_session=" + editorToken,
      "x-csrf-token": "csrf",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "Browser",
      state: "published",
      allowedOrigins: [hostOrigin],
    }),
  });
  assert.equal(create.status, 201);
  widget = await create.json();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
  });
  await context.addCookies([
    { name: "db_session", value: editorToken, url: base },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(hostOrigin + "/");
  await page
    .getByRole("button", { name: "Открыть помощника Дримбусты" })
    .click();
  const launcher = page.locator("button[aria-expanded]");
  const panel = page.getByRole("dialog", { name: "Помощник Дримбусты" });
  await page.waitForFunction(
    () => document.querySelector('[role="dialog"]').getAnimations().length > 0,
  );
  assert.equal(
    await launcher.isVisible(),
    false,
    "launcher disappears during the morph",
  );
  assert.equal(await launcher.getAttribute("tabindex"), "-1");
  assert.equal(
    await page.getByRole("button").count(),
    0,
    "only the iframe header closes the open assistant",
  );
  await page.evaluate(
    ({ widget, base, hostOrigin }) => {
      const childWindow = document.querySelector("iframe").contentWindow;
      for (const [source, origin] of [
        [window, base],
        [childWindow, hostOrigin],
      ])
        window.dispatchEvent(
          new MessageEvent("message", {
            source,
            origin,
            data: { type: "dreambusta:close", widget },
          }),
        );
    },
    { widget: widget.id, base, hostOrigin },
  );
  assert.equal(
    await launcher.getAttribute("aria-expanded"),
    "true",
    "foreign message sources and origins cannot close the panel",
  );
  const frame = page.frameLocator("iframe");
  await frame.getByLabel("Ваш вопрос").fill("договор");
  await frame.getByRole("button", { name: "Спросить" }).click();
  await frame
    .getByText(
      "<img src=x onerror=window.pwned=1> Договор согласует руководитель.",
      { exact: false },
    )
    .waitFor();
  assert.equal(await frame.locator("img").count(), 0);
  assert.match(
    await frame.locator(".sources a").getAttribute("href"),
    new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/library/"),
  );
  const bounds = await page.locator("iframe").boundingBox();
  assert.ok(bounds.width <= 328 && bounds.x >= 0 && bounds.y >= 0);
  await frame.getByRole("button", { name: "Закрыть помощника" }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[aria-expanded]")
        .getAttribute("aria-expanded") === "false",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Открыть помощника Дримбусты" })
      .getAttribute("aria-expanded"),
    "false",
  );
  await launcher.waitFor({ state: "visible" });
  assert.equal(
    await launcher.evaluate((node) => node === document.activeElement),
    true,
  );
  await launcher.press("Enter");
  await frame.getByLabel("Ваш вопрос").waitFor();
  await frame.getByLabel("Ваш вопрос").focus();
  await page.keyboard.press("Escape");
  await launcher.waitFor({ state: "visible" });
  assert.equal(
    await panel.isVisible(),
    false,
    "Escape during opening finishes a clean close",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await launcher.press("Enter");
  await frame.getByLabel("Ваш вопрос").waitFor();
  assert.equal(await panel.evaluate((node) => node.getAnimations().length), 0);
  await frame.getByLabel("Ваш вопрос").focus();
  await page.keyboard.press("Escape");
  await launcher.waitFor({ state: "visible" });
  assert.equal(
    await launcher.evaluate((node) => node === document.activeElement),
    true,
    "reduced-motion close restores keyboard focus",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(hostOrigin + "/inline");
  await page
    .frameLocator("#inline iframe")
    .getByLabel("Ваш вопрос")
    .fill("договор");
  assert.equal(await page.locator("#inline iframe").count(), 1);
  await page
    .frameLocator("#inline iframe")
    .getByRole("button", { name: "Закрыть помощника" })
    .click();
  assert.equal(
    await page.locator("#inline iframe").isVisible(),
    true,
    "inline embeds remain in place",
  );
  await page.goto(hostOrigin + "/manual");
  const child = page.frames().find((f) => f.url().includes("/embed/"));
  await child.waitForSelector("#query");
  assert.equal(await child.locator("#query").isDisabled(), true);
  await child.evaluate(
    ({ widget, hostOrigin }) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          origin: hostOrigin,
          data: { type: "dreambusta:context", widget },
        }),
      ),
    { widget: widget.id, hostOrigin },
  );
  assert.equal(await child.locator("#query").isDisabled(), true);
  await page.evaluate(
    ({ widget, base }) =>
      document
        .querySelector("iframe")
        .contentWindow.postMessage(
          { type: "dreambusta:context", widget },
          base,
        ),
    { widget: widget.id, base },
  );
  await child.locator("#query").waitFor({ state: "visible" });
  await page.waitForFunction(() => true);
  await child.waitForFunction(() => !document.getElementById("query").disabled);
  assert.ok(requests.length >= 3);
  assert.ok(
    requests.every((r) => !r.cookie),
    JSON.stringify(requests),
  );
  assert.deepEqual(errors, []);
  await page.goto(hostOrigin + "/head");
  await page
    .getByRole("button", { name: "Открыть помощника Дримбусты" })
    .waitFor({ timeout: 2000 });
  const beforeDenied = requests.length;
  const denied = page.waitForEvent("console", {
    predicate: (entry) => entry.text().includes("frame-ancestors"),
    timeout: 3000,
  });
  await page.goto(hostOrigin.replace("127.0.0.1", "localhost") + "/manual");
  await denied;
  assert.equal(requests.length, beforeDenied);

  console.log(
    JSON.stringify({
      ok: true,
      browser: "Chromium",
      mobile: true,
      floating: true,
      inline: true,
      xssTextOnly: true,
      sourceLinksAbsolute: true,
      handshakeSourceChecked: true,
      publicRequestsCredentialsOmit: requests.length,
    }),
  );
} finally {
  await browser?.close();
  api.closeAllConnections();
  host.closeAllConnections();
  await Promise.all([
    new Promise((r) => api.close(r)),
    new Promise((r) => host.close(r)),
  ]);
  await search.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
