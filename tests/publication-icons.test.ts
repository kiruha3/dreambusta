import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Shares } from "../server/shares.ts";
import { Store } from "../server/store.ts";

test("Buildin uploaded icons inside page links are stored locally using the linked page identity", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "publication-inline-icons-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const blocks = {
    root: { type: 0, title: "Guide", subNodes: ["child"] },
    child: {
      type: 0,
      title: "副本Logo",
      data: {
        segments: [{ text: "Logo" }],
        icon: { type: "upload", value: "s3/child.svg" },
      },
      subNodes: [],
    },
  };
  const shares = new Shares(store, dir, async (target, _limit, request) => {
    if (target.endsWith("/api/file/create_urls")) {
      assert.deepEqual(request?.json, {
        batch: [{ blockId: "child", ossName: "s3/child.svg", isPublic: false }],
      });
      return {
        status: 200,
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            code: 200,
            data: [
              { url: "https://cdn.example/child.svg?signature=temporary" },
            ],
          }),
        ),
      };
    }
    if (target.startsWith("https://cdn.example/"))
      return {
        status: 200,
        contentType: "image/svg+xml",
        body: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>',
        ),
      };
    return {
      status: 200,
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ data: { blocks } })),
    };
  });
  const saved = await shares.add("https://buildin.ai/share/root");
  assert.match(saved.html!, /<img[^>]+class="publication-link-icon"/);
  const key = /src="snapshot:([a-z0-9-]+)"/.exec(saved.html!)![1];
  assert.equal(saved.files[key].mime, "image/svg+xml");
  assert.match(readFileSync(join(dir, saved.files[key].path), "utf8"), /<path/);
  assert.doesNotMatch(saved.html!, /副本|cdn\.example|signature/);
});

test("Buildin retains emoji and uploaded SVG page icons as local snapshots across branch and menu imports", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "publication-icons-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const source = "https://buildin.ai/share/root";
  const child = "https://buildin.ai/share/child";
  let imageBroken = false;
  const requests: any[] = [];
  const blocks = {
    root: {
      type: 0,
      title: "Guide",
      data: { icon: { type: "upload", value: "s3/logo.svg" } },
      subNodes: ["text", "child"],
    },
    text: { type: 1, title: "Read the guide" },
    child: {
      type: 0,
      title: "Database",
      data: { icon: { type: "emoji", value: "🗂️" } },
      subNodes: ["child-text"],
    },
    "child-text": { type: 1, title: "Database content" },
  };
  const shares = new Shares(store, dir, async (url, _limit, request) => {
    requests.push({ url, request });
    if (url.endsWith("/api/file/create_urls")) {
      assert.deepEqual(request?.json, {
        batch: [{ blockId: "root", ossName: "s3/logo.svg", isPublic: false }],
      });
      return {
        status: 200,
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            code: 200,
            data: [
              {
                url: "https://cdn.example/logo.svg?public-signature=temporary",
              },
            ],
          }),
        ),
      };
    }
    if (url.startsWith("https://cdn.example/"))
      return {
        status: imageBroken ? 503 : 200,
        contentType: "image/svg+xml",
        body: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><foreignObject>bad</foreignObject><path onclick="alert(1)" fill="url(https://bad.example/track)" d="M0 0h24v24H0z"/></svg>',
        ),
      };
    return {
      status: 200,
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ data: { blocks } })),
    };
  });
  const m = await shares.add(source);
  assert.equal(m.icon?.type, "image");
  assert.match(m.icon!.value, /^snapshot:icon-/);
  const file = m.files[m.icon!.value.slice("snapshot:".length)];
  assert.equal(file.mime, "image/svg+xml");
  const svg = readFileSync(join(dir, file.path), "utf8");
  assert.match(svg, /viewBox="0 0 24 24"/);
  assert.doesNotMatch(svg, /script|foreignObject|onclick|bad\.example/);
  assert.deepEqual(m.pages![0].icon, { type: "emoji", value: "🗂️" });
  assert.deepEqual(m.navigation![0].icon, m.icon);
  assert.deepEqual(m.navigation![1].icon, m.pages![0].icon);
  const n = requests.length;
  store.resolveMaterial(m.id);
  assert.equal(
    requests.length,
    n,
    "opening saved icons never fetches the source",
  );
  imageBroken = true;
  const kept = await shares.refresh(m.id);
  assert.equal(kept.source.status, "error");
  assert.deepEqual(kept.icon, m.icon);
  assert.deepEqual(kept.files, m.files);
  imageBroken = false;
  const menu = await shares.snapshot(source, false, {
    scope: "menu",
    selectedUrls: [source, child],
  });
  assert.deepEqual(menu.navigation![0].icon, menu.icon);
  assert.deepEqual(menu.navigation![1].icon, menu.pages![0].icon);
});
