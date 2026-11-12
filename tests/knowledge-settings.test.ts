import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";

test("editor controls ordered guest menu without exposing hidden or deleted materials; knowledge overrides are explicit", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-knowledge-"));
  const app = createApp({ dataDir: dir, searchModels: false });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(app.server.address() as any).port}/api`;
  t.after(async () => {
    await app.search.close();
    await new Promise<void>((r) => app.server.close(() => r()));
    app.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const call = (path: string, method = "GET", body?: unknown, headers = {}) =>
    fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const setup = await call("/setup", "POST", {
    email: "editor@example.test",
    password: "test-password-not-real",
  });
  const cookie = setup.headers.get("set-cookie")!.split(";")[0];
  const auth = { cookie, "x-csrf-token": (await setup.json()).csrf };
  const doc = app.store.createMaterial({
    title: "Руководство",
    kind: "document",
    source: { type: "file" },
    representations: ["article"],
    html: "<p>Статья</p>",
  });
  const book = app.store.createMaterial({
    title: "Книга",
    kind: "book",
    source: { type: "file" },
  });
  const hidden = app.store.createMaterial({
    title: "Скрыто",
    kind: "document",
    visible: false,
    source: { type: "file" },
  });
  assert.equal(
    (
      await call(
        "/settings",
        "PATCH",
        { sidebarMaterialIds: [book.id, hidden.id, doc.id] },
        auth,
      )
    ).status,
    200,
  );
  assert.deepEqual(
    (await (await call("/navigation")).json()).materials.map((m: any) => m.id),
    [book.id, doc.id],
  );
  assert.deepEqual(
    (
      await (await call("/navigation", "GET", undefined, auth)).json()
    ).materials.map((m: any) => m.id),
    [book.id, hidden.id, doc.id],
  );
  assert.deepEqual(
    (await (await call("/materials?section=knowledge")).json()).map(
      (m: any) => m.id,
    ),
    [doc.id],
  );
  assert.equal(
    (await call(`/materials/${book.id}`, "PATCH", { knowledge: true }, auth))
      .status,
    200,
  );
  assert.equal(
    (await call(`/materials/${doc.id}`, "PATCH", { knowledge: false }, auth))
      .status,
    200,
  );
  assert.deepEqual(
    (await (await call("/materials?section=knowledge")).json()).map(
      (m: any) => m.id,
    ),
    [book.id],
  );
  const invalid = await call(
    "/settings",
    "PATCH",
    { closed: true, sidebarMaterialIds: ["not-real"] },
    auth,
  );
  assert.equal(invalid.status, 400);
  assert.equal(
    (await call("/navigation")).status,
    200,
    "invalid settings must not close the library",
  );
  assert.equal(
    (await call("/settings", "PATCH", { sidebarMaterialIds: [] })).status,
    401,
  );
  app.store.deleteMaterial(book.id);
  assert.deepEqual(
    (await (await call("/navigation")).json()).materials.map((m: any) => m.id),
    [doc.id],
  );
  await call("/settings", "PATCH", { closed: true }, auth);
  assert.equal((await call("/navigation")).status, 401);
});
