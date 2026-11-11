import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import { Shares } from "../server/shares.ts";

const url = (id: string) => `https://buildin.ai/share/${id}`;
function fixture(t: any) {
  const dir = mkdtempSync(join(tmpdir(), "publication-tree-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const blocks: Record<string, any> = {
    menu: { type: 0, title: "Справка", subNodes: ["root", "other"] },
    root: {
      type: 0,
      title: "Статья",
      parentId: "menu",
      subNodes: ["intro", "fold"],
    },
    intro: { type: 1, title: "Начальный текст" },
    fold: { type: 13, parentId: "root", subNodes: ["child"] },
    child: {
      type: 0,
      title: "Раздел",
      parentId: "fold",
      subNodes: ["text", "deep"],
    },
    text: { type: 1, title: "Текст раздела" },
    deep: {
      type: 0,
      title: "Раздел",
      parentId: "child",
      subNodes: ["end", "root"],
    },
    end: { type: 1, title: "Глубокий текст" },
    other: { type: 0, title: "Сосед", parentId: "menu", subNodes: ["outside"] },
    outside: { type: 1, title: "Соседний текст" },
    private: { type: 0, title: "Не относится к меню", subNodes: [] },
  };
  const calls: string[] = [];
  const state = { broken: "" };
  const shares = new Shares(store, dir, async (target) => {
    calls.push(target);
    const id = new URL(target).pathname.split("/").pop()!;
    assert.ok(blocks[id], `unexpected fetch: ${target}`);
    return {
      status: state.broken === id ? 503 : 200,
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ data: { blocks } })),
    };
  });
  return { shares, store, dir, blocks, calls, state };
}

test("default Buildin branch saves descendants through ordinary blocks with parent tree, bounded cycles and distinct slugs", async (t) => {
  const { shares, calls } = fixture(t);
  const m = await shares.add(url("root"));
  assert.equal(m.source.importOptions?.scope, "branch");
  assert.deepEqual(
    m.pages?.map((p) => p.sourceUrl),
    [url("child"), url("deep")],
  );
  assert.deepEqual(
    m.pages?.map((p) => p.parentSourceUrl),
    [url("root"), url("child")],
  );
  assert.equal(new Set(m.pages?.map((p) => p.slug)).size, 2);
  assert.match(m.pages![1].html, /Глубокий текст/);
  assert.equal(m.navigation?.length, 3);
  assert.equal(calls.length, 3);
});

test("article-only scope never fetches or saves descendants", async (t) => {
  const { shares, calls } = fixture(t);
  const m = await shares.add(url("root"), undefined, { scope: "article" });
  assert.deepEqual(m.pages, []);
  assert.equal(calls.length, 1);
  assert.equal(m.source.importOptions?.scope, "article");
});

test("menu metadata is reachable public tree only; explicit selection excludes unchecked pages and survives refresh", async (t) => {
  const { shares, calls } = fixture(t);
  const navigation = await shares.navigation(url("root"));
  assert.deepEqual(
    navigation.map((n) => n.sourceUrl),
    [url("menu"), url("root"), url("child"), url("deep"), url("other")],
  );
  calls.length = 0;
  const options = {
    scope: "menu" as const,
    selectedUrls: [url("root"), url("deep"), url("other")],
  };
  const m = await shares.add(url("root"), undefined, options);
  assert.deepEqual(
    m.pages?.map((p) => p.sourceUrl),
    [url("deep"), url("other")],
  );
  assert.ok(!m.pages?.some(p => p.sourceUrl === url("child")), "unchecked pages are discovered but not stored");
  assert.deepEqual(m.source.importOptions, options);
  const updated = await shares.refresh(m.id);
  assert.deepEqual(updated.source.importOptions, options);
  assert.deepEqual(updated.pages, m.pages);
});

test("menu rejects forged URLs before any selected content fetch", async (t) => {
  const { shares, calls } = fixture(t);
  await assert.rejects(
    shares.add(url("root"), undefined, {
      scope: "menu",
      selectedUrls: ["https://evil.example/shared/stolen"],
    }),
    /выбор|меню/i,
  );
  assert.ok(
    calls.every(
      (c) =>
        ["root", "menu", "child", "deep", "other"].some(id => c === `https://buildin.ai/api/docs/${id}`),
    ),
  );
});

test("manual branch refresh discovers new children and retains whole snapshot on descendant failure", async (t) => {
  const { shares, blocks, state } = fixture(t);
  const m = await shares.add(url("root"));
  blocks.root.subNodes.push("new");
  blocks.new = {
    type: 0,
    title: "Новый раздел",
    parentId: "root",
    subNodes: ["new-text"],
  };
  blocks["new-text"] = { type: 1, title: "Новая информация" };
  const fresh = await shares.refresh(m.id);
  assert.equal(fresh.pages?.length, 3);
  state.broken = "deep";
  blocks.intro.title = "Не должно попасть в сохранённую версию";
  const kept = await shares.refresh(m.id);
  assert.equal(kept.source.status, "error");
  assert.equal(kept.html, fresh.html);
  assert.deepEqual(kept.pages, fresh.pages);
  assert.deepEqual(kept.navigation, fresh.navigation);
});

test("Buildin menu accepts normalized public URL variants and keeps one root identity", async (t) => {
  const { shares } = fixture(t);
  const m = await shares.add(
    "http://www.buildin.ai/share/root?utm_source=copy",
    undefined,
    {
      scope: "menu",
      selectedUrls: [url("root"), url("child")],
    },
  );
  assert.equal(m.source.url, url("root"));
  assert.equal(
    m.navigation?.filter((n) => n.sourceUrl === url("root")).length,
    1,
  );
  assert.deepEqual(
    m.pages?.map((p) => p.sourceUrl),
    [url("child")],
  );
});

test("deep Buildin traversal fails explicitly and cannot replace a complete saved branch", async (t) => {
  const { shares, blocks } = fixture(t);
  const original = await shares.add(url("root"));
  blocks.root.subNodes = ["nested-0"];
  for (let i = 0; i < 102; i++)
    blocks[`nested-${i}`] = {
      type: 13,
      subNodes: [i === 101 ? "child" : `nested-${i + 1}`],
    };
  await assert.rejects(shares.publication(url("root")), /сложн|глубин|лимит/i);
  const kept = await shares.refresh(original.id);
  assert.equal(kept.source.status, "error");
  assert.equal(kept.html, original.html);
  assert.deepEqual(kept.pages, original.pages);
});

test("an optional image cannot bypass the aggregate 100 MiB publication limit", async (t) => {
  const { store, dir } = fixture(t);
  const shares = new Shares(store, dir, async (target) => ({
    status: 200,
    contentType: target.endsWith(".png") ? "image/png" : "application/json",
    body: target.endsWith(".png")
      ? Buffer.alloc(2 * 1024 * 1024)
      : Buffer.from(
          JSON.stringify({
            title: "Статья",
            content_md: "Текст\n\n![Фото](https://images.example/image.png)",
          }),
        ),
  }));
  await assert.rejects(
    shares.publication("https://docs.example/shared/budget", false, {
      visited: new Set(),
      bytes: 99 * 1024 * 1024,
      count: 0,
      rootUrl: "https://docs.example/shared/budget",
    }),
    /100 МБ/,
  );
});
