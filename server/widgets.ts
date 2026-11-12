import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import type { Store } from "./store.ts";
import type { SearchService } from "./search/service.ts";
import type { Widget } from "../shared/widgets.ts";
import { createPaths } from "../shared/paths.ts";
import { getSession } from "./auth.ts";

class WidgetError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const fail = (status: number, message: string): never => {
  throw new WidgetError(status, message);
};
const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
};
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) fail(413, "Слишком большой запрос");
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
      fail(400, "Ожидался объект JSON");
    return parsed;
  } catch (e) {
    if (e instanceof WidgetError) throw e;
    return fail(400, "Некорректный JSON");
  }
}
function canonicalOrigin(value: unknown) {
  if (typeof value !== "string" || value.length > 300)
    return fail(400, "Укажите точный origin сайта");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(400, "Некорректный origin");
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    value.includes("*") ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        url.port)
    ) ||
    value !== url.origin
  )
    return fail(
      400,
      "Origin должен быть точным HTTPS-адресом или localhost HTTP с портом, без пути",
    );
  return url.origin;
}
function validate(input: Record<string, unknown>, previous?: Widget): Widget {
  const now = new Date().toISOString();
  const result: Widget = previous
    ? { ...previous, revision: previous.revision + 1, updatedAt: now }
    : {
        id: randomUUID(),
        name: "Новый помощник",
        title: "Помощник Дримбусты",
        greeting: "Здравствуйте! Задайте вопрос по материалам базы знаний.",
        accentColor: "#5556d9",
        allowedOrigins: [],
        materialIds: [],
        state: "draft",
        createdAt: now,
        updatedAt: now,
        revision: 1,
      };
  for (const key of ["name", "title", "greeting"] as const)
    if (key in input) {
      const v = input[key];
      if (
        typeof v !== "string" ||
        !v.trim() ||
        v.length > (key === "greeting" ? 2000 : 160)
      )
        fail(400, "Проверьте длину названия и приветствия");
      result[key] = (v as string).trim();
    }
  if ("accentColor" in input) {
    if (
      typeof input.accentColor !== "string" ||
      !/^#[a-f0-9]{6}$/i.test(input.accentColor)
    )
      fail(400, "Укажите цвет #RRGGBB");
    result.accentColor = input.accentColor as string;
  }
  if ("allowedOrigins" in input) {
    if (
      !Array.isArray(input.allowedOrigins) ||
      input.allowedOrigins.length > 30
    )
      fail(400, "Не более 30 разрешённых сайтов");
    result.allowedOrigins = [
      ...new Set((input.allowedOrigins as unknown[]).map(canonicalOrigin)),
    ];
  }
  if ("materialIds" in input) {
    const ids = input.materialIds;
    if (
      !Array.isArray(ids) ||
      ids.length > 1000 ||
      ids.some(
        (x) => typeof x !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(x),
      )
    )
      fail(400, "Проверьте список материалов");
    result.materialIds = [...new Set(ids as string[])];
  }
  if ("state" in input) {
    if (!["draft", "published", "paused"].includes(input.state as string))
      fail(400, "Проверьте состояние виджета");
    result.state = input.state as Widget["state"];
  }
  if (result.state === "published" && !result.allowedOrigins.length)
    fail(400, "Для публикации добавьте разрешённый origin сайта");
  return result;
}
function requestOrigin(req: IncomingMessage) {
  const protocol =
    "encrypted" in req.socket || req.headers["x-forwarded-proto"] === "https"
      ? "https:"
      : "http:";
  try {
    return new URL(`${protocol}//${req.headers.host}`).origin;
  } catch {
    return fail(400, "Некорректный адрес сервера");
  }
}
function sameOrigin(req: IncomingMessage) {
  if (req.headers.origin !== requestOrigin(req))
    fail(403, "Чужой источник запроса");
  if (req.headers["sec-fetch-site"] === "cross-site")
    fail(403, "Чужой источник запроса");
}
function normalizedIp(value: string) {
  const plain = value.replace(/^::ffff:(?=\d+\.)/i, "");
  if (isIP(plain) === 4) return plain;
  if (isIP(plain) === 6 && !plain.includes("%"))
    return new URL(`http://[${plain}]`).hostname;
  return undefined;
}
function widgetClient(req: IncomingMessage) {
  const peer = req.socket.remoteAddress || "unknown";
  const plainPeer = peer.replace(/^::ffff:/i, "");
  const localProxy =
    plainPeer === "::1" ||
    (isIP(plainPeer) === 4 && plainPeer.startsWith("127."));
  const forwarded = req.headers["x-dreambusta-client"];
  // Vite/Nginx overwrite this header. Direct remote callers cannot choose their budget key.
  const client =
    localProxy && typeof forwarded === "string"
      ? normalizedIp(forwarded)
      : undefined;
  return client || normalizedIp(peer) || peer;
}

