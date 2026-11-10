import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
test("uploads persist originals, support media Range, and reject anonymous writes and hidden file reads", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-upload-"));
  const app = createApp({ dataDir: dir });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(app.server.address() as any).port}`;
  t.after(async () => {
    await new Promise<void>((r) => app.server.close(() => r()));
    app.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  assert.equal(
    (
      await fetch(base + "/api/uploads?name=article.md", {
        method: "POST",
        body: "x",
      })
    ).status,
    401,
  );
  const setup = await fetch(base + "/api/setup", {
    method: "POST",
    body: JSON.stringify({
      email: "edit@test.test",
      password: "my-test-password-long",
    }),
  });
  const cookie = setup.headers.get("set-cookie")!.split(";")[0];
  const { csrf } = await setup.json();
  const headers = { cookie, "x-csrf-token": csrf };
  const upload = await fetch(base + "/api/uploads?name=note.md", {
    method: "POST",
    headers,
    body: "# Note\n\nActual document text.",
  });
  assert.equal(upload.status, 201);
  const m = await upload.json();
  assert.equal(m.state, "ready");
  assert.match(
    await (await fetch(base + `/api/materials/${m.id}/file/original`)).text(),
    /Actual document/,
  );
  const repeated = await fetch(base + "/api/uploads?name=renamed.md", {
    method: "POST",
    headers,
    body: "# Note\n\nActual document text.",
  });
  assert.equal(
    repeated.status,
    409,
    "identical content with another filename must not create a duplicate",
  );
  assert.match((await repeated.json()).error, /уже добавлен/i);
  assert.equal(app.store.listMaterials().length, 1);
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    "base64",
  );
  const cover = await fetch(base + `/api/materials/${m.id}/cover`, {
    method: "POST",
    headers,
    body: image,
  });
  assert.equal(cover.status, 200);
  assert.equal(
    (await fetch(base + `/api/materials/${m.id}/file/cover`)).headers.get(
      "content-type",
    ),
    "image/png",
  );
  assert.equal(
    (
      await fetch(base + `/api/materials/${m.id}/cover`, {
        method: "POST",
        headers,
        body: '<svg onload="alert(1)"></svg>',
      })
    ).status,
    400,
  );
  const media = await fetch(base + "/api/uploads?name=audio.mp3", {
    method: "POST",
    headers,
    body: new Uint8Array([73, 68, 51, 0, 1, 2, 3, 4]),
  });
  assert.equal(media.status, 201);
  const a = await media.json();
  const transcript = await fetch(base + `/api/materials/${a.id}/transcript`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      markdown: "# Расшифровка\n\nОпубликованный текст записи.",
    }),
  });
  assert.equal(transcript.status, 200);
  const withText = await transcript.json();
  assert.ok(withText.representations.includes("text"));
  assert.match(withText.paragraphs.join(" "), /Опубликованный текст/);
  const range = await fetch(base + `/api/materials/${a.id}/file/original`, {
    headers: { Range: "bytes=2-4" },
  });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), "bytes 2-4/8");
  assert.deepEqual([...new Uint8Array(await range.arrayBuffer())], [51, 0, 1]);
  await fetch(base + `/api/materials/${a.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ visible: false }),
  });
  assert.equal(
    (await fetch(base + `/api/materials/${a.id}/file/original`)).status,
    404,
  );
});
