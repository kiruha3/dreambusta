import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";

async function fixture(t: test.TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-search-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const { SearchIndex } = await import("../server/search/index.ts");
  const index = new SearchIndex(store);
  t.after(() => index.close());
  return { store, index, dir };
}

test("search finds Russian body text, safely handles punctuation and filters hidden sources before counts", async (t) => {
  const { store, index } = await fixture(t);
  const publicDoc = store.createMaterial({
    title: "Инструкция",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Согласование договора выполняется руководителем."],
  });
  store.createMaterial({
    title: "Секрет",
    kind: "document",
    source: { type: "file" },
    visible: false,
    paragraphs: ["Согласование секретного договора"],
  });
  await index.sync();
  const found = index.searchLocal({ query: "СОГЛАСОВАНИЕ" }, false);
  assert.equal(found.total, 1);
  assert.equal(found.results[0].materialId, publicDoc.id);
  assert.match(found.results[0].snippet, /руководителем/);
  assert.equal(index.searchLocal({ query: "согласование" }, true).total, 2);
  for (const query of ['" OR *', "***", "<script>", "   "])
    assert.doesNotThrow(() => index.searchLocal({ query }, false));
  assert.equal(index.searchLocal({ query: "***" }, false).total, 0);
});

test("index includes descendant pages, chapter and PDF/slide locations with versioned internal links", async (t) => {
  const { store, index } = await fixture(t);
  const material = store.createMaterial({
    title: "Руководство",
    kind: "document",
    source: { type: "share" },
    paragraphs: ["Корень"],
    pages: [
      {
        sourceUrl: "https://example.test/a",
        slug: "dogovory",
        title: "Договоры",
        html: "",
        paragraphs: ["Особое согласование на дочерней странице"],
        wordCount: 5,
      },
    ],
  });
  const pdf = store.createMaterial({
    title: "Файл",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Неповторимый PDF фрагмент"],
    representations: ["pdf"],
    paragraphLocations: [{ page: 7 }],
  });
  const slide = store.createMaterial({
    title: "Презентация",
    kind: "presentation",
    source: { type: "file" },
    paragraphs: ["Слайд 3", "Редкий слайдовый фрагмент"],
    representations: ["slides"],
    paragraphLocations: [{ slide: 3 }, { slide: 3 }],
  });
  const book = store.createMaterial({
    title: "Книга",
    kind: "book",
    source: { type: "file" },
    paragraphs: ["Введение", "Глава первая", "Завершающий книжный фрагмент"],
    chapters: [{ title: "Глава первая", paragraph: 1 }],
    representations: ["text"],
  });
  await index.sync();
  const pageHit = index.searchLocal({ query: "Особое" }, false).results[0];
  assert.equal(pageHit.materialId, material.id);
  assert.match(pageHit.url, /page=dogovory/);
  assert.match(pageHit.url, /paragraph=0/);
  assert.equal(
    index.searchLocal({ query: "Неповторимый" }, false).results[0].location
      .page,
    7,
  );
  assert.equal(
    index.searchLocal({ query: "слайдовый" }, false).results[0].location.slide,
    3,
  );
  const bookHit = index.searchLocal({ query: "Завершающий" }, false).results[0];
  assert.equal(bookHit.location.paragraph, 2);
  assert.match(bookHit.context, /Глава первая/);
  assert.match(bookHit.url, /version=1/);
  assert.equal(bookHit.materialId, book.id);
  assert.equal(slide.paragraphLocations?.[1].slide, 3);
  assert.equal(pdf.paragraphLocations?.[0].page, 7);
});

test("index updates and removes stale content, respects collection scopes and survives reopening", async (t) => {
  const { store, index } = await fixture(t);
  const a = store.createMaterial({
    title: "Книга А",
    kind: "book",
    source: { type: "file" },
    paragraphs: ["Микросервисная архитектура"],
  });
  const b = store.createMaterial({
    title: "Документ Б",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Микросервисная архитектура"],
  });
  const c = store.saveCollection({ title: "Подборка", materialIds: [a.id] });
  const hidden = store.saveCollection({
    title: "Скрытая подборка",
    materialIds: [b.id],
    visible: false,
  });
  await index.sync();
  assert.equal(
    index.searchLocal({ query: "Микросервисная", collection: c.slug }, false)
      .total,
    1,
  );
  assert.equal(
    index.searchLocal({ query: "Микросервисная", kind: "book" }, false)
      .results[0].materialId,
    a.id,
  );
  assert.equal(
    index.searchLocal(
      { query: "Микросервисная", collection: hidden.slug },
      false,
    ).total,
    0,
  );
  assert.equal(
    index.searchLocal({ query: "Микросервисная", material: b.slug }, false)
      .results[0].materialId,
    b.id,
  );
  store.updateMaterial(a.id, {
    paragraphs: ["Сервисная платформа"],
    textVersion: 2,
  });
  store.deleteMaterial(b.id);
  await index.sync();
  assert.equal(index.searchLocal({ query: "Микросервисная" }, true).total, 0);
  assert.equal(index.searchLocal({ query: "Сервисная" }, false).total, 1);
  assert.equal(
    index.searchLocal({ query: "Сервисная", offset: 100 }, false).results
      .length,
    0,
  );
});