/** Owns public routes before the application's editor/closed-library access gate. */
export function createWidgetHandler({
  store,
  search,
}: {
  store: Store;
  search: SearchService;
}) {
  store.db.exec(
    "CREATE TABLE IF NOT EXISTS widgets (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
  );
  const read = (id: string) => {
    const row = store.db.prepare("SELECT data FROM widgets WHERE id=?").get(id);
    return row ? (JSON.parse(row.data as string) as Widget) : undefined;
  };
  const available = (id: string) => {
    const widget = read(id);
    if (
      !widget ||
      widget.state !== "published" ||
      store.setting("closed") === "true"
    )
      return fail(404, "Помощник сейчас недоступен");
    return widget;
  };
  const tokens = new Map<
    string,
    { id: string; origin: string; revision: number; expires: number }
  >();
  const limits = new Map<string, { since: number; count: number }>();
  let active = 0;
  const perWidget = new Map<string, number>(),
    perClient = new Map<string, number>();
  function saveInput(input: Record<string, unknown>, previous?: Widget) {
    if (previous && "revision" in input && input.revision !== previous.revision)
      fail(409, "Виджет изменён. Обновите страницу.");
    const widget = validate(input, previous);
    const materialIds = new Set(store.listMaterials().map((m) => m.id));
    if (widget.materialIds.some((id) => !materialIds.has(id)))
      fail(400, "Один из выбранных материалов не найден");
    return widget;
  }
  function rate(key: string, max: number) {
    const now = Date.now();
    if (limits.size >= 10000)
      for (const [key, value] of limits)
        if (value.since < now - 60000) limits.delete(key);
    if (limits.size >= 10000 && !limits.has(key))
      fail(429, "Слишком много запросов. Повторите позже");
    const old = limits.get(key),
      value = old && old.since > now - 60000 ? old : { since: now, count: 0 };
    if (++value.count > max)
      fail(429, "Слишком много запросов. Повторите через минуту");
    limits.set(key, value);
  }
  return async function handleWidgetRequest(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    const pathname = url.pathname;
    if (!(
      pathname === "/embed.js" ||
      pathname.startsWith("/embed/") ||
      pathname.startsWith("/embed-assets/") ||
      /^\/api\/widgets(?:\/|$)/.test(pathname) ||
      pathname.startsWith("/api/public/widgets/")
    ))
      return false;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      const method = req.method || "GET";
      if (/^\/api\/widgets(?:\/|$)/.test(pathname)) {
        const session = getSession(store, req);
        if (!session) fail(401, "Войдите как редактор");
        if (!["GET", "HEAD"].includes(method)) {
          sameOrigin(req);
          if (req.headers["x-csrf-token"] !== session!.csrf)
            fail(403, "Обновите страницу и повторите действие");
        }
        const match = /^\/api\/widgets(?:\/([a-zA-Z0-9-]+))?$/.exec(pathname);
        if (!match) fail(404, "Не найдено");
        const id = match![1];
        if (!id && method === "GET") {
          json(
            res,
            200,
            store.db
              .prepare("SELECT data FROM widgets ORDER BY rowid DESC")
              .all()
              .map((r) => JSON.parse(r.data as string)),
          );
          return true;
        }
        if (!id && method === "POST") {
          if (
            Number(
              store.db.prepare("SELECT COUNT(*) AS n FROM widgets").get()!.n,
            ) >= 100
          )
            fail(400, "Достигнут лимит виджетов");
          const widget = saveInput(await body(req));
          store.db
            .prepare("INSERT INTO widgets VALUES (?,?)")
            .run(widget.id, JSON.stringify(widget));
          json(res, 201, widget);
          return true;
        }
        const previous = id ? read(id) : undefined;
        if (!previous) fail(404, "Виджет не найден");
        if (method === "GET") {
          json(res, 200, previous);
          return true;
        }
        if (method === "PATCH") {
          const input = await body(req);
          // Re-read after receiving the body so concurrent editors cannot validate against a stale revision.
          const current = read(id!);
          if (!current) fail(404, "Виджет не найден");
          const widget = saveInput(input, current);
          store.db
            .prepare("UPDATE widgets SET data=? WHERE id=?")
            .run(JSON.stringify(widget), id!);
          json(res, 200, widget);
          return true;
        }
        if (method === "DELETE") {
          store.db.prepare("DELETE FROM widgets WHERE id=?").run(id!);
          res.writeHead(204);
          res.end();
          return true;
        }
        fail(405, "Метод недоступен");
      }
      if (pathname === "/embed.js" || pathname.startsWith("/embed-assets/")) {
        if (method !== "GET") fail(405, "Метод недоступен");
        const asset =
          pathname === "/embed.js"
            ? "embed.js"
            : pathname.slice("/embed-assets/".length);
        if (!["embed.js", "widget.js", "widget.css"].includes(asset))
          fail(404, "Не найдено");
        res.writeHead(200, {
          "Content-Type": asset.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "application/javascript; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(
          readFileSync(new URL(`./widget-assets/${asset}`, import.meta.url)),
        );
        return true;
      }
      const frame = /^\/embed\/([a-zA-Z0-9-]+)$/.exec(pathname);
      if (frame) {
        if (method !== "GET") fail(405, "Метод недоступен");
        const widget = available(frame[1]);
        res.setHeader(
          "Content-Security-Policy",
          `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' ${widget.allowedOrigins.join(" ")}`,
        );
        const config = JSON.stringify({
          basePath: createPaths(process.env.DREAMBUSTA_BASE_PATH).base,
          id: widget.id,
          title: widget.title,
          greeting: widget.greeting,
          accentColor: widget.accentColor,
          allowedOrigins: widget.allowedOrigins,
        }).replace(/</g, "\\u003c");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Помощник Дримбусты</title><link rel="stylesheet" href="${createPaths(process.env.DREAMBUSTA_BASE_PATH).base}/embed-assets/widget.css"></head><body><main class="shell"><header><h1 id="title"></h1><button id="close" type="button" aria-label="Закрыть помощника">×</button></header><div id="messages" role="log" aria-live="polite"></div><p id="status" role="status">Подключение помощника…</p><form id="question"><label class="sr-only" for="query">Ваш вопрос</label><textarea id="query" placeholder="Задайте вопрос по базе знаний…" rows="2" maxlength="2000" required disabled></textarea><button id="ask" type="submit" disabled>Спросить</button><button id="cancel" type="button" hidden>Отменить</button></form><footer>Источники — открытые материалы Дримбусты</footer></main><script id="widget-config" type="application/json">${config}</script><script src="${createPaths(process.env.DREAMBUSTA_BASE_PATH).base}/embed-assets/widget.js" defer></script></body></html>`,
        );
        return true;
      }
      const route = /^\/api\/public\/widgets\/([a-zA-Z0-9-]+)(\/answer)?$/.exec(
        pathname,
      );
      if (!route) fail(404, "Не найдено");
      if (method !== "POST") fail(405, "Метод недоступен");
      // This route deliberately never calls getSession: editor cookies cannot broaden public access.
      sameOrigin(req);
      const id = route![1],
        widget = available(id),
        client = widgetClient(req);
      if (!route![2]) {
        rate(`handshake:${client}`, 30);
        const input = await body(req),
          origin = input.origin;
        if (
          typeof origin !== "string" ||
          !(
            origin === requestOrigin(req) ||
            widget.allowedOrigins.includes(origin)
          )
        )
          fail(403, "Этот сайт не разрешён для помощника");
        for (const [key, value] of tokens)
          if (value.expires < Date.now()) tokens.delete(key);
        if (tokens.size >= 2000) fail(429, "Помощник занят. Повторите позже");
        const token = randomBytes(32).toString("hex");
        tokens.set(token, {
          id,
          origin: origin as string,
          revision: widget.revision,
          expires: Date.now() + 15 * 60000,
        });
        json(res, 200, { token, expiresIn: 900 });
        return true;
      }
      const token = /^Widget ([a-f0-9]{64})$/.exec(
          req.headers.authorization || "",
        )?.[1],
        access = token ? tokens.get(token) : undefined;
      if (
        !access ||
        access.expires <= Date.now() ||
        access.id !== id ||
        access.revision !== widget.revision ||
        !(
          access.origin === requestOrigin(req) ||
          widget.allowedOrigins.includes(access.origin)
        )
      )
        fail(401, "Подключитесь к помощнику заново");
      const input = await body(req);
      if (
        typeof input.query !== "string" ||
        !input.query.trim() ||
        input.query.length > 2000
      )
        fail(400, "Вопрос должен содержать от 1 до 2000 символов");
      rate(`answer:${client}`, 12);
      rate(`widget:${id}`, 60);
      if (
        active >= 6 ||
        (perWidget.get(id) || 0) >= 2 ||
        (perClient.get(client) || 0) >= 2
      )
        fail(429, "Помощник занят. Повторите позже");
      active++;
      perWidget.set(id, (perWidget.get(id) || 0) + 1);
      perClient.set(client, (perClient.get(client) || 0) + 1);
      const controller = new AbortController(),
        aborted = () => controller.abort();
      req.once("aborted", aborted);
      res.once("close", aborted);
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(60000),
      ]);
      try {
        const result = await search.answer(
          {
            query: input.query as string,
            ...(widget.materialIds.length
              ? { allowedMaterialIds: widget.materialIds }
              : {}),
          },
          () => false,
          signal,
        );
        if (signal.aborted) {
          if (!res.destroyed)
            json(res, 408, {
              error: "Запрос отменён",
              answer: "",
              sources: [],
            });
          return true;
        }
        const current = read(id);
        if (
          !current ||
          current.state !== "published" ||
          current.revision !== widget.revision ||
          store.setting("closed") === "true"
        ) {
          json(res, 200, {
            status: "changed",
            answer: "",
            sources: [],
            message: "Доступ к помощнику изменился. Обновите страницу.",
          });
          return true;
        }
        json(res, 200, {
          ...result,
          sources: result.sources.map((source) => ({
            ...source,
            url: new URL(source.url, requestOrigin(req)).href,
          })),
        });
        return true;
      } finally {
        active--;
        perWidget.set(id, (perWidget.get(id) || 1) - 1);
        perClient.set(client, (perClient.get(client) || 1) - 1);
        if (!perWidget.get(id)) perWidget.delete(id);
        if (!perClient.get(client)) perClient.delete(client);
        req.off("aborted", aborted);
        res.off("close", aborted);
      }
    } catch (error) {
      if (!res.headersSent && !res.destroyed)
        json(res, error instanceof WidgetError ? error.status : 500, {
          error:
            error instanceof WidgetError
              ? error.message
              : "Помощник временно недоступен",
        });
      return true;
    }
  };
}
