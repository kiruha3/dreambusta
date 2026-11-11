import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";

test("search and answers enforce public/editor/closed access, scope validation and anonymous read-only answers", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-search-http-"));
  const models = {
    enabled: true,
    embeddingModel: "test",
    embed: async (texts: string[]) => texts.map(() => [1, 0]),
    generate: async () => ({
      sentences: [{ text: "Документ согласует руководитель.", sources: [1] }],
    }),
  };
  const app = createApp({ dataDir: dir, searchModels: models });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await app.search.close();
    await new Promise<void>((r) => app.server.close(() => r()));
    app.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://localhost:${(app.server.address() as any).port}`;
  const req = (path: string, init: RequestInit = {}) =>
    fetch(base + "/api" + path, init);
  const setup = await req("/setup", {
    method: "POST",
    body: JSON.stringify({
      email: "test@example.test",
      password: "test-only-password-123",
    }),
  });
  const session = await setup.json();
  const cookie = setup.headers.get("set-cookie")!.split(";")[0];
  const visible = app.store.createMaterial({
    title: "Договор",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Документ согласует руководитель."],
  });
  app.store.createMaterial({
    title: "Секрет",
    kind: "document",
    visible: false,
    source: { type: "file" },
    paragraphs: ["Документ согласует директор."],
  });
  await app.search.idle();
  const publicHits = await (await req("/search?q=согласует")).json();
  assert.equal(publicHits.total, 1);
  assert.equal(publicHits.results[0].materialId, visible.id);
  const editorHits = await (
    await req("/search?q=согласует", { headers: { cookie } })
  ).json();
  assert.equal(editorHits.total, 2);
  assert.equal((await req("/search?q=a&kind=unknown")).status, 400);
  assert.equal((await req("/search?q=" + "a".repeat(301))).status, 400);
  assert.equal((await req("/search?q=слово&offset=oops")).status, 400);
  assert.equal(
    (
      await req("/search/answer", {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: JSON.stringify({ query: "согласует" }),
      })
    ).status,
    403,
  );
  const answer = await req("/search/answer", {
    method: "POST",
    body: JSON.stringify({ query: "согласует" }),
  });
  assert.equal(answer.status, 200);
  assert.equal((await answer.json()).status, "answered");
  app.store.setSetting("closed", "true");
  assert.equal((await req("/search?q=согласует")).status, 401);
  assert.equal(
    (
      await req("/search/answer", {
        method: "POST",
        body: JSON.stringify({ query: "согласует" }),
      })
    ).status,
    401,
  );
  assert.equal(
    (await req("/search?q=согласует", { headers: { cookie } })).status,
    200,
  );
  assert.ok(session.csrf);
  const { makePdf } = await import("./fixtures/documents.mjs");
  const writeHeaders = { cookie, "x-csrf-token": session.csrf };
  const uploaded = await req("/uploads?name=version.pdf", {
    method: "POST",
    headers: writeHeaders,
    body: makePdf("Original PDF text", 2),
  });
  const original = await uploaded.json();
  assert.equal(original.paragraphLocations.length, 2);
  const replaced = await req(
    `/materials/${original.id}/version?name=replaced.txt`,
    {
      method: "POST",
      headers: writeHeaders,
      body: "Новый текст без страниц PDF",
    },
  );
  const replacement = await replaced.json();
  assert.equal(replaced.status, 200);
  assert.deepEqual(
    replacement.paragraphLocations,
    [],
    "old PDF locations must not survive a text-only replacement",
  );
});