test("long paragraphs are bounded chunks and metadata-only media remain searchable without invented text", async (t) => {
  const { store, index } = await fixture(t);
  store.createMaterial({
    title: "Видеоурок",
    description: "Настройка маршрутов",
    kind: "video",
    source: { type: "link" },
  });
  store.createMaterial({
    title: "Длинная книга",
    kind: "book",
    source: { type: "file" },
    paragraphs: ["Начало. " + "длинный текст ".repeat(500) + "Уникальныйхвост"],
  });
  await index.sync();
  const hit = index.searchLocal({ query: "Уникальныйхвост" }, false).results[0];
  assert.ok(hit.snippet.length <= 420);
  assert.equal(hit.location.paragraph, 0);
  const video = index.searchLocal({ query: "маршрут" }, false).results[0];
  assert.equal(video.kind, "video");
  assert.equal(video.location.mode, "metadata");
});

test("PDF and PowerPoint processing retains exact page/slide locations", async () => {
  const { processFile } = await import("../server/processing.ts");
  const { makePdf, makePptx } = await import("./fixtures/documents.mjs");
  const pdf = await processFile(
    new File([makePdf("Searchable content", 3)], "example.pdf"),
  );
  assert.deepEqual(pdf.paragraphLocations, [
    { page: 1 },
    { page: 2 },
    { page: 3 },
  ]);
  const slides = await processFile(
    new File([await makePptx()], "example.pptx"),
  );
  assert.equal(slides.paragraphLocations?.length, slides.paragraphs?.length);
  assert.ok(slides.paragraphLocations?.every((l) => Number.isInteger(l.slide)));
});

test("common query words do not bring unrelated paragraphs into grounded context", async (t) => {
  const { store, index } = await fixture(t);
  store.createMaterial({
    title: "Регламент",
    kind: "document",
    source: { type: "file" },
    paragraphs: [
      "Руководитель утверждает договор в течение трёх рабочих дней.",
    ],
  });
  store.createMaterial({
    title: "Кулинария",
    kind: "book",
    source: { type: "file" },
    paragraphs: ["Смешайте муку и тёплую воду."],
  });
  await index.sync();
  const result = index.searchLocal(
    { query: "Кто утверждает договор и в какой срок?" },
    false,
  );
  assert.equal(result.total, 1);
});

test("a slide title that resembles a page marker cannot change its real source position", async () => {
  const JSZip = (await import("jszip")).default;
  const { makePptx } = await import("./fixtures/documents.mjs");
  const { processFile } = await import("../server/processing.ts");
  const zip = await JSZip.loadAsync(await makePptx());
  const xml = await zip.file("ppt/slides/slide2.xml")!.async("string");
  zip.file("ppt/slides/slide2.xml", xml.replaceAll("Первый слайд", "Слайд 99"));
  const processed = await processFile(
    new File([await zip.generateAsync({ type: "uint8array" })], "title.pptx"),
  );
  const title = processed.paragraphs!.indexOf("Слайд 99");
  assert.ok(title >= 0);
  assert.equal(processed.paragraphLocations![title].slide, 1);
});

test("short paragraphs form compact bounded blocks without losing the exact matching paragraph", async (t) => {
  const { store, index } = await fixture(t);
  const paragraphs = Array.from({ length: 1000 }, (_, i) =>
    i === 713
      ? "Искомыйкомпактныйфрагмент находится здесь."
      : `Короткая строка ${i} обычного текста.`,
  );
  store.createMaterial({
    title: "Большая книга",
    kind: "book",
    source: { type: "file" },
    paragraphs,
  });
  await index.sync();
  const count = Number(
    store.db.prepare("SELECT COUNT(*) n FROM search_chunks").get()!.n,
  );
  assert.ok(count < 50, `expected compact blocks, got ${count}`);
  const found = index.searchLocal({ query: "Искомыйкомпактныйфрагмент" }, false)
    .results[0];
  assert.equal(found.location.paragraph, 713);
  assert.match(found.url, /paragraph=713/);
});

test("index reuses unchanged snapshots but notices local and external edits before returning sources", async (t) => {
  const { store, index, dir } = await fixture(t);
  const material = store.createMaterial({
    title: "Свежесть",
    kind: "book",
    source: { type: "file" },
    paragraphs: ["Прежнийфрагмент"],
  });
  let reads = 0;
  const list = store.listMaterials.bind(store);
  store.listMaterials = () => {
    reads++;
    return list();
  };
  await index.sync();
  const initial = reads;
  for (let i = 0; i < 4; i++) {
    await index.sync();
    index.searchLocal({ query: "Прежнийфрагмент" }, false);
  }
  assert.equal(
    reads,
    initial,
    "unchanged library must not be reparsed per query or embedding batch",
  );
  store.updateMaterial(material.id, {
    paragraphs: ["Новыйфрагмент"],
    textVersion: 2,
  });
  assert.equal(index.searchLocal({ query: "Прежнийфрагмент" }, false).total, 0);
  await index.sync();
  assert.equal(index.searchLocal({ query: "Новыйфрагмент" }, false).total, 1);
  const external = new Store(dir);
  try {
    external.updateMaterial(material.id, { visible: false });
  } finally {
    external.close();
  }
  assert.equal(index.searchLocal({ query: "Новыйфрагмент" }, false).total, 0);
});
