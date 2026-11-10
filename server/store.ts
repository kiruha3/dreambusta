import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Material, Collection } from "../shared/types.ts";

const alphabet: Record<string, string> = Object.fromEntries(
  "а:a б:b в:v г:g д:d е:e ё:yo ж:zh з:z и:i й:y к:k л:l м:m н:n о:o п:p р:r с:s т:t у:u ф:f х:kh ц:ts ч:ch ш:sh щ:shch ъ: ы:y ь: э:e ю:yu я:ya"
    .split(" ")
    .map((x) => x.split(":")),
);
export function slugify(value: string) {
  return (
    [...value.toLowerCase()]
      .map((c) => alphabet[c] ?? c)
      .join("")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100)
      .replace(/-$/, "") || "material"
  );
}
export class Store {
  db: DatabaseSync;
  private closed = false;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(join(dir, "library.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS addresses (namespace TEXT, slug TEXT, id TEXT NOT NULL, PRIMARY KEY(namespace,slug));
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT, csrf TEXT, expires INTEGER);`);
  }
  close() {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
  private reserve(ns: string, proposed: string, id: string, explicit = false) {
    const base = slugify(proposed);
    let slug = base;
    let i = 1;
    for (;;) {
      const found = this.db
        .prepare("SELECT id FROM addresses WHERE namespace=? AND slug=?")
        .get(ns, slug);
      if (!found || found.id === id) break;
      if (explicit)
        throw new Error(
          "Этот адрес уже занят или сохранён за другим материалом",
        );
      slug = `${base}-${++i}`;
    }
    this.db
      .prepare("INSERT OR IGNORE INTO addresses VALUES (?,?,?)")
      .run(ns, slug, id);
    return slug;
  }
  createMaterial(
    input: Pick<Material, "title" | "kind" | "source"> & Partial<Material>,
  ): Material {
    return this.transaction(() => {
      const id = randomUUID();
      const now = new Date().toISOString();
      const m: Material = {
        author: "",
        description: "",
        visible: true,
        downloadable: true,
        tags: [],
        representations: [],
        paragraphs: [],
        html: "",
        files: {},
        warnings: [],
        textVersion: 1,
        state: "ready",
        wordCount: 0,
        ...input,
        id,
        slug: this.reserve("material", input.slug || input.title, id),
        createdAt: now,
        updatedAt: now,
      };
      this.db
        .prepare("INSERT INTO materials VALUES (?,?)")
        .run(id, JSON.stringify(m));
      return m;
    });
  }
  resolveMaterial(ref: string): Material {
    const row = this.db
      .prepare(
        "SELECT data FROM materials WHERE id=? OR id=(SELECT id FROM addresses WHERE namespace='material' AND slug=?)",
      )
      .get(ref, ref);
    if (!row) throw new Error("Материал не найден");
    return JSON.parse(row.data as string);
  }
  listMaterials(): Material[] {
    return this.db
      .prepare("SELECT data FROM materials ORDER BY rowid DESC")
      .all()
      .map((r) => JSON.parse(r.data as string));
  }
  updateMaterial(id: string, patch: Partial<Material>): Material {
    return this.transaction(() => {
      const old = this.resolveMaterial(id);
      const m = {
        ...old,
        ...patch,
        id: old.id,
        createdAt: old.createdAt,
        updatedAt: new Date().toISOString(),
        slug: patch.slug
          ? this.reserve("material", patch.slug, old.id, true)
          : old.slug,
      };
      this.db
        .prepare("UPDATE materials SET data=? WHERE id=?")
        .run(JSON.stringify(m), m.id);
      return m;
    });
  }
  deleteMaterial(id: string) {
    this.transaction(() => {
      const m = this.resolveMaterial(id);
      this.db.prepare("DELETE FROM materials WHERE id=?").run(m.id);
      for (const c of this.listCollections()) {
        if (c.materialIds.includes(m.id))
          this.db
            .prepare("UPDATE collections SET data=? WHERE id=?")
            .run(
              JSON.stringify({
                ...c,
                materialIds: c.materialIds.filter((x) => x !== m.id),
              }),
              c.id,
            );
      }
    }); // addresses intentionally remain reserved
  }
  listCollections(): Collection[] {
    return this.db
      .prepare("SELECT data FROM collections ORDER BY rowid DESC")
      .all()
      .map((r) => JSON.parse(r.data as string));
  }
  resolveCollection(ref: string): Collection {
    const row = this.db
      .prepare(
        "SELECT data FROM collections WHERE id=? OR id=(SELECT id FROM addresses WHERE namespace='collection' AND slug=?)",
      )
      .get(ref, ref);
    if (!row) throw new Error("Подборка не найдена");
    return JSON.parse(row.data as string);
  }
  saveCollection(
    input: Partial<Collection> & Pick<Collection, "title" | "materialIds">,
  ): Collection {
    return this.transaction(() => {
      const old = input.id ? this.resolveCollection(input.id) : null;
      const id = old?.id || randomUUID();
      const ids = [...new Set(input.materialIds)];
      ids.forEach((x) => this.resolveMaterial(x));
      const c: Collection = {
        description: "",
        visible: true,
        ...old,
        ...input,
        id,
        slug: this.reserve(
          "collection",
          input.slug || old?.slug || input.title,
          id,
          !!input.slug,
        ),
        materialIds: ids,
      };
      this.db
        .prepare("INSERT OR REPLACE INTO collections VALUES (?,?)")
        .run(id, JSON.stringify(c));
      return c;
    });
  }
  deleteCollection(id: string) {
    this.db.prepare("DELETE FROM collections WHERE id=?").run(id);
  }
  setting(key: string, fallback = ""): string {
    return (
      (this.db.prepare("SELECT value FROM settings WHERE key=?").get(key)
        ?.value as string) ?? fallback
    );
  }
  setSetting(key: string, value: string) {
    this.db
      .prepare("INSERT OR REPLACE INTO settings VALUES (?,?)")
      .run(key, value);
  }
}
