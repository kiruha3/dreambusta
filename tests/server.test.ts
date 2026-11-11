import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from 'node:http';

test("editor setup, CSRF, hidden materials and closed catalogue are enforced by HTTP", async (t) => {
  const mod = await import("../server/app.ts").catch(() => null);
  assert.ok(mod?.createApp, "HTTP application is not implemented");
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-http-"));
  const app = mod.createApp({ dataDir: dir });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(app.server.address() as any).port}`;
  t.after(async () => {
    await new Promise<void>((r) => app.server.close(() => r()));
    app.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const request = (
    path: string,
    method = "GET",
    data?: unknown,
    headers = {},
  ) =>
    fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  assert.equal(
    (await request("/api/materials", "POST", { title: "No" })).status,
    401,
  );
  assert.equal((await request("/api/links/navigation", "POST", {url:"https://buildin.ai/share/public"})).status,401);
  assert.equal((await request('/api/setup', 'POST', { email: 'remote@example.test', password: 'remote-password-long' }, { 'x-dreambusta-client': '192.168.1.10' })).status, 403, 'dev proxy preserves the real setup client address');
  const firstBody = JSON.stringify({ email: 'other@example.test', password: 'another-password-long' });
  let finishFirst: ReturnType<typeof httpRequest>;
  const firstResult = new Promise<number>((resolve, reject) => {
    finishFirst = httpRequest(base + '/api/setup', { method: 'POST', headers: { 'Content-Length': Buffer.byteLength(firstBody) } }, response => { response.resume(); resolve(response.statusCode!); });
    finishFirst.on('error', reject); finishFirst.write(firstBody.slice(0, 1));
  });
  await request('/api/session'); // first request is waiting for the rest of its body
  const setup = await request('/api/setup', 'POST', { email: 'editor@example.test', password: 'a-long-test-password' });
  finishFirst!.end(firstBody.slice(1));
  assert.equal(await firstResult, 409, 'a slow setup request cannot create a second editor');
  assert.equal(setup.status, 201);
  const cookie = setup.headers.get("set-cookie")!.split(";")[0];
  const session = await setup.json();
  assert.ok(session.csrf);
  assert.equal(
    (
      await request("/api/setup", "POST", {
        email: "other@example.test",
        password: "another-password",
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("/api/materials", "POST", { title: "No" }, { cookie }))
      .status,
    403,
  );
  const headers = { cookie, "x-csrf-token": session.csrf };
  assert.equal((await request("/api/links/navigation", "POST", {url:"https://buildin.ai/share/public"},{cookie})).status,403);
  assert.equal((await request("/api/links", "POST", {url:"https://buildin.ai/share/public",importOptions:{scope:"invalid"}},headers)).status,400);
  const normalized=await request("/api/links/preview","POST",{url:"http://www.buildin.ai/share/public/?utm_source=copy"},headers);
  assert.equal((await normalized.json()).url,"https://buildin.ai/share/public");
  const created = await request(
    "/api/materials",
    "POST",
    { title: "Скрытая статья", visible: false, kind: "document" },
    headers,
  );
  assert.equal(created.status, 201);
  const m = await created.json();
  assert.equal((await request(`/api/materials/${m.slug}`)).status, 404);
  assert.equal(
    (await request(`/api/materials/${m.id}/file/original`)).status,
    404,
  );
  assert.equal((await (await request("/api/materials")).json()).length, 0);
  assert.equal(
    (
      await (
        await request(`/api/materials/${m.id}`, "GET", undefined, { cookie })
      ).json()
    ).title,
    m.title,
  );
  assert.equal(
    (await request("/api/settings", "PATCH", { closed: true }, headers)).status,
    200,
  );
  assert.equal((await request("/api/materials")).status, 401);
  await request("/api/logout", "POST", {}, headers);
  assert.equal(
    (await request("/api/settings", "PATCH", { closed: false }, headers))
      .status,
    401,
  );
});
