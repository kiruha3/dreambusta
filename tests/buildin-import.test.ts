import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Shares } from "../server/shares.ts";
import { Store } from "../server/store.ts";

const url = (id: string) => `https://buildin.ai/share/${id}`;
function fixture(t: any, count = 3) {
  const dir = mkdtempSync(join(tmpdir(), "buildin-partial-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const calls: string[] = [];
  const state = { broken: "" };
  const blocks: Record<string, any> = {};
  for (let i = 0; i < count; i++) {
    blocks[`page-${i}`] = {
      type: 0,
      title: `副本Раздел ${i}`,
      data: {
        segments: [{ text: `Раздел ${i}` }],
        icon: { type: "emoji", value: "📚" },
      },
      subNodes: [`text-${i}`, ...(i + 1 < count ? [`page-${i + 1}`] : [])],
    };
    blocks[`text-${i}`] = { type: 1, title: `Текст ${i}` };
  }
  const shares = new Shares(store, dir, async (target) => {
    calls.push(target);
    const id = new URL(target).pathname.split("/").pop()!;
    if (state.broken === id)
      return {
        status: 503,
        contentType: "application/json",
        body: Buffer.from("{}"),
      };
    const page = blocks[id];
    assert.ok(page, `unexpected fetch: ${target}`);
    // Like the public API: own blocks plus page records, not the whole tree.
    const visible: Record<string, any> = { [id]: page };
    for (const key of page.subNodes) visible[key] = blocks[key];
    return {
      status: 200,
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ data: { blocks: visible } })),
    };
  });
  return { shares, blocks, calls, state };
}

test("Buildin public menu discovers grandchildren from separate document responses", async (t) => {
  const { shares } = fixture(t);
  const nodes = await shares.navigation(url("page-0"));
  assert.deepEqual(
    nodes.map((n) => n.sourceUrl),
    [url("page-0"), url("page-1"), url("page-2")],
  );
  assert.equal(nodes[2].parentSourceUrl, url("page-1"));
  const saved = await shares.add(url("page-0"), undefined, {
    scope: "menu",
    selectedUrls: nodes.map((n) => n.sourceUrl),
  });
  assert.equal(saved.pages?.length, 2);
  assert.match(saved.pages![1].html, /Текст 2/);
});

test("Buildin uses visible rich titles and real icons inside article links", async (t) => {
  const { shares, blocks } = fixture(t);
  const child = "11111111-1111-4111-8111-111111111111";
  blocks[`text-0`].data = {
    segments: [
      { text: "Внешний сайт", type: 3, url: "https://example.org/" },
      { text: "Связанный раздел", type: 3, url: `https://buildin.ai/${child}` },
    ],
  };
  const saved = await shares.add(url("page-0"));
  assert.equal(saved.title, "Раздел 0");
  assert.equal(saved.pages![0].title, "Раздел 1");
  assert.doesNotMatch(saved.html!, /副本/);
  assert.match(saved.html!, /class="publication-link-icon"[^>]*>📚<\/span>/);
  assert.match(saved.html!, /href="https:\/\/example.org\/"/);
  assert.ok(saved.html!.includes(`href="${url(child)}"`));
  assert.ok(
    !saved.paragraphs!.some((p) => p.includes("📚")),
    "decorative icons are not read aloud",
  );
});

test("Buildin full menu supports a bounded tree larger than 100 pages and fetches each response once per snapshot", async (t) => {
  const { shares, calls } = fixture(t, 105);
  const saved = await shares.add(url("page-0"), undefined, { scope: "menu" });
  assert.equal(saved.pages?.length, 104);
  assert.equal(saved.navigation?.length, 105);
  assert.equal(
    calls.length,
    105,
    "menu discovery responses are reused during content import",
  );
});

test("Buildin menu failure retains the previous complete publication", async (t) => {
  const { shares, state } = fixture(t);
  const saved = await shares.add(url("page-0"), undefined, { scope: "menu" });
  state.broken = "page-2";
  const kept = await shares.refresh(saved.id);
  assert.equal(kept.source.status, "error");
  assert.deepEqual(kept.pages, saved.pages);
});

test("Buildin rejects an oversized public tree instead of saving a partial menu", async (t) => {
  const { shares } = fixture(t, 501);
  await assert.rejects(
    shares.add(url("page-0"), undefined, { scope: "menu" }),
    /500 страниц/,
  );
});
