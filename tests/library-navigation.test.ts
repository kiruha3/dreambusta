import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";

test("editor controls ordered guest navigation without exposing hidden or deleted materials", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-navigation-"));
  const app = createApp({ dataDir: dir, searchModels: false });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await app.search.close();
    await new Promise<void>((r) => app.server.close(() => r()));
    app.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://localhost:${(app.server.address() as any).port}/api`;
  const setup = await fetch(base + "/setup", {
    method: "POST",
    body: JSON.stringify({
      email: "editor@example.test",
      password: "test-only-password-123",
    }),
  });
  const session = await setup.json();
  const headers = {
    cookie: setup.headers.get("set-cookie")!.split(";")[0],
    "x-csrf-token": session.csrf,
    "content-type": "application/json",
  };
  const a = app.store.createMaterial({
    title: "Первая",
    kind: "document",
    source: { type: "file" },
  });
  const b = app.store.createMaterial({
    title: "Вторая",
    kind: "document",
    source: { type: "file" },
  });
  const hidden = app.store.createMaterial({
    title: "Скрытая",
    kind: "document",
    source: { type: "file" },
    visible: false,
  });
  const save = await fetch(base + "/settings", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sidebarMaterialIds: [b.id, hidden.id, a.id] }),
  });
  assert.equal(save.status, 200);
  assert.deepEqual((await save.json()).sidebarMaterialIds, [
    b.id,
    hidden.id,
    a.id,
  ]);
  const nav = await (await fetch(base + "/navigation")).json();
  assert.deepEqual(
    nav.materials.map((m: any) => m.id),
    [b.id, a.id],
  );
  assert.deepEqual(Object.keys(nav.materials[0]).sort(), [
    "id",
    "kind",
    "slug",
    "title",
  ]);
  assert.equal(
    (
      await fetch(base + "/settings", {
        method: "PATCH",
        body: JSON.stringify({ sidebarMaterialIds: [] }),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/settings", {
        method: "PATCH",
        headers: { cookie: headers.cookie },
        body: JSON.stringify({ sidebarMaterialIds: [] }),
      })
    ).status,
    403,
  );
  const invalid = await fetch(base + "/settings", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ closed: true, sidebarMaterialIds: ["missing"] }),
  });
  assert.equal(invalid.status, 400);
  assert.notEqual(
    app.store.setting("closed"),
    "true",
    "settings update must be atomic",
  );
  app.store.deleteMaterial(b.id);
  assert.deepEqual(
    (await (await fetch(base + "/navigation")).json()).materials.map(
      (m: any) => m.id,
    ),
    [a.id],
  );
  const flag = await fetch(base + `/materials/${a.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ knowledge: true }),
  });
  assert.equal(flag.status, 200);
  assert.equal((await flag.json()).knowledge, true);
  app.store.setSetting("closed", "true");
  assert.equal((await fetch(base + "/navigation")).status, 401);
});
