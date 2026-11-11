import type { Store } from "../store.ts";
import type { Material } from "../../shared/types.ts";
import type { SearchQuery, SearchResponse } from "../../shared/search.ts";
import {
  chunkMaterial,
  fingerprint,
  queryTerms,
  normalizeSearch,
  resultFor,
  type SearchChunk,
} from "./chunks.ts";

export class SearchIndex {
  store: Store;
  private invalidated = true;
  private needsSync = true;
  private dataVersion: unknown;
  private snapshot: Material[] = [];
  private hashes = new WeakMap<Material, string>();
  private unsubscribe: () => void;
  constructor(store: Store) {
    this.store = store;
    this.unsubscribe = store.subscribe(() => {
      this.invalidated = true;
    });
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS search_chunks (id TEXT PRIMARY KEY, material_id TEXT NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL, vector TEXT, model TEXT);
      CREATE INDEX IF NOT EXISTS search_material ON search_chunks(material_id);
      CREATE TABLE IF NOT EXISTS search_state (material_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(chunk_id UNINDEXED, material_id UNINDEXED, title, context, body, tokenize='unicode61 remove_diacritics 2');`);
    if (
      !store.db
        .prepare("PRAGMA table_info(search_chunks)")
        .all()
        .some((c) => c.name === "embedding_after")
    )
      store.db.exec(
        "ALTER TABLE search_chunks ADD COLUMN embedding_after INTEGER NOT NULL DEFAULT 0",
      );
  }
  close() {
    this.unsubscribe();
  }
  private materials() {
    const version = this.store.db.prepare("PRAGMA data_version").get()!
      .data_version;
    if (this.invalidated || version !== this.dataVersion) {
      this.snapshot = this.store.listMaterials();
      this.dataVersion = version;
      this.invalidated = false;
      this.needsSync = true;
    }
    return this.snapshot;
  }
  hash(m: Material) {
    let hash = this.hashes.get(m);
    if (!hash) {
      hash = fingerprint(m);
      this.hashes.set(m, hash);
    }
    return hash;
  }
  async sync() {
    const materials = this.materials();
    if (!this.needsSync) return;
    const ids = new Set(materials.map((m) => m.id));
    for (const row of this.store.db
      .prepare("SELECT material_id FROM search_state")
      .all())
      if (!ids.has(row.material_id as string))
        this.remove(row.material_id as string);
    for (const m of materials) this.syncMaterial(m);
    this.needsSync = false;
  }
  remove(id: string) {
    this.store.db.prepare("DELETE FROM search_fts WHERE material_id=?").run(id);
    this.store.db
      .prepare("DELETE FROM search_chunks WHERE material_id=?")
      .run(id);
    this.store.db
      .prepare("DELETE FROM search_state WHERE material_id=?")
      .run(id);
  }
  syncMaterial(m: Material) {
    const hash = this.hash(m);
    if (
      this.store.db
        .prepare("SELECT fingerprint FROM search_state WHERE material_id=?")
        .get(m.id)?.fingerprint === hash
    )
      return;
    this.store.db.exec("SAVEPOINT search_sync");
    try {
      this.remove(m.id);
      const insert = this.store.db.prepare(
        "INSERT INTO search_chunks (id,material_id,fingerprint,data) VALUES (?,?,?,?)",
      );
      const fts = this.store.db.prepare(
        "INSERT INTO search_fts VALUES (?,?,?,?,?)",
      );
      for (const chunk of chunkMaterial(m)) {
        insert.run(chunk.id, m.id, hash, JSON.stringify(chunk));
        fts.run(
          chunk.id,
          m.id,
          normalizeSearch(m.title),
          normalizeSearch(chunk.context),
          normalizeSearch(chunk.text),
        );
      }
      this.store.db
        .prepare("INSERT INTO search_state VALUES (?,?)")
        .run(m.id, hash);
      this.store.db.exec("RELEASE search_sync");
    } catch (e) {
      this.store.db.exec("ROLLBACK TO search_sync; RELEASE search_sync");
      throw e;
    }
  }
  allowed(options: SearchQuery, editor: boolean) {
    let materials = this.materials().filter(
      (m) =>
        (editor || m.visible) &&
        m.state === "ready" &&
        m.source.status !== "removed",
    );
    if (options.kind)
      materials = materials.filter((m) => m.kind === options.kind);
    if (options.material)
      materials = materials.filter(
        (m) => m.id === options.material || m.slug === options.material,
      );
    if (options.collection) {
      try {
        const collection = this.store.resolveCollection(options.collection);
        materials = materials.filter(
          (m) =>
            (editor || collection.visible) &&
            collection.materialIds.includes(m.id),
        );
      } catch {
        materials = [];
      }
    }
    return new Map(materials.map((m) => [m.id, m]));
  }
  candidates(options: SearchQuery, editor: boolean) {
    const terms = queryTerms(options.query);
    if (!terms.length) return [];
    const allowed = this.allowed(options, editor);
    const hashes = new Map([...allowed].map(([id, m]) => [id, this.hash(m)]));
    const query = terms.map((t) => `"${t}"*`).join(" OR ");
    // Apply visibility and scope before pagination/counts. FTS syntax is built only from Unicode words.
    const rows = this.store.db
      .prepare(
        "SELECT c.data FROM search_fts f JOIN search_chunks c ON c.id=f.chunk_id WHERE search_fts MATCH ? ORDER BY bm25(search_fts,0,0,8,3,1)",
      )
      .all(query);
    return rows.flatMap((row) => {
      const chunk = JSON.parse(row.data as string) as SearchChunk;
      const m = allowed.get(chunk.materialId);
      return m && hashes.get(m.id) === chunk.fingerprint ? [chunk] : [];
    });
  }
  response(
    chunks: SearchChunk[],
    options: SearchQuery,
    editor: boolean,
    mode: SearchResponse["mode"] = "lexical",
  ): SearchResponse {
    const allowed = this.allowed(options, editor);
    const hashes = new Map([...allowed].map(([id, m]) => [id, this.hash(m)]));
    const seen = new Set<string>();
    const bodyMaterials = new Set(
      chunks.filter((c) => !c.metadata).map((c) => c.materialId),
    );
    const current = chunks.filter((c) => {
      const m = allowed.get(c.materialId);
      const identity = `${c.materialId}:${c.location.publicationPage || ""}:${c.location.paragraph ?? "meta"}`;
      if (
        !m ||
        hashes.get(m.id) !== c.fingerprint ||
        seen.has(identity) ||
        (c.metadata && bodyMaterials.has(c.materialId))
      )
        return false;
      seen.add(identity);
      return true;
    });
    const offset = Math.max(0, Math.floor(options.offset || 0));
    const limit = Math.max(1, Math.min(50, Math.floor(options.limit || 20)));
    return {
      query: options.query,
      results: current
        .slice(offset, offset + limit)
        .map((c) => resultFor(c, allowed.get(c.materialId)!, options.query)),
      total: current.length,
      mode,
      indexing: false,
    };
  }
  searchLocal(options: SearchQuery, editor: boolean) {
    return this.response(this.candidates(options, editor), options, editor);
  }
  chunk(id: string) {
    const row = this.store.db
      .prepare("SELECT data FROM search_chunks WHERE id=?")
      .get(id);
    return row ? (JSON.parse(row.data as string) as SearchChunk) : undefined;
  }
}
