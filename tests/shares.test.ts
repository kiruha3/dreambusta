import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
async function service() {
  const m = await import("../server/shares.ts").catch(() => null);
  assert.ok(m?.Shares, "Share service is missing");
  return m;
}
test("known video providers have safe embeds and direct media links retain their type", async () => {
  const { resolveLink } = await service();
  assert.equal(resolveLink("https://youtu.be/abcdefghijk").provider, "youtube");
  assert.equal(
    resolveLink("https://rutube.ru/video/abcdef123456/").provider,
    "rutube",
  );
  assert.equal(resolveLink("https://example.org/podcast.mp3").kind, "audio");
  assert.equal(
    resolveLink("https://buildin.ai/share/public").provider,
    "buildin",
  );
  assert.throws(() => resolveLink("javascript:alert(1)"), /http|адрес/i);
  assert.throws(
    () => resolveLink("https://youtube.com.evil.test/video"),
    /источник|поддерж/i,
  );
});
test("Buildin saves only article; ordinary opens do not fetch; revoked update retains snapshot until explicit finish", async (t) => {
  const { Shares } = await service();
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-share-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let calls = 0;
  let mode = "ok";
  const get = async () => {
    calls++;
    if (mode === "timeout") throw new Error("timeout");
    return {
      status: mode === "gone" ? 404 : 200,
      body: Buffer.from(
        "<html><title>Article</title><nav>WORKSPACE SECRET NAV</nav><main><h1>Правила работы</h1><p>Полезный опубликованный текст.</p><script>evil()</script></main></html>",
      ),
      contentType: "text/html",
    };
  };
  const shares = new Shares(store, dir, get);
  const m = await shares.add("https://buildin.ai/share/public");
  assert.match(m.html, /Полезный опубликованный/);
  assert.doesNotMatch(m.html, /WORKSPACE|evil/);
  store.resolveMaterial(m.slug);
  store.resolveMaterial(m.slug);
  assert.equal(calls, 1);
  mode = "gone";
  const kept = await shares.refresh(m.id);
  assert.equal(kept.source.status, "unavailable");
  assert.match(kept.html, /Полезный/);
  mode = "timeout";
  const timeout = await shares.refresh(m.id);
  assert.match(timeout.html, /Полезный/);
  assert.equal(timeout.source.status, "error");
  assert.throws(() => shares.finishUnavailable(m.id), /провер|недоступ/i);
  mode = "gone";
  await shares.refresh(m.id);
  const removed = shares.finishUnavailable(m.id);
  assert.equal(removed.html, "");
  assert.deepEqual(removed.paragraphs, []);
  assert.deepEqual(removed.files, {});
  assert.equal(removed.source.status, "removed");
});
test("server fetch rejects loopback/private addresses and credentialed URLs", async () => {
  const m = await import("../server/sources/network.ts").catch(() => null);
  assert.ok(m?.validatePublicUrl, "Network boundary is missing");
  for (const u of [
    "http://127.0.0.1/admin",
    "http://[::1]/",
    "http://192.168.1.2/",
    "http://user:pass@example.com",
    "http://169.254.169.254/",
  ])
    await assert.rejects(m.validatePublicUrl(u));
});
test("TechHelper PDF share saves only the published preview, never a response original URL", async (t) => {
  const { Shares } = await service();
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-published-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const calls: string[] = [];
  const get = async (url: string) => {
    calls.push(url);
    return url.includes("file-source")
      ? {
          status: 200,
          contentType: "application/pdf",
          body: Buffer.from("%PDF-1.4 public-preview"),
        }
      : {
          status: 200,
          contentType: "application/json",
          body: Buffer.from(
            JSON.stringify({
              title: "Published scan",
              file_info: { viewer: "pdf", status: "ready" },
              source_file_url: "https://private.test/original.pdf",
            }),
          ),
        };
  };
  const m = await new Shares(store, dir, get).add(
    "https://docs.example.test/shared/d/123-title",
  );
  assert.ok(m.representations.includes("pdf"));
  assert.ok(m.files.pdf);
  assert.equal(m.paragraphs.length, 0);
  assert.deepEqual(calls, [
    "https://docs.example.test/api/shared/d/123-title/",
    "https://docs.example.test/api/shared/d/123-title/file-source/?variant=preview",
  ]);
  assert.ok(!m.files.original);
});

