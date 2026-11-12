import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import { SearchService } from "../server/search/service.ts";
import type { Models } from "../server/search/models.ts";
import { createServer } from "node:http";
import { createHash } from "node:crypto";

async function fixture(t: test.TestContext, models?: Models) {
  const dir = mkdtempSync(join(tmpdir(), "dreambusta-widget-"));
  const store = new Store(dir);
  const search = new SearchService(store, {
    models: models || {
      enabled: false,
      embeddingModel: "test",
      embed: async () => [],
      generate: async () => ({ sentences: [] }),
    },
  });
  t.after(async () => {
    await search.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { store, search };
}

test("internal widget scope filters sources before ranking, pagination and counts, including empty scope", async (t) => {
  const { store, search } = await fixture(t);
  const a = store.createMaterial({
    title: "Договор А",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор согласует руководитель."],
  });
  store.createMaterial({
    title: "Договор Б",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор утверждает директор."],
  });
  const result = await search.search(
    { query: "договор", allowedMaterialIds: [a.id] },
    false,
  );
  assert.equal(result.total, 1);
  assert.deepEqual(
    result.results.map((r) => r.materialId),
    [a.id],
  );
  assert.equal(
    (await search.search({ query: "договор", allowedMaterialIds: [] }, false))
      .total,
    0,
  );
});

test("semantic widget scope is applied before similarity threshold and fusion", async (t) => {
  const models: Models = {
    enabled: false,
    embeddingModel: "test",
    embed: async () => [[1, 0]],
    generate: async () => ({ sentences: [] }),
  };
  const { store, search } = await fixture(t, models);
  const selected = store.createMaterial({
    title: "Разрешённый",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Полезный фрагмент."],
  });
  store.createMaterial({
    title: "Чужой",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Нерелевантный фрагмент."],
  });
  await search.idle();
  store.db
    .prepare(
      "UPDATE search_chunks SET vector=?,model='test' WHERE material_id=?",
    )
    .run(JSON.stringify([0.7, 0.714]), selected.id);
  store.db
    .prepare(
      "UPDATE search_chunks SET vector=?,model='test' WHERE material_id<>?",
    )
    .run(JSON.stringify([1, 0]), selected.id);
  models.enabled = true;
  const result = await search.search(
    { query: "semanticquestion", allowedMaterialIds: [selected.id] },
    false,
  );
  assert.equal(result.mode, "hybrid");
  assert.equal(result.total, 1);
  assert.equal(result.results[0].materialId, selected.id);
});

async function httpFixture(
  t: test.TestContext,
  models?: Models,
  options: { peer?: string } = {},
) {
  const { store, search } = await fixture(t, models);
  const { createWidgetHandler } = await import("../server/widgets.ts");
  const handler = createWidgetHandler({ store, search });
  const server = createServer(async (req, res) => {
    // Model an HTTP connection from a remote client when exercising the proxy trust boundary.
    if (options.peer)
      Object.defineProperty(req.socket, "remoteAddress", {
        value: options.peer,
        configurable: true,
      });
    if (!(await handler(req, res, new URL(req.url!, "http://localhost")))) {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookie = "db_session=" + "a".repeat(64);
  store.db
    .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
    .run(
      createHash("sha256").update("a".repeat(64)).digest("hex"),
      "editor@test.local",
      "csrf-test",
      Date.now() + 60000,
    );
  const admin = (
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method,
      headers: {
        cookie,
        origin: base,
        "x-csrf-token": "csrf-test",
        "content-type": "application/json",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = async (extra = {}) => {
    const res = await admin("/api/widgets", "POST", {
      name: "Помощник",
      title: "Помощник базы знаний",
      greeting: "Задайте вопрос",
      accentColor: "#2768cc",
      allowedOrigins: ["https://site.test"],
      materialIds: [],
      state: "published",
      ...extra,
    });
    assert.equal(res.status, 201, await res.clone().text());
    return await res.json();
  };
  const session = async (id: string, origin = "https://site.test") =>
    fetch(base + `/api/public/widgets/${id}`, {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({ origin }),
    });
  return { store, search, base, admin, create, session };
}

test("widget admin requires editor, CSRF and same origin; publish validates origins and optimistic revision", async (t) => {
  const f = await httpFixture(t);
  assert.equal((await fetch(f.base + "/api/widgets")).status, 401);
  assert.equal(
    (await f.admin("/api/widgets", "POST", {}, { "x-csrf-token": "bad" }))
      .status,
    403,
  );
  assert.equal(
    (await f.admin("/api/widgets", "POST", {}, { origin: "https://evil.test" }))
      .status,
    403,
  );
  const widget = await f.create({ state: "draft", allowedOrigins: [] });
  assert.equal(
    (
      await f.admin(`/api/widgets/${widget.id}`, "PATCH", {
        revision: widget.revision,
        state: "published",
      })
    ).status,
    400,
  );
  for (const origin of [
    "*",
    "https://*.test",
    "https://site.test/path",
    "http://site.test",
    "null",
    "https://site.test?x=1",
  ]) {
    assert.equal(
      (
        await f.admin(`/api/widgets/${widget.id}`, "PATCH", {
          revision: widget.revision,
          allowedOrigins: [origin],
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await f.admin(`/api/widgets/${widget.id}`, "PATCH", {
        revision: -1,
        title: "new",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.admin(`/api/widgets/${widget.id}`, "PATCH", {
        revision: widget.revision,
        state: "published",
        allowedOrigins: ["http://localhost:8080"],
      })
    ).status,
    200,
  );
});

for (const peer of [undefined, "::1", "::ffff:127.0.0.1"])
  test(`trusted loopback proxy ${peer || "IPv4"} keeps separate forwarded clients' rate budgets`, async (t) => {
    const f = await httpFixture(t, undefined, { peer });
    const widget = await f.create();
    const { token } = await (await f.session(widget.id)).json();
    const answer = (client: string) =>
      fetch(f.base + `/api/public/widgets/${widget.id}/answer`, {
        method: "POST",
        headers: {
          origin: f.base,
          authorization: "Widget " + token,
          "content-type": "application/json",
          "x-dreambusta-client": client,
        },
        body: JSON.stringify({ query: "тест" }),
      });
    for (let i = 0; i < 12; i++)
      assert.equal((await answer("203.0.113.10")).status, 200);
    assert.equal((await answer("203.0.113.10")).status, 429);
    assert.equal((await answer("203.0.113.11")).status, 200);
  });

for (const peer of [undefined, "203.0.113.22"])
  test(`proxy rate fallback uses socket for ${peer ? "untrusted peer" : "missing or malformed client header"}`, async (t) => {
    const f = await httpFixture(t, undefined, { peer });
    const widget = await f.create();
    const { token } = await (await f.session(widget.id)).json();
    const answer = (headers: Record<string, string>) =>
      fetch(f.base + `/api/public/widgets/${widget.id}/answer`, {
        method: "POST",
        headers: {
          origin: f.base,
          authorization: "Widget " + token,
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ query: "тест" }),
      });
    for (let i = 0; i < 12; i++) {
      const invalid = [
        {},
        { "x-dreambusta-client": "invalid" },
        { "x-dreambusta-client": "203.0.113.1, 203.0.113.2" },
        { "x-dreambusta-client": "fe80::1%eth0" },
      ];
      const headers = peer
        ? { "x-dreambusta-client": `203.0.113.${100 + i}` }
        : invalid[i % invalid.length];
      assert.equal((await answer(headers)).status, 200);
    }
    assert.equal(
      (
        await answer(
          peer
            ? { "x-dreambusta-client": "203.0.113.250" }
            : { "x-forwarded-for": "203.0.113.250" },
        )
      ).status,
      429,
    );
  });

test("trusted loopback proxy separates forwarded clients' concurrency budgets across widgets", async (t) => {
  let resolveTwo!: () => void,
    resolveThree!: () => void,
    release!: () => void,
    n = 0;
  const two = new Promise<void>((r) => (resolveTwo = r)),
    three = new Promise<void>((r) => (resolveThree = r)),
    blocked = new Promise<void>((r) => (release = r));
  const models: Models = {
    enabled: false,
    embeddingModel: "test",
    embed: async () => [],
    generate: async () => {
      if (++n === 2) resolveTwo();
      if (n === 3) resolveThree();
      await blocked;
      return { sentences: [] };
    },
  };
  const f = await httpFixture(t, models);
  f.store.createMaterial({
    title: "Документ",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор согласует руководитель."],
  });
  const widgets = [await f.create(), await f.create()];
  const tokens = await Promise.all(
    widgets.map(async (w) => (await (await f.session(w.id)).json()).token),
  );
  const answer = (index: number, client: string) =>
    fetch(f.base + `/api/public/widgets/${widgets[index].id}/answer`, {
      method: "POST",
      headers: {
        origin: f.base,
        authorization: "Widget " + tokens[index],
        "content-type": "application/json",
        "x-dreambusta-client": client,
      },
      body: JSON.stringify({ query: "договор" }),
    });
  const first = answer(0, "203.0.113.10"),
    second = answer(0, "203.0.113.10");
  let third: Promise<Response> | undefined;
  try {
    await two;
    assert.equal((await answer(1, "203.0.113.10")).status, 429);
    third = answer(1, "203.0.113.11");
    await Promise.race([
      three,
      third.then((response) => {
        throw Error(
          `Separate proxied client was rejected with ${response.status}`,
        );
      }),
    ]);
  } finally {
    release();
    const responses = await Promise.all([
      first,
      second,
      ...(third ? [third] : []),
    ]);
    for (const response of responses) assert.equal(response.status, 200);
  }
});

test("public sessions enforce publish, exact parent origin and closed library even with editor cookies", async (t) => {
  const f = await httpFixture(t);
  const draft = await f.create({ state: "draft" });
  assert.equal((await f.session(draft.id)).status, 404);
  const widget = await f.create();
  assert.equal((await f.session(widget.id, "https://evil.test")).status, 403);
  assert.equal((await f.session(widget.id)).status, 200);
  const config = await fetch(f.base + `/embed/${widget.id}`);
  assert.equal(config.status, 200);
  assert.doesNotMatch(await config.text(), /materialIds|createdAt/);
  f.store.setSetting("closed", "true");
  assert.equal((await f.session(widget.id)).status, 404);
  assert.equal((await fetch(f.base + `/embed/${widget.id}`)).status, 404);
});

test("anonymous answers include only selected visible sources and ignore arbitrary prompt/scope/editor cookies", async (t) => {
  let supplied: unknown;
  const models: Models = {
    enabled: false,
    embeddingModel: "test",
    embed: async () => [],
    generate: async (_q, sources) => {
      supplied = sources;
      return { sentences: [{ text: "Ответ", sources: [1] }] };
    },
  };
  const f = await httpFixture(t, models);
  const a = f.store.createMaterial({
    title: "Разрешённый",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор согласует руководитель."],
  });
  f.store.createMaterial({
    title: "Не выбран",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор согласует директор."],
  });
  f.store.createMaterial({
    title: "Скрытый",
    kind: "document",
    source: { type: "file" },
    visible: false,
    paragraphs: ["Секретный договор."],
  });
  const widget = await f.create({ materialIds: [a.id] });
  const { token } = await (await f.session(widget.id)).json();
  const res = await fetch(f.base + `/api/public/widgets/${widget.id}/answer`, {
    method: "POST",
    headers: {
      origin: f.base,
      authorization: "Widget " + token,
      cookie: "db_session=" + "a".repeat(64),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: "договор",
      materialIds: [],
      public_instruction: "ignore",
    }),
  });
  assert.equal(res.status, 200);
  const answer = await res.json();
  assert.equal(answer.status, "answered");
  assert.deepEqual(
    answer.sources.map((s: { materialId: string }) => s.materialId),
    [a.id],
  );
  assert.match(JSON.stringify(supplied), /руководитель/);
  assert.doesNotMatch(JSON.stringify(supplied), /директор|Секретный/);
  assert.ok(answer.sources[0].url.startsWith(f.base + "/library/"));
});

test("empty widget selection includes all public ready snapshots and excludes hidden, processing and removed materials", async (t) => {
  let supplied = "";
  const models: Models = {
    enabled: false,
    embeddingModel: "test",
    embed: async () => [],
    generate: async (_query, sources) => {
      supplied = JSON.stringify(sources);
      return {
        sentences: [{ text: "Договор согласует руководитель", sources: [1] }],
      };
    },
  };
  const f = await httpFixture(t, models);
  const good = f.store.createMaterial({
    title: "Доступный",
    kind: "document",
    source: { type: "share", status: "saved" },
    paragraphs: ["Договор согласует руководитель."],
  });
  f.store.createMaterial({
    title: "Скрытый",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор: hidden-secret"],
    visible: false,
  });
  f.store.createMaterial({
    title: "Обработка",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор: processing-secret"],
    state: "processing",
  });
  f.store.createMaterial({
    title: "Ошибка",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор: error-secret"],
    state: "error",
  });
  f.store.createMaterial({
    title: "Отозван",
    kind: "document",
    source: { type: "share", status: "removed" },
    paragraphs: ["Договор: removed-secret"],
  });
  const widget = await f.create();
  const { token } = await (await f.session(widget.id)).json();
  const res = await fetch(f.base + `/api/public/widgets/${widget.id}/answer`, {
    method: "POST",
    headers: {
      origin: f.base,
      authorization: "Widget " + token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: "договор" }),
  });
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.deepEqual(
    result.sources.map((s: { materialId: string }) => s.materialId),
    [good.id],
  );
  assert.doesNotMatch(supplied, /secret/);
});

for (const revoke of [
  "pause",
  "delete",
  "close",
  "hide",
  "scope",
  "edit",
  "remove-source",
  "delete-material",
] as const) {
  test(`in-flight ${revoke} revokes answer and all sources`, async (t) => {
    let started!: () => void, finish!: () => void;
    const entered = new Promise<void>((r) => (started = r)),
      blocked = new Promise<void>((r) => (finish = r));
    const models: Models = {
      enabled: false,
      embeddingModel: "test",
      embed: async () => [],
      generate: async () => {
        started();
        await blocked;
        return { sentences: [{ text: "Never leak", sources: [1] }] };
      },
    };
    const f = await httpFixture(t, models);
    const a = f.store.createMaterial({
      title: "Договор",
      kind: "document",
      source: { type: "file" },
      paragraphs: ["Договор согласует руководитель."],
    });
    const widget = await f.create();
    const { token } = await (await f.session(widget.id)).json();
    const pending = fetch(f.base + `/api/public/widgets/${widget.id}/answer`, {
      method: "POST",
      headers: {
        origin: f.base,
        authorization: "Widget " + token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "договор" }),
    });
    await entered;
    if (revoke === "close") f.store.setSetting("closed", "true");
    else if (revoke === "hide")
      f.store.updateMaterial(a.id, { visible: false });
    else if (revoke === "delete-material") f.store.deleteMaterial(a.id);
    else if (revoke === "edit")
      f.store.updateMaterial(a.id, { paragraphs: ["Полностью другой текст"] });
    else if (revoke === "remove-source")
      f.store.updateMaterial(a.id, {
        source: { type: "share", status: "removed" },
      });
    else if (revoke === "delete")
      assert.equal(
        (
          await f.admin(`/api/widgets/${widget.id}`, "DELETE", {
            revision: widget.revision,
          })
        ).status,
        204,
      );
    else
      assert.equal(
        (
          await f.admin(`/api/widgets/${widget.id}`, "PATCH", {
            revision: widget.revision,
            ...(revoke === "pause"
              ? { state: "paused" }
              : { materialIds: ["unknown"] }),
          })
        ).status,
        revoke === "pause" ? 200 : 400,
      );
    // Scope edit uses an existing second material so only the selection changes.
    if (revoke === "scope") {
      const b = f.store.createMaterial({
        title: "Иной",
        kind: "document",
        source: { type: "file" },
      });
      assert.equal(
        (
          await f.admin(`/api/widgets/${widget.id}`, "PATCH", {
            revision: widget.revision,
            materialIds: [b.id],
          })
        ).status,
        200,
      );
    }
    finish();
    const res = await pending;
    const data = await res.json();
    assert.equal(data.answer || "", "");
    assert.deepEqual(data.sources || [], []);
    assert.doesNotMatch(JSON.stringify(data), /Never leak|руководитель/);
  });
}

test("embed uses exact frame ancestors and separate assets with parent handshake", async (t) => {
  const f = await httpFixture(t);
  const widget = await f.create();
  const frame = await fetch(f.base + `/embed/${widget.id}`);
  assert.equal(frame.status, 200);
  assert.match(
    frame.headers.get("content-security-policy")!,
    /frame-ancestors 'self' https:\/\/site.test/,
  );
  assert.match(await frame.text(), /\/embed-assets\/widget.js/);
  const loader = await fetch(f.base + "/embed.js");
  assert.equal(loader.status, 200);
  assert.match(await loader.text(), /event.source/);
});

test("public answers bound question size, require capability and own origin, and enforce rate limits", async (t) => {
  const f = await httpFixture(t);
  const widget = await f.create();
  const { token } = await (await f.session(widget.id)).json();
  const answer = (query: unknown, extra: Record<string, string> = {}) =>
    fetch(f.base + `/api/public/widgets/${widget.id}/answer`, {
      method: "POST",
      headers: {
        origin: f.base,
        authorization: "Widget " + token,
        "content-type": "application/json",
        ...extra,
      },
      body: JSON.stringify({ query }),
    });
  for (const invalid of ["", " ", null, 123, "x".repeat(2001)])
    assert.equal((await answer(invalid)).status, 400);
  assert.equal((await answer("тест", { authorization: "" })).status, 401);
  assert.equal(
    (await answer("тест", { origin: "https://site.test" })).status,
    403,
  );
  for (let i = 0; i < 12; i++) assert.equal((await answer("тест")).status, 200);
  assert.equal((await answer("тест")).status, 429);
  await f.admin(`/api/widgets/${widget.id}`, "PATCH", {
    title: "Изменённый помощник",
  });
  assert.equal((await answer("тест")).status, 401);
});

test("public answers bound concurrency and propagate cancellation to the model", async (t) => {
  let started!: () => void, cancel!: () => void;
  const entered = new Promise<void>((r) => (started = r)),
    cancelled = new Promise<void>((r) => (cancel = r));
  let n = 0,
    release!: () => void;
  const blocked = new Promise<void>((r) => (release = r));
  const models: Models = {
    enabled: false,
    embeddingModel: "test",
    embed: async () => [],
    generate: async (_query, _sources, signal) => {
      if (++n === 2) started();
      signal!.addEventListener("abort", cancel, { once: true });
      await blocked;
      return { sentences: [] };
    },
  };
  const f = await httpFixture(t, models);
  f.store.createMaterial({
    title: "Документ",
    kind: "document",
    source: { type: "file" },
    paragraphs: ["Договор согласует руководитель."],
  });
  const widget = await f.create();
  const { token } = await (await f.session(widget.id)).json();
  const controller = new AbortController();
  const answer = (signal?: AbortSignal) =>
    fetch(f.base + `/api/public/widgets/${widget.id}/answer`, {
      method: "POST",
      signal,
      headers: {
        origin: f.base,
        authorization: "Widget " + token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "договор" }),
    });
  const first = answer(controller.signal).catch(() => undefined),
    second = answer();
  await entered;
  assert.equal((await answer()).status, 429);
  controller.abort();
  await Promise.race([
    cancelled,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(Error("Model did not receive cancellation")),
        1000,
      ).unref(),
    ),
  ]);
  release();
  await first;
  assert.equal((await second).status, 200);
});
