import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";

test("local model adapter validates embeddings and asks for structured grounded answers", async (t) => {
  const { LocalModels } = await import("../server/search/models.ts");
  const requests: any[] = [];
  let invalid = false;
  const server = createServer(async (req, res) => {
    const parts = [];
    for await (const c of req) parts.push(c);
    const body = JSON.parse(Buffer.concat(parts).toString());
    requests.push({ url: req.url, body });
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(
        req.url === "/api/embed"
          ? { embeddings: invalid ? [[0, 0]] : body.input.map(() => [1, 2, 3]) }
          : {
              message: {
                content: JSON.stringify({
                  sentences: [
                    { text: "Договор согласует руководитель.", sources: [1] },
                  ],
                }),
              },
            },
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const models = new LocalModels({
    url,
    embeddingModel: "embed",
    answerModel: "answer",
  });
  assert.deepEqual(await models.embed(["Текст"]), [[1, 2, 3]]);
  invalid = true;
  await assert.rejects(models.embed(["Текст"]), /вектор/i);
  const answer = await models.generate("Кто согласует?", [
    {
      number: 1,
      title: "Договор",
      context: "Абзац 1",
      text: "Договор согласует руководитель.",
    },
  ]);
  assert.equal(answer.sentences[0].sources[0], 1);
  assert.ok(requests.at(-1).body.format.properties.sentences);
  assert.equal(requests.at(-1).body.stream, false);
  assert.throws(
    () => new LocalModels({ url: "https://example.com" }),
    /локаль/i,
  );
});

async function setup(t: test.TestContext, models: any) {
  const { SearchService } = await import("../server/search/service.ts");
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-rag-"));
  const store = new Store(dir);
  const service = new SearchService(store, { models, dataDir: dir });
  t.after(async () => {
    await service.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { store, service };
}
const models = () => ({
  enabled: true,
  embeddingModel: "test-embed",
  embed: async (texts: string[]) =>
    texts.map((s) =>
      s.includes("руководитель") || s.includes("согласует") ? [1, 0] : [0, 1],
    ),
  generate: async () => ({
    sentences: [{ text: "Согласует руководитель.", sources: [1] }],
  }),
});

test("a rejected embedding input does not starve healthy chunks behind its batch", async (t) => {
  const client = models();
  client.embed = async (texts: string[]) => {
    if (texts.some((s) => s.includes("Повреждённыйфрагмент")))
      throw Object.assign(new Error("input too long"), { status: 400 });
    return texts.map(() => [1, 0]);
  };
  const { store, service } = await setup(t, client);
  store.createMaterial({
    title: "Проверка очереди",
    kind: "book",
    source: { type: "file" },
    paragraphs: [
      "Повреждённыйфрагмент",
      ...Array.from({ length: 12 }, (_, i) =>
        `Здоровыйфрагмент номер ${i} `.repeat(45),
      ),
    ],
  });
  await service.idle();
  const healthy = store.db
    .prepare("SELECT COUNT(*) n FROM search_chunks WHERE vector IS NOT NULL")
    .get()!.n;
  assert.ok(
    Number(healthy) >= 12,
    "healthy inputs after the bad first batch must still be embedded",
  );
});

test("own semantic vectors find paraphrases and survive restart; lexical search survives runtime failure", async (t) => {
  const client = models();
  const { store, service } = await setup(t, client);
  const doc = store.createMaterial({
    title: "Порядок",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["руководитель утверждает договор"],
  });
  await service.idle();
  const found = await service.search(
    { query: "Кто согласует документ?" },
    false,
  );
  assert.equal(found.mode, "hybrid");
  assert.ok(found.results.some((r) => r.materialId === doc.id));
  assert.ok(
    store.db
      .prepare("SELECT vector FROM search_chunks WHERE vector IS NOT NULL")
      .all().length,
  );
  client.embed = async () => {
    throw new Error("offline");
  };
  const fallback = await service.search({ query: "руководитель" }, false);
  assert.equal(fallback.mode, "lexical");
  assert.equal(fallback.results[0].materialId, doc.id);
});

test("answers validate citations, do not send hidden text and invalidate sources changed during generation", async (t) => {
  const client = models();
  let sourceTexts = "";
  let mutate = () => {};
  let bad = false;
  client.generate = async (_q: string, sources: any[]) => {
    sourceTexts = JSON.stringify(sources);
    mutate();
    return {
      sentences: [{ text: "Согласует руководитель.", sources: [bad ? 99 : 1] }],
    };
  };
  const { store, service } = await setup(t, client);
  const doc = store.createMaterial({
    title: "Порядок",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор согласует руководитель."],
  });
  store.createMaterial({
    title: "Тайна",
    kind: "document",
    visible: false,
    source: { type: "file" },
    paragraphs: ["СЕКРЕТНЫЕ ДАННЫЕ: договор согласует директор"],
  });
  await service.idle();
  const response = await service.answer(
    { query: "Кто согласует договор?" },
    () => false,
  );
  assert.equal(response.status, "answered");
  assert.match(response.answer, /\[1\]/);
  assert.ok(!sourceTexts.includes("СЕКРЕТНЫЕ"));
  assert.equal(response.sources[0].materialId, doc.id);
  bad = true;
  assert.equal(
    (await service.answer({ query: "договор" }, () => false)).status,
    "unavailable",
  );
  bad = false;
  mutate = () => {
    store.updateMaterial(doc.id, { visible: false });
  };
  const stale = await service.answer({ query: "договор" }, () => false);
  assert.equal(stale.status, "changed");
  assert.equal(stale.sources.length, 0);
  assert.equal(stale.answer, "");
});

test("an in-flight embedding cannot write stale content after replacement or deletion", async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const start = new Promise<void>((r) => (started = r));
  const client = models();
  let first = true;
  client.embed = async (texts: string[]) => {
    if (first) {
      first = false;
      started();
      await gate;
    }
    return texts.map(() => [1, 0]);
  };
  const { store, service } = await setup(t, client);
  const doc = store.createMaterial({
    title: "Документ",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Прежнийфрагмент"],
  });
  await start;
  store.updateMaterial(doc.id, {
    paragraphs: ["Новыйфрагмент"],
    textVersion: 2,
  });
  release();
  await service.idle();
  assert.equal(
    (await service.search({ query: "Прежнийфрагмент" }, false)).results.some(
      (r) => r.snippet.includes("Прежнийфрагмент"),
    ),
    false,
  );
  store.deleteMaterial(doc.id);
  await service.idle();
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM search_chunks").get()!.n,
    0,
  );
});

test("persistent vectors are reused after closing and reopening the library", async (t) => {
  const { SearchService } = await import("../server/search/service.ts");
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-search-restart-"));
  let store = new Store(dir);
  let service = new SearchService(store, { models: models() });
  t.after(async () => {
    await service.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  store.createMaterial({
    title: "Порядок",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Руководитель утверждает договор."],
  });
  await service.idle();
  const count = store.db
    .prepare("SELECT COUNT(*) n FROM search_chunks WHERE vector IS NOT NULL")
    .get()!.n;
  await service.close();
  store.close();
  store = new Store(dir);
  const client = models();
  let calls = 0;
  client.embed = async (texts: string[]) => {
    calls++;
    return texts.map(() => [1, 0]);
  };
  service = new SearchService(store, { models: client });
  await service.idle();
  assert.equal(calls, 0, "stored document vectors must not be recomputed");
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) n FROM search_chunks WHERE vector IS NOT NULL")
      .get()!.n,
    count,
  );
});

test("large vector indexes use compact binary storage and still retrieve by meaning", async (t) => {
  const client = models();
  client.embed = async (texts: string[]) =>
    texts.map(() =>
      Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0.123456789)),
    );
  const { store, service } = await setup(t, client);
  const doc = store.createMaterial({
    title: "Справочник",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Ответственный руководитель проверяет заявки."],
  });
  await service.idle();
  const row = store.db
    .prepare(
      "SELECT typeof(vector) type,length(vector) bytes FROM search_chunks LIMIT 1",
    )
    .get()!;
  assert.equal(row.type, "blob");
  assert.equal(row.bytes, 768 * 4);
  const found = await service.search({ query: "Кто согласует запрос?" }, false);
  assert.equal(found.mode, "hybrid");
  assert.equal(found.results[0].materialId, doc.id);
});

test("an unanswered question retains readable related sources and discards them after access changes", async (t) => {
  const client = models();
  let hide = () => {};
  client.generate = async () => {
    hide();
    return { sentences: [] };
  };
  const { store, service } = await setup(t, client);
  const doc = store.createMaterial({
    title: "Инструкция",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Согласует задачу назначенный участник проекта."],
  });
  store.createMaterial({
    title: "Скрытый",
    kind: "document",
    visible: false,
    source: { type: "file" },
    paragraphs: ["Согласование выполняет секретный участник."],
  });
  await service.idle();
  const answer = await service.answer(
    { query: "Кто согласует договор?" },
    () => false,
  );
  assert.equal(answer.status, "no-sources");
  assert.equal(answer.answer, "");
  assert.deepEqual(
    answer.sources.map((s) => s.materialId),
    [doc.id],
  );
  hide = () => {
    store.updateMaterial(doc.id, { visible: false });
  };
  const changed = await service.answer(
    { query: "Кто согласует договор?" },
    () => false,
  );
  assert.equal(changed.status, "changed");
  assert.equal(changed.sources.length, 0);
});
