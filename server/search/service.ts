import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { Store } from "../store.ts";
import type {
  SearchQuery,
  SearchAnswer,
  SearchResponse,
  AnswerSource,
} from "../../shared/search.ts";
import { SearchIndex } from "./index.ts";
import { LocalModels, type Models, type ModelSource } from "./models.ts";
import { queryTerms, type SearchChunk } from "./chunks.ts";
import { importPdf } from "../../lib/formats/pdf.ts";

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== b.length) return -1;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : -1;
}
function packVector(vector: number[]) {
  const bytes = Buffer.allocUnsafe(vector.length * 4);
  vector.forEach((value, i) => bytes.writeFloatLE(value, i * 4));
  return bytes;
}
function unpackVector(value: unknown): ArrayLike<number> {
  // Read old JSON vectors as well so an upgrade never requires re-embedding.
  if (typeof value === "string") return JSON.parse(value);
  const bytes = value as Uint8Array;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector = new Float32Array(bytes.byteLength / 4);
  for (let i = 0; i < vector.length; i++)
    vector[i] = view.getFloat32(i * 4, true);
  return vector;
}
// Own port of TH reciprocal rank fusion: scores are ranks, never probabilities.
export function fuse(lists: SearchChunk[][]) {
  const scores = new Map<string, { chunk: SearchChunk; score: number }>();
  for (const list of lists)
    list.forEach((chunk, i) => {
      const entry = scores.get(chunk.id) || { chunk, score: 0 };
      entry.score += 1 / (60 + i + 1);
      scores.set(chunk.id, entry);
    });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map((e) => e.chunk);
}
export class SearchService {
  index: SearchIndex;
  models: Models;
  store: Store;
  private stopped = false;
  private controller = new AbortController();
  private generation = 0;
  private worker?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private unsubscribe: () => void;
  private cooldown = 0;
  private queryCache = new Map<string, { at: number; vector: number[] }>();
  private ready: Promise<void>;
  private dataDir?: string;
  constructor(
    store: Store,
    options: { models?: Models; dataDir?: string } = {},
  ) {
    this.store = store;
    this.index = new SearchIndex(store);
    this.models = options.models || new LocalModels();
    this.dataDir = options.dataDir;
    this.unsubscribe = store.subscribe(() => this.schedule());
    this.ready = this.index.sync().then(() => this.backfill());
    void this.ready.then(() => this.schedule()).catch(() => this.schedule());
  }
  reconfigure(models: Models) {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
    this.models = models;
    this.queryCache.clear();
    this.cooldown = 0;
    // A worker may still be unwinding an aborted embedding request.
    void (this.worker || Promise.resolve()).finally(() => this.schedule());
  }
  private schedule(delay = 10) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.worker)
        this.worker = this.run()
          .catch(() => {
            if (!this.stopped) this.schedule(60000);
          })
          .finally(() => {
            this.worker = undefined;
          });
    }, delay);
    this.timer.unref();
  }
  private async backfill() {
    if (!this.dataDir) return;
    for (const m of this.store.listMaterials()) {
      if (this.stopped) return;
      if (
        !m.representations.includes("pdf") ||
        m.paragraphLocations?.length ||
        !m.paragraphs.length
      )
        continue;
      const file = m.files.pdf || m.files.original;
      if (!file) continue;
      const path = resolve(this.dataDir, file.path);
      if (!path.startsWith(resolve(this.dataDir) + sep)) continue;
      try {
        const document = await importPdf(
          new File([await readFile(path)], file.name),
          m.title,
        );
        const pairs = document.paragraphs.flatMap((p, i) =>
          p.trim()
            ? [{ text: p.trim(), location: document.paragraphLocations![i] }]
            : [],
        );
        if (
          !this.stopped &&
          pairs.length === m.paragraphs.length &&
          pairs.every((p, i) => p.text === m.paragraphs[i])
        )
          this.store.updateMaterial(
            m.id,
            { paragraphLocations: pairs.map((p) => p.location) },
            m.revision,
          );
      } catch {
        /* Original and current snapshot remain intact; text results still work. */
      }
    }
  }
  private async run() {
    const generation = this.generation;
    const models = this.models;
    const controller = this.controller;
    await this.ready;
    await this.index.sync();
    if (
      !models.enabled ||
      this.cooldown > Date.now() ||
      this.stopped ||
      generation !== this.generation
    )
      return;
    try {
      while (!this.stopped && generation === this.generation) {
        await this.index.sync();
        const rows = this.store.db
          .prepare(
            "SELECT id,fingerprint,data FROM search_chunks WHERE (vector IS NULL OR model IS NULL OR model<>?) AND embedding_after<=? LIMIT 8",
          )
          .all(models.embeddingModel, Date.now());
        if (!rows.length) {
          const retry = this.store.db
            .prepare(
              "SELECT MIN(embedding_after) AS at FROM search_chunks WHERE vector IS NULL OR model IS NULL OR model<>?",
            )
            .get(models.embeddingModel)?.at;
          if (typeof retry === "number" && retry > Date.now())
            this.schedule(Math.max(1000, retry - Date.now()));
          break;
        }
        const chunks = rows.map(
          (r) => JSON.parse(r.data as string) as SearchChunk,
        );
        const inputs = chunks.map(
          (c) =>
            `title: ${c.title} | text: ${c.context}\n${c.text.slice(0, 1200)}`,
        );
        let vectors: (number[] | null)[];
        try {
          vectors = await models.embed(inputs, controller.signal);
        } catch (error) {
          if (
            ![400, 413, 422].includes(
              Number((error as { status?: number }).status),
            )
          )
            throw error;
          vectors = [];
          for (let i = 0; i < inputs.length; i++) {
            try {
              vectors.push(
                (await models.embed([inputs[i]], controller.signal))[0],
              );
            } catch (singleError) {
              if (
                ![400, 413, 422].includes(
                  Number((singleError as { status?: number }).status),
                )
              )
                throw singleError;
              vectors.push(null);
            }
          }
        }
        if (this.stopped || generation !== this.generation) return;
        await this.index.sync();
        if (this.stopped || generation !== this.generation) return;
        const update = this.store.db.prepare(
          "UPDATE search_chunks SET vector=?,model=? WHERE id=? AND fingerprint=?",
        );
        this.store.db.exec("SAVEPOINT search_vectors");
        try {
          rows.forEach((row, i) => {
            if (!vectors[i]) {
              this.store.db
                .prepare(
                  "UPDATE search_chunks SET embedding_after=? WHERE id=? AND fingerprint=?",
                )
                .run(Date.now() + 300000, row.id, row.fingerprint);
              return;
            }
            update.run(
              packVector(vectors[i]),
              models.embeddingModel,
              row.id,
              row.fingerprint,
            );
          });
          this.store.db.exec("RELEASE search_vectors");
        } catch (error) {
          this.store.db.exec(
            "ROLLBACK TO search_vectors; RELEASE search_vectors",
          );
          throw error;
        }
      }
      this.cooldown = 0;
    } catch {
      if (!this.stopped && generation === this.generation) {
        this.cooldown = Date.now() + 60000;
        this.schedule(60000);
      }
    }
  }
  async idle() {
    await this.ready;
    clearTimeout(this.timer);
    if (this.worker) await this.worker;
    if (!this.stopped) {
      this.worker = this.run();
      try {
        await this.worker;
      } finally {
        this.worker = undefined;
      }
    }
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.unsubscribe();
    this.controller.abort();
    await this.ready.catch(() => {});
    await this.worker?.catch(() => {});
    this.index.close();
  }
  private isCurrent(
    chunks: SearchChunk[],
    options: SearchQuery,
    editor: boolean,
  ) {
    const allowed = this.index.allowed(options, editor);
    const hashes = new Map(
      [...allowed].map(([id, m]) => [id, this.index.hash(m)]),
    );
    return chunks.every((c) => hashes.get(c.materialId) === c.fingerprint);
  }
  async search(
    options: SearchQuery,
    editor: boolean,
    signal?: AbortSignal,
  ): Promise<SearchResponse> {
    const generation = this.generation;
    const models = this.models;
    const controller = this.controller;
    await this.ready;
    await this.index.sync();
    if (!queryTerms(options.query).length)
      return this.index.response([], options, editor);
    const lexical = this.index.candidates(options, editor);
    let combined = lexical;
    let mode: SearchResponse["mode"] = "lexical";
    const allowed = this.index.allowed(options, editor);
    const rows =
      models.enabled && generation === this.generation
        ? this.store.db
            .prepare(
              "SELECT id,material_id,vector FROM search_chunks WHERE vector IS NOT NULL AND model=?",
            )
            .all(models.embeddingModel)
            .filter((row) => allowed.has(row.material_id as string))
        : [];
    if (rows.length) {
      try {
        const key = options.query.trim();
        let cached = this.queryCache.get(key);
        if (!cached || cached.at < Date.now() - 300000) {
          const [vector] = await models.embed(
            [`task: search result | query: ${key}`],
            AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(8000),
              ...(signal ? [signal] : []),
            ]),
          );
          if (generation !== this.generation)
            throw new Error("Настройки моделей изменились");
          cached = { at: Date.now(), vector };
          if (this.queryCache.size >= 100)
            this.queryCache.delete(this.queryCache.keys().next().value!);
          this.queryCache.set(key, cached);
        }
        const ranked = rows
          .map((row) => ({
            id: row.id as string,
            score: cosine(cached!.vector, unpackVector(row.vector)),
          }))
          .sort((a, b) => b.score - a.score);
        const threshold = Math.max(0.35, (ranked[0]?.score || 0) - 0.14);
        const semantic = ranked
          .filter((r) => r.score >= threshold)
          .slice(0, 100)
          .flatMap((r) => {
            const chunk = this.index.chunk(r.id);
            return chunk ? [chunk] : [];
          });
        combined = fuse([lexical, semantic]);
        mode = "hybrid";
      } catch {
        /* Full-text results remain usable when the local model is offline. */
      }
    }
    if (this.stopped) throw new Error("Поиск остановлен");
    const response = this.index.response(combined, options, editor, mode);
    response.indexing =
      this.models.enabled &&
      !!this.store.db
        .prepare(
          "SELECT 1 FROM search_chunks WHERE vector IS NULL OR model IS NULL OR model<>? LIMIT 1",
        )
        .get(this.models.embeddingModel);
    if (mode === "lexical")
      response.message = this.models.enabled
        ? "Поиск по словам. Поиск по смыслу появится после подготовки локальной модели и индекса."
        : "Поиск по словам";
    return response;
  }
  async answer(
    options: SearchQuery,
    editor: () => boolean,
    signal?: AbortSignal,
  ): Promise<SearchAnswer> {
    const generation = this.generation;
    const models = this.models;
    const controller = this.controller;
    const found = await this.search(
      { ...options, offset: 0, limit: 30 },
      editor(),
      signal,
    );
    const chunks: SearchChunk[] = [];
    const sources: ModelSource[] = [];
    const results: AnswerSource[] = [];
    for (const result of found.results) {
      const chunk = this.index.chunk(result.id);
      if (!chunk || chunk.metadata) continue;
      chunks.push(chunk);
      results.push({ ...result, number: chunks.length });
      sources.push({
        number: chunks.length,
        title: result.title,
        context: result.context,
        text: chunk.text,
      });
      if (chunks.length >= 6) break;
    }
    const empty = (
      status: SearchAnswer["status"],
      message: string,
      related = false,
    ): SearchAnswer => {
      if (related && !this.isCurrent(chunks, options, editor()))
        return {
          status: "changed",
          answer: "",
          sources: [],
          message: "Источники изменились. Повторите вопрос.",
        };
      return { status, answer: "", sources: related ? results : [], message };
    };
    if (!chunks.length)
      return empty(
        "no-sources",
        "В доступных материалах не найдено текста для ответа.",
      );
    if (!this.isCurrent(chunks, options, editor()))
      return empty("changed", "Источники изменились. Повторите поиск.");
    try {
      if (generation !== this.generation || !models.enabled)
        throw new Error("Настройки моделей изменились");
      const generated = await models.generate(
        options.query,
        sources,
        AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]),
      );
      if (generation !== this.generation)
        throw new Error("Настройки моделей изменились");
      if (!this.isCurrent(chunks, options, editor()))
        return empty(
          "changed",
          "Источники изменились во время ответа. Повторите поиск.",
        );
      if (
        !generated ||
        !Array.isArray(generated.sentences) ||
        generated.sentences.length > 20
      )
        throw new Error("Invalid answer");
      if (!generated.sentences.length)
        return empty(
          "no-sources",
          "Не нашёл подтверждённого ответа. Уточните вопрос или выберите конкретный материал. Ниже — близкие по теме фрагменты.",
          true,
        );
      const used = new Set<number>();
      const lines = generated.sentences.map((s) => {
        if (
          typeof s.text !== "string" ||
          !s.text.trim() ||
          s.text.length > 2500 ||
          !Array.isArray(s.sources) ||
          !s.sources.length ||
          s.sources.some(
            (n) => !Number.isInteger(n) || n < 1 || n > sources.length,
          )
        )
          throw new Error("Invalid citations");
        s.sources.forEach((n) => used.add(n));
        return (
          s.text.trim().replace(/\[\d+\]/g, "") +
          " " +
          [...new Set(s.sources)].map((n) => `[${n}]`).join(" ")
        );
      });
      return {
        status: "answered",
        answer: lines.join("\n\n"),
        sources: results.filter((s) => used.has(s.number)),
      };
    } catch {
      return empty(
        "unavailable",
        "Локальная модель не смогла подготовить ответ. Найденные материалы доступны ниже — можно повторить запрос.",
        true,
      );
    }
  }
}
