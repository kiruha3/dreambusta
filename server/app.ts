import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  Store,
  MaterialConflictError,
  DuplicateMaterialError,
} from "./store.ts";
import {
  getSession,
  hashPassword,
  verifyPassword,
  login,
  logout,
} from "./auth.ts";
import type { Material } from "../shared/types.ts";
import { isKnowledge } from "../shared/knowledge.ts";
import { upload, serveFile } from "./uploads.ts";
import { Shares, resolveLink, validateImportOptions } from "./shares.ts";
import { saveCover } from "./covers.ts";
import { cleanHtml, plainParagraphs } from "./processing.ts";
import { marked } from "marked";
import { createSourceFetcher } from "./sources/network.ts";
import { readTrustedSourceOrigins } from "./sources/config.ts";
import { SearchService } from "./search/service.ts";
import type { Models } from "./search/models.ts";
import { LocalModels } from "./search/models.ts";
import { ModelManagement, ModelManagementError } from "./search/management.ts";
import type { SearchQuery } from "../shared/search.ts";
import { createWidgetHandler } from "./widgets.ts";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
export async function readJson(req: IncomingMessage) {
  let n = 0;
  const parts: Buffer[] = [];
  for await (const chunk of req) {
    n += chunk.length;
    if (n > 1024 * 1024) throw new HttpError(413, "Слишком большой запрос");
    parts.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString() || "{}");
  } catch {
    throw new HttpError(400, "Некорректный JSON");
  }
}
function editable(body: Record<string, unknown>): Partial<Material> {
  const p: Partial<Material> = {};
  for (const key of ["title", "author", "description", "slug"] as const)
    if (key in body) {
      if (
        typeof body[key] !== "string" ||
        (body[key] as string).length > (key === "description" ? 10000 : 300)
      )
        throw new HttpError(400, "Проверьте длину и формат полей");
      p[key] = (body[key] as string).trim();
    }
  if ("title" in p && !p.title) throw new HttpError(400, "Укажите название");
  for (const key of ["visible", "downloadable", "knowledge"] as const)
    if (key in body) {
      if (typeof body[key] !== "boolean")
        throw new HttpError(400, "Ожидалось логическое значение");
      p[key] = body[key];
    }
  if ("tags" in body) {
    if (
      !Array.isArray(body.tags) ||
      body.tags.length > 30 ||
      body.tags.some((x) => typeof x !== "string" || x.length > 100)
    )
      throw new HttpError(400, "Проверьте теги");
    p.tags = body.tags;
  }
  return p;
}
export function publicMaterial(m: Material, summary = false) {
  const { files, ...data } = m;
  return {
    ...data,
    files: Object.fromEntries(
      Object.entries(files).map(([key, { name, mime, size }]) => [
        key,
        { name, mime, size },
      ]),
    ),
    ...(summary ? { paragraphs: [], html: "", pages: [] } : {}),
  };
}
export function createApp({
  dataDir,
  searchModels,
}: {
  dataDir: string;
  searchModels?: Models | false;
}) {
  const sourceFetcher = createSourceFetcher(readTrustedSourceOrigins(dataDir));
  const store = new Store(dataDir);
  const shares = new Shares(store, dataDir, sourceFetcher);
  const search = new SearchService(store, {
    models:
      searchModels === false
        ? new LocalModels({ enabled: false })
        : searchModels,
    dataDir,
  });
  const modelManagement =
    search.models instanceof LocalModels
      ? new ModelManagement(store, search, search.models)
      : undefined;
  const answerAttempts = new Map<string, { since: number; count: number }>();
  const handleWidget = createWidgetHandler({ store, search });
  let activeAnswers = 0;
  const attempts = new Map<string, { count: number; time: number }>();
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (await handleWidget(req, res, url)) return;
      const parts = url.pathname
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent);
      const method = req.method || "GET";
      if (parts[0] !== "api") throw new HttpError(404, "Не найдено");
      const session = getSession(store, req);
      const editor = !!session;
      const closed = store.setting("closed") === "true";
      const setupRequired = !store.db
        .prepare("SELECT 1 FROM users LIMIT 1")
        .get();
      const mutate = !["GET", "HEAD"].includes(method);
      const searchAnswer =
        parts[1] === "search" && parts[2] === "answer" && method === "POST";
      if (mutate && req.headers.origin) {
        const origin = new URL(req.headers.origin);
        if (
          origin.host !== req.headers.host ||
          !["http:", "https:"].includes(origin.protocol)
        )
          throw new HttpError(403, "Чужой источник запроса");
      }
      if (parts[1] === "session" && method === "GET")
        return json(res, 200, { setupRequired, editor, closed, ...session });
      if (["setup", "login"].includes(parts[1]) && method === "POST") {
        if (parts[1] === "setup") {
          if (!setupRequired) throw new HttpError(409, "Редактор уже создан");
          const forwardedClient = req.headers["x-dreambusta-client"];
          if (
            forwardedClient &&
            (typeof forwardedClient !== "string" ||
              !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
                forwardedClient,
              ))
          )
            throw new HttpError(
              403,
              "Создайте первого редактора с этого компьютера",
            );
          if (
            !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
              req.socket.remoteAddress || "",
            )
          )
            throw new HttpError(
              403,
              "Создайте первого редактора с этого компьютера",
            );
          const host = (req.headers.host || "").split(":")[0];
          if (!["localhost", "127.0.0.1", "["].includes(host))
            throw new HttpError(
              403,
              "Откройте localhost для первоначальной настройки",
            );
        }
        const key = req.socket.remoteAddress || "";
        const old = attempts.get(key);
        const current =
          old && old.time > Date.now() - 600000
            ? old
            : { count: 0, time: Date.now() };
        if (++current.count > 20)
          throw new HttpError(
            429,
            "Слишком много попыток. Повторите через 10 минут",
          );
        if (attempts.size > 1000) attempts.clear();
        attempts.set(key, current);
        const body = await readJson(req);
        const email = String(body.email || "")
          .trim()
          .toLowerCase();
        const password = body.password;
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 254 ||
          typeof password !== "string" ||
          password.length < 12 ||
          password.length > 256
        )
          throw new HttpError(
            400,
            "Нужны email и пароль длиной от 12 до 256 символов",
          );
        if (parts[1] === "setup")
          store.transaction(() => {
            if (store.db.prepare("SELECT 1 FROM users LIMIT 1").get())
              throw new HttpError(409, "Редактор уже создан");
            store.db
              .prepare("INSERT INTO users VALUES (?,?)")
              .run(email, hashPassword(password));
          });
        else {
          const user = store.db
            .prepare("SELECT hash FROM users WHERE email=?")
            .get(email);
          if (!user || !verifyPassword(password, user.hash as string))
            throw new HttpError(401, "Неверный email или пароль");
        }
        attempts.delete(key);
        return json(
          res,
          parts[1] === "setup" ? 201 : 200,
          login(store, req, res, email),
        );
      }
      if (mutate && (!searchAnswer || editor)) {
        if (!editor) throw new HttpError(401, "Войдите как редактор");
        if (req.headers["x-csrf-token"] !== session.csrf)
          throw new HttpError(
            403,
            "Обновите страницу: проверка сессии не пройдена",
          );
      } else if (closed && !editor)
        throw new HttpError(401, "Библиотека доступна после входа");
      if (parts[1] === "ai") {
        if (!editor) throw new HttpError(401, "Войдите как редактор");
        if (!modelManagement)
          throw new HttpError(
            503,
            "Управление Ollama недоступно для внешнего адаптера моделей",
          );
        if (parts.length === 2 && method === "GET")
          return json(res, 200, await modelManagement.status());
        if (parts.length === 3 && parts[2] === "settings" && method === "PATCH")
          return json(
            res,
            200,
            await modelManagement.configure(await readJson(req)),
          );
        if (parts.length === 3 && parts[2] === "pull" && method === "POST")
          return json(
            res,
            202,
            modelManagement.startPull((await readJson(req)).model),
          );
        if (parts.length === 3 && parts[2] === "pull" && method === "DELETE")
          return json(res, 200, modelManagement.cancelPull());
        if (parts.length === 3 && parts[2] === "unload" && method === "POST") {
          await modelManagement.unload((await readJson(req)).model);
          return json(res, 200, { ok: true });
        }
        if (
          parts.length === 3 &&
          parts[2] === "models" &&
          method === "DELETE"
        ) {
          await modelManagement.delete((await readJson(req)).model);
          return json(res, 200, { ok: true });
        }
        throw new HttpError(404, "Не найдено");
      }
      if (parts[1] === "search" && (method === "GET" || searchAnswer)) {
        const raw = searchAnswer
          ? await readJson(req)
          : Object.fromEntries(url.searchParams);
        const query = raw.query ?? raw.q;
        if (typeof query !== "string" || query.trim().length > 300)
          throw new HttpError(
            400,
            "Запрос должен содержать не более 300 символов",
          );
        const options: SearchQuery = { query: query.trim() };
        if (raw.kind !== undefined && raw.kind !== "") {
          if (
            !["book", "document", "presentation", "video", "audio"].includes(
              raw.kind,
            )
          )
            throw new HttpError(400, "Неизвестный тип материала");
          options.kind = raw.kind;
        }
        for (const key of ["material", "collection"] as const)
          if (raw[key] !== undefined) {
            if (typeof raw[key] !== "string" || raw[key].length > 200)
              throw new HttpError(400, "Некорректная область поиска");
            options[key] = raw[key];
          }
        for (const key of ["offset", "limit"] as const)
          if (raw[key] !== undefined) {
            const n = Number(raw[key]);
            if (
              !Number.isSafeInteger(n) ||
              n < 0 ||
              (key === "limit" && (n < 1 || n > 50)) ||
              n > 1000000
            )
              throw new HttpError(400, "Некорректная страница поиска");
            options[key] = n;
          }
        const access = () => {
          const current = !!getSession(store, req);
          if (store.setting("closed") === "true" && !current)
            throw new HttpError(401, "Библиотека доступна после входа");
          return current;
        };
        const controller = new AbortController();
        const cancel = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on("close", cancel);
        try {
          if (!searchAnswer) {
            const result = await search.search(
              options,
              access(),
              controller.signal,
            );
            const nowEditor = access();
            // Access may have changed while query embedding was running.
            if (nowEditor !== editor)
              return json(
                res,
                200,
                await search.search(options, nowEditor, controller.signal),
              );
            return json(res, 200, result);
          }
          const key = String(
            req.headers["x-dreambusta-client"] ||
              req.socket.remoteAddress ||
              "",
          );
          const old = answerAttempts.get(key);
          const attempt =
            old && old.since > Date.now() - 300000
              ? old
              : { since: Date.now(), count: 0 };
          if (++attempt.count > 15 || activeAnswers >= 2)
            throw new HttpError(
              429,
              "Слишком много запросов к модели. Повторите немного позже.",
            );
          if (answerAttempts.size > 1000) answerAttempts.clear();
          answerAttempts.set(key, attempt);
          activeAnswers++;
          try {
            const answer = await search.answer(
              options,
              access,
              controller.signal,
            );
            access();
            return json(res, 200, answer);
          } finally {
            activeAnswers--;
          }
        } finally {
          res.off("close", cancel);
        }
      }
      if (parts[1] === "logout" && method === "POST") {
        logout(store, req, res);
        return json(res, 200, { ok: true });
      }
      if (parts[1] === "uploads" && method === "POST")
        return json(
          res,
          201,
          publicMaterial(
            await upload(
              req,
              store,
              dataDir,
              url.searchParams.get("name") || "",
            ),
          ),
        );
      if (parts[1] === "links" && method === "POST") {
        const b = await readJson(req);
        if (
          typeof b.url !== "string" ||
          b.url.length > 4096 ||
          (b.title && (typeof b.title !== "string" || b.title.length > 300))
        )
          throw new HttpError(400, "Проверьте ссылку и название");
        if (parts[2] === "preview") return json(res, 200, resolveLink(b.url));
        if (parts[2] === "navigation")
          return json(res, 200, await shares.navigation(b.url));
        const options = validateImportOptions(b.importOptions);
        return json(
          res,
          201,
          publicMaterial(await shares.add(b.url, b.title, options)),
        );
      }
      if (parts[1] === "settings") {
        if (!editor) throw new HttpError(401, "Войдите как редактор");
        if (method === "PATCH") {
          const b = await readJson(req);
          if (
            ("closed" in b && typeof b.closed !== "boolean") ||
            !("closed" in b || "sidebarMaterialIds" in b)
          )
            throw new HttpError(400, "Некорректная настройка");
          if (
            "sidebarMaterialIds" in b &&
            (!Array.isArray(b.sidebarMaterialIds) ||
              b.sidebarMaterialIds.length > 30 ||
              b.sidebarMaterialIds.some(
                (id: unknown) =>
                  typeof id !== "string" ||
                  !store.listMaterials().some((m) => m.id === id),
              ))
          )
            throw new HttpError(400, "Выберите до 30 существующих материалов");
          store.transaction(() => {
            if ("closed" in b) store.setSetting("closed", String(b.closed));
            if ("sidebarMaterialIds" in b)
              store.setSetting(
                "sidebarMaterialIds",
                JSON.stringify([...new Set(b.sidebarMaterialIds)]),
              );
          });
        }
        return json(res, 200, {
          closed: store.setting("closed") === "true",
          sidebarMaterialIds: JSON.parse(
            store.setting("sidebarMaterialIds", "[]"),
          ),
        });
      }
      if (parts[1] === "navigation" && method === "GET") {
        const ids: string[] = JSON.parse(
          store.setting("sidebarMaterialIds", "[]"),
        );
        const materials = store.listMaterials();
        return json(res, 200, {
          materials: ids.flatMap((id) => {
            const m = materials.find(
              (m) =>
                m.id === id &&
                (editor || m.visible) &&
                m.state === "ready" &&
                m.source.status !== "removed",
            );
            return m
              ? [{ id: m.id, slug: m.slug, title: m.title, kind: m.kind }]
              : [];
          }),
        });
      }
      if (parts[1] === "materials") {
        if (!parts[2]) {
          if (method === "GET")
            return json(
              res,
              200,
              store
                .listMaterials()
                .filter((m) => editor || m.visible)
                .filter(
                  (m) =>
                    url.searchParams.get("section") !== "knowledge" ||
                    isKnowledge(m),
                )
                .map((m) => publicMaterial(m, true)),
            );
          if (method === "POST") {
            const b = await readJson(req);
            const p = editable(b);
            if (!p.title) throw new HttpError(400, "Укажите название");
            return json(
              res,
              201,
              publicMaterial(
                store.createMaterial({
                  ...p,
                  title: p.title,
                  kind: "document",
                  source: { type: "file" },
                }),
              ),
            );
          }
        }
        const m = store.resolveMaterial(parts[2]);
        if (!editor && !m.visible)
          throw new HttpError(404, "Материал не найден");
        if (parts[3] === "file" && ["GET", "HEAD"].includes(method))
          return serveFile(req, res, m, parts[4], dataDir, editor);
        if (parts[3] === "cover" && method === "POST")
          return json(
            res,
            200,
            publicMaterial(await saveCover(req, store, m, dataDir)),
          );
        if (parts[3] === "transcript" && method === "PUT") {
          if (!["video", "audio"].includes(m.kind))
            throw new HttpError(400, "Расшифровка доступна для видео и аудио");
          const b = await readJson(req);
          if (typeof b.markdown !== "string")
            throw new HttpError(400, "Укажите текст Markdown");
          const html = cleanHtml(await marked(b.markdown));
          const paragraphs = plainParagraphs(html);
          const representations = m.representations.filter(
            (r) => !["article", "text"].includes(r),
          );
          if (paragraphs.length) representations.push("article", "text");
          const updated = store.updateMaterial(
            m.id,
            {
              html,
              paragraphs,
              representations,
              wordCount: paragraphs.join(" ").split(/\s+/).filter(Boolean)
                .length,
              textVersion: m.textVersion + 1,
            },
            m.revision,
          );
          store.setSetting(`transcript:${m.id}`, b.markdown);
          return json(res, 200, publicMaterial(updated));
        }
        if (parts[3] === "transcript" && method === "GET" && editor)
          return json(res, 200, {
            markdown: store.setting(`transcript:${m.id}`),
          });
        if (parts[3] === "version" && method === "POST")
          return json(
            res,
            200,
            publicMaterial(
              await upload(
                req,
                store,
                dataDir,
                url.searchParams.get("name") || "",
                m,
              ),
            ),
          );
        if (parts[3] === "refresh" && method === "POST")
          return json(res, 200, publicMaterial(await shares.refresh(m.id)));
        if (parts[3] === "finish-unavailable" && method === "POST")
          return json(res, 200, publicMaterial(shares.finishUnavailable(m.id)));
        if (method === "GET") return json(res, 200, publicMaterial(m));
        if (method === "PATCH")
          return json(
            res,
            200,
            publicMaterial(
              store.updateMaterial(m.id, editable(await readJson(req))),
            ),
          );
        if (method === "DELETE") {
          store.deleteMaterial(m.id);
          return json(res, 200, { ok: true });
        }
      }
      if (parts[1] === "collections") {
        if (method === "GET") {
          const list = parts[2]
            ? [store.resolveCollection(parts[2])]
            : store.listCollections();
          const filtered = list
            .filter((c) => editor || c.visible)
            .map((c) => ({
              ...c,
              materialIds: c.materialIds.filter((id) => {
                try {
                  return editor || store.resolveMaterial(id).visible;
                } catch {
                  return false;
                }
              }),
            }));
          if (parts[2] && !filtered[0])
            throw new HttpError(404, "Подборка не найдена");
          return json(res, 200, parts[2] ? filtered[0] : filtered);
        }
        if (method === "DELETE" && parts[2]) {
          store.deleteCollection(store.resolveCollection(parts[2]).id);
          return json(res, 200, { ok: true });
        }
        if (method === "POST" || method === "PATCH") {
          const b = await readJson(req);
          const p = editable(b);
          if (
            !p.title ||
            !Array.isArray(b.materialIds) ||
            b.materialIds.length > 1000 ||
            b.materialIds.some((x: unknown) => typeof x !== "string")
          )
            throw new HttpError(400, "Укажите название и список материалов");
          return json(
            res,
            method === "POST" ? 201 : 200,
            store.saveCollection({
              ...p,
              title: p.title,
              materialIds: b.materialIds,
              id: parts[2] ? store.resolveCollection(parts[2]).id : undefined,
            }),
          );
        }
      }
      throw new HttpError(404, "Не найдено");
    } catch (err) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const message = err instanceof Error ? err.message : "Ошибка сервера";
      json(
        res,
        err instanceof MaterialConflictError ||
          err instanceof DuplicateMaterialError
          ? 409
          : err instanceof HttpError || err instanceof ModelManagementError
            ? err.status
            : /не найден/i.test(message)
              ? 404
              : 400,
        { error: message },
      );
    }
  });
  server.on("close", () => {
    modelManagement?.close();
    void search.close();
  });
  return { server, store, search, modelManagement };
}