test("in-flight refresh cannot restore a revoked snapshot or overwrite a replacement", async (t) => {
  const { Shares } = await service();
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-refresh-race-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let complete!: (v: any) => void;
  const shares = new Shares(
    store,
    dir,
    () =>
      new Promise((r) => {
        complete = r;
      }),
  );
  const response = {
    status: 200,
    contentType: "text/html",
    body: Buffer.from("<main><p>Delayed snapshot</p></main>"),
  };
  const original = store.createMaterial({
    title: "Share",
    kind: "document",
    source: {
      type: "share",
      url: "https://buildin.ai/share/public",
      status: "unavailable",
    },
    html: "<p>Saved</p>",
    paragraphs: ["Saved"],
    representations: ["article", "text"],
  });
  const pending = shares.refresh(original.id);
  const removed = shares.finishUnavailable(original.id);
  complete(response);
  await assert.rejects(pending, /измен[её]н|повтор/i);
  assert.deepEqual(store.resolveMaterial(original.id), removed);
  const replacing = shares.refresh(original.id);
  const replacement = store.updateMaterial(original.id, {
    source: { type: "file" },
    paragraphs: ["Uploaded"],
    textVersion: removed.textVersion + 1,
  });
  complete(response);
  await assert.rejects(replacing, /измен[её]н|повтор/i);
  assert.deepEqual(store.resolveMaterial(original.id), replacement);
});

test("concurrent refreshes cannot commit different snapshots under one text version", async (t) => {
  const { Shares } = await service();
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-concurrent-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const completions: ((v: any) => void)[] = [];
  const shares = new Shares(
    store,
    dir,
    () =>
      new Promise((r) => {
        completions.push(r);
      }),
  );
  const m = store.createMaterial({
    title: "Share",
    kind: "document",
    source: {
      type: "share",
      url: "https://buildin.ai/share/public",
      status: "saved",
    },
  });
  const first = shares.refresh(m.id),
    second = shares.refresh(m.id);
  completions[0]({
    status: 200,
    contentType: "text/html",
    body: Buffer.from("<main><p>First</p></main>"),
  });
  const saved = await first;
  completions[1]({
    status: 200,
    contentType: "text/html",
    body: Buffer.from("<main><p>Second</p></main>"),
  });
  await assert.rejects(second, /измен[её]н|повтор/i);
  assert.deepEqual(store.resolveMaterial(m.id), saved);
  assert.equal(saved.textVersion, m.textVersion + 1);
});

test("a preview timeout or image failure retains the complete last good snapshot", async (t) => {
  const { Shares } = await service();
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-atomic-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let failure = "";
  let text = "Original text";
  const get = async (url: string) => {
    if (url.includes("file-source")) {
      if (failure === "pdf") throw new Error("Preview timeout");
      return {
        status: 200,
        contentType: "application/pdf",
        body: Buffer.from("%PDF-1.4 preview"),
      };
    }
    if (url.endsWith("cover.png")) {
      if (failure === "image") throw new Error("Image timeout");
      return {
        status: 200,
        contentType: "image/png",
        body: Buffer.from("raster fixture"),
      };
    }
    return {
      status: 200,
      contentType: "application/json",
      body: Buffer.from(
        JSON.stringify({
          title: "Article",
          file_info: { viewer: "pdf" },
          content_html: `<p>${text}</p><img src="https://docs.example.test/cover.png">`,
        }),
      ),
    };
  };
  const shares = new Shares(store, dir, get);
  const original = await shares.add(
    "https://docs.example.test/shared/d/article",
  );
  assert.deepEqual(Object.keys(original.files).sort(), ["asset-0", "pdf"]);
  text = "New text";
  for (const mode of ["pdf", "image"]) {
    failure = mode;
    const kept = await shares.refresh(original.id);
    assert.equal(
      kept.source.status,
      "error",
      `${mode} failure must not be reported as saved`,
    );
    for (const key of [
      "files",
      "representations",
      "html",
      "paragraphs",
      "textVersion",
    ] as const)
      assert.deepEqual(kept[key], original[key]);
  }
  failure = "";
  const refreshed = await shares.refresh(original.id);
  assert.equal(refreshed.source.status, "saved");
  assert.equal(refreshed.textVersion, original.textVersion + 1);
  assert.deepEqual(refreshed.paragraphs, ["New text"]);
});

test("re-importing a source reports the existing material before fetching it again", async (t) => {
  const { Shares } = await service();
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-duplicate-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let calls = 0;
  const shares = new Shares(store, dir, async () => {
    calls++;
    return {
      status: 200,
      contentType: "text/html",
      body: Buffer.from("<main><p>Saved article</p></main>"),
    };
  });
  await shares.add("https://buildin.ai/share/public");
  await assert.rejects(
    shares.add("https://buildin.ai/share/public#heading"),
    /уже добавлен/i,
  );
  assert.equal(calls, 1);
  assert.equal(store.listMaterials().length, 1);
});
