// Explicit opt-in smoke: own local models, temporary library, no TH or production data.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { Store } from "../server/store.ts";
import { SearchService } from "../server/search/service.ts";
import { LocalModels } from "../server/search/models.ts";
const dir = mkdtempSync(join(tmpdir(), "dreambusta-local-model-smoke-"));
const store = new Store(dir);
const models = new LocalModels();
let generated;
const generate = models.generate.bind(models);
models.generate = async (query, sources, signal) => {
  const value = await generate(query, sources, signal);
  generated = { query, sources, value };
  return value;
};
const search = new SearchService(store, { dataDir: dir, models });
try {
  const doc = store.createMaterial({
    title: "Регламент согласования",
    kind: "document",
    source: { type: "file" },
    paragraphs: [
      "Для согласования договора сотрудник отправляет заявку руководителю отдела. Руководитель отдела проверяет условия и утверждает договор в течение трёх рабочих дней.",
      "После утверждения секретарь регистрирует договор в журнале и передаёт в бухгалтерию.",
    ],
  });
  store.createMaterial({
    title: "Кулинарная книга",
    kind: "book",
    source: { type: "file" },
    paragraphs: [
      "Для выпечки хлеба смешайте муку, дрожжи и тёплую воду. Дайте тесту подняться.",
    ],
  });
  await search.idle();
  const pending = store.db
    .prepare("SELECT COUNT(*) n FROM search_chunks WHERE vector IS NULL")
    .get().n;
  assert.equal(
    pending,
    0,
    "all chunks must be embedded by the real local model",
  );
  const result = await search.search(
    { query: "Кто одобряет контракт и как долго это занимает?" },
    false,
  );
  assert.equal(result.mode, "hybrid");
  assert.equal(result.results[0].materialId, doc.id);
  const response = await search.answer(
    { query: "Кто утверждает договор и в какой срок?" },
    () => false,
  );
  assert.equal(
    response.status,
    "answered",
    JSON.stringify({ response, generated }),
  );
  assert.match(response.answer, /руководител/i);
  assert.match(response.answer, /тр[её]х|3/i);
  assert.ok(response.sources.length);
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        mode: result.mode,
        first: result.results[0].title,
        answer: response.answer,
        sources: response.sources.map((s) => s.title),
      },
      null,
      2,
    ),
  );
} finally {
  await search.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
