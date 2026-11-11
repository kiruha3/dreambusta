import { parseHTML } from "linkedom";
import { marked } from "marked";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  MaterialConflictError,
  DuplicateMaterialError,
  type Store,
  slugify,
} from "./store.ts";
import type {
  Material,
  Kind,
  PublicationNode,
  PublicationIcon,
  ShareImportOptions,
} from "../shared/types.ts";
import { cleanHtml, plainParagraphs } from "./processing.ts";
import { fetchPublic } from "./sources/network.ts";
import type { FetchPublic, Remote } from "./sources/network.ts";
import { MAX_PUBLICATION_PAGES } from "../shared/publication.ts";

import {
  buildinArticle,
  buildinBlocks,
  buildinMenuRoot,
  buildinNavigation,
} from "./sources/buildin.ts";
import { cleanIconSvg } from "./sources/icon-svg.ts";

type PublicationBudget = { bytes: number; responses?: Map<string, Remote> };
type PublicationTree = PublicationBudget & {
  visited: Set<string>;
  count: number;
  rootUrl: string;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function resolveLink(value: string) {
  const url = new URL(value);
  url.hash = "";
  const h = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Нужен HTTP(S) адрес без пароля");
  const p = url.pathname;
  let provider = "";
  let kind: Kind = "document";
  let embed = "";
  let type: "share" | "link" = "link";
  if (h === "youtu.be" || h === "youtube.com" || h === "m.youtube.com") {
    const id =
      h === "youtu.be"
        ? p.split("/")[1]
        : url.searchParams.get("v") || p.split("/").filter(Boolean).pop();
    if (!id || !/^[\w-]{11}$/.test(id))
      throw new Error("Укажите ссылку на отдельное видео YouTube");
    provider = "youtube";
    kind = "video";
    embed = `https://www.youtube-nocookie.com/embed/${id}`;
  } else if (h === "rutube.ru") {
    const id = /\/(?:video|play\/embed)\/([a-z0-9]+)/i.exec(p)?.[1];
    if (!id) throw new Error("Укажите ссылку на отдельное видео Rutube");
    provider = "rutube";
    kind = "video";
    embed = `https://rutube.ru/play/embed/${id}`;
  } else if (["vk.com", "vkvideo.ru"].includes(h)) {
    const match = /video(-?\d+)_(\d+)/.exec(p);
    const oid = match?.[1] || url.searchParams.get("oid");
    const id = match?.[2] || url.searchParams.get("id");
    if (!oid || !id || !/^-?\d+$/.test(oid) || !/^\d+$/.test(id))
      throw new Error("Укажите публичную ссылку на видео VK");
    provider = "vk";
    kind = "video";
    embed = `https://vk.com/video_ext.php?oid=${oid}&id=${id}`;
  } else if (/\.(mp4|webm|mov|m4v)$/i.test(p)) {
    provider = "direct";
    kind = "video";
    embed = url.href;
  } else if (/\.(mp3|m4a|ogg|oga|wav|flac)$/i.test(p)) {
    provider = "direct";
    kind = "audio";
    embed = url.href;
  } else if (h === "buildin.ai" && /^\/share\/[^/]+\/?$/.test(p)) {
    provider = "buildin";
    type = "share";
    url.hostname = "buildin.ai";
    url.protocol = "https:";
    url.search = "";
  } else if (/^\/shared\/(?:d\/|s\/|kb\/|meetings\/)?[^/]+\/?$/.test(p)) {
    provider = "techhelper";
    type = "share";
  } else
    throw new Error(
      "Этот источник пока не поддерживается. Используйте TechHelper, Buildin, ссылку на видео или прямой медиафайл.",
    );
  if (type === "share") url.pathname = url.pathname.replace(/\/$/, "");
  return { url: url.href, provider, kind, embed, type };
}
export function validateImportOptions(value: unknown): ShareImportOptions {
  if (value === undefined) return { scope: "branch" };
  const o = value as ShareImportOptions;
  if (
    !o ||
    !["article", "branch", "menu"].includes(o.scope) ||
    (o.selectedUrls !== undefined &&
      (o.scope !== "menu" ||
        !Array.isArray(o.selectedUrls) ||
        !o.selectedUrls.length ||
        o.selectedUrls.length > MAX_PUBLICATION_PAGES ||
        o.selectedUrls.some((u) => typeof u !== "string" || u.length > 4096)))
  )
    throw new Error("Проверьте режим импорта и выбор страниц меню");
  return {
    scope: o.scope,
    ...(o.selectedUrls ? { selectedUrls: [...new Set(o.selectedUrls)] } : {}),
  };
}
function richHtml(node: any): string {
  if (typeof node === "string") return esc(node);
  if (Array.isArray(node)) return node.map(richHtml).join("");
  if (!node || typeof node !== "object") return "";
  if (typeof node.text === "string") {
    let s = esc(node.text);
    const marks = node.marks?.map((m: any) => m.type) || [];
    if (node.bold || marks.includes("bold")) s = `<strong>${s}</strong>`;
    if (node.italic || marks.includes("italic")) s = `<em>${s}</em>`;
    return s;
  }
  const inner = richHtml(node.children || node.content || []);
  const types: Record<string, string> = {
    paragraph: "p",
    heading: `h${Math.min(6, Math.max(1, Number(node.attrs?.level) || 2))}`,
    "heading-one": "h1",
    "heading-two": "h2",
    blockquote: "blockquote",
    bulletList: "ul",
    orderedList: "ol",
    listItem: "li",
    table: "table",
    tableRow: "tr",
    "table-row": "tr",
    tableCell: "td",
    "table-cell": "td",
    tableHeader: "th",
    codeBlock: "pre",
  };
  if (node.type === "image")
    return `<img src="${esc(node.attrs?.src || node.url)}" alt="${esc(node.attrs?.alt)}">`;
  if (node.type === "hardBreak") return "<br>";
  const tag = types[node.type];
  return tag ? `<${tag}>${inner}</${tag}>` : inner;
}
export class Shares {
  store: Store;
  dataDir: string;
  get: FetchPublic;
  constructor(store: Store, dataDir: string, get: FetchPublic = fetchPublic) {
    this.store = store;
    this.dataDir = dataDir;
    this.get = get;
  }
  async readPublication(target: string, budget: PublicationBudget) {
    const cached = budget.responses?.get(target);
    if (cached) return cached;
    const response = await this.get(target);
    budget.bytes += response.body.length;
    if (budget.bytes > 100 * 1024 * 1024)
      throw new Error("Публикация с разделами превышает 100 МБ");
    budget.responses?.set(target, response);
    return response;
  }
  async saveIcon(
    icon: PublicationIcon | undefined,
    source: string,
    budget: { bytes: number },
    files: Material["files"],
  ) {
    if (!icon || icon.type === "emoji") return icon;
    let url = icon.value;
    if (url.startsWith("s3/")) {
      const page = new URL(source).pathname.split("/")[2];
      const response = await this.get(
        "https://buildin.ai/api/file/create_urls",
        256 * 1024,
        { json: { batch: [{ blockId: page, ossName: url, isPublic: false }] } },
      );
      budget.bytes += response.body.length;
      if (response.status !== 200)
        throw new Error("Не удалось получить публичную иконку Buildin");
      const data = JSON.parse(response.body.toString());
      const asset = data.code === 200 && data.data?.[0];
      url = typeof asset === "string" ? asset : asset?.url;
      if (typeof url !== "string" || !/^https?:\/\//.test(url))
        throw new Error("Публичная иконка Buildin недоступна");
    }
    const assetUrl = new URL(url);
    if (
      ["cdn2.buildin.ai", "buildin-attach.flowus.space"].includes(
        assetUrl.hostname,
      ) &&
      /\.(png|jpe?g|webp|gif)$/i.test(assetUrl.pathname)
    )
      assetUrl.searchParams.set(
        "x-oss-process",
        "image/resize,w_128/quality,q_90",
      );
    const response = await this.get(assetUrl.href, /\.svg$/i.test(assetUrl.pathname) ? 2 * 1024 * 1024 : 256 * 1024);
    budget.bytes += response.body.length;
    if (budget.bytes > 100 * 1024 * 1024)
      throw new Error("Публикация с разделами превышает 100 МБ");
    const mime = response.contentType.split(";")[0];
    if (
      response.status !== 200 ||
      ![
        "image/svg+xml",
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
      ].includes(mime)
    )
      throw new Error("Источник не предоставил изображение иконки");
    const body =
      mime === "image/svg+xml"
        ? cleanIconSvg(response.body.toString("utf8"))
        : response.body;
    const directory = randomUUID();
    const key = `icon-${directory}`;
    const path = `snapshots/${directory}/${key}`;
    mkdirSync(join(this.dataDir, "snapshots", directory), { recursive: true });
    writeFileSync(join(this.dataDir, path), body);
    files[key] = { path, name: key, mime, size: body.length };
    return { type: "image" as const, value: `snapshot:${key}` };
  }
  async navigation(
    value: string,
    budget: PublicationBudget = { bytes: 0, responses: new Map() },
  ): Promise<PublicationNode[]> {
    const d = resolveLink(value);
    if (d.type !== "share")
      throw new Error("Меню доступно для опубликованных статей");
    const read = async (target: string) => {
      const response = await this.readPublication(target, budget);
      if (response.status !== 200)
        throw new Error(
          `Не удалось получить публичное меню: HTTP ${response.status}`,
        );
      if (!response.contentType.includes("json"))
        throw new Error("Источник не предоставил публичное меню");
      return response.body.toString("utf8");
    };
    const u = new URL(d.url);
    if (d.provider === "buildin") {
      const id = u.pathname.split("/")[2];
      const blocks = buildinBlocks(
        await read(`${u.origin}/api/docs/${encodeURIComponent(id)}`),
        id,
      );
      const root = buildinMenuRoot(blocks, id);
      const pending = [root];
      const queued = new Set(pending);
      const pages = new Map<
        string,
        { node: PublicationNode; children: string[] }
      >();
      // The anonymous endpoint supplies only part of the tree. Hydrate every
      // publicly linked page, without enumerating the source workspace.
      while (pending.length) {
        const batch = pending.splice(0, 4);
        const loaded = await Promise.all(
          batch.map(async (pageId) => {
            const pageBlocks = pageId === id ? blocks : buildinBlocks(
              await read(`${u.origin}/api/docs/${encodeURIComponent(pageId)}`),
              pageId,
            );
            const nodes = buildinNavigation(pageBlocks, pageId);
            return {
              node: nodes[0],
              children: nodes
                .filter((n) => n.parentSourceUrl === nodes[0].sourceUrl)
                .map((n) => n.sourceUrl),
            };
          }),
        );
        for (const page of loaded) {
          pages.set(page.node.sourceUrl, page);
          for (const child of page.children) {
            const childId = new URL(child).pathname.split("/")[2];
            if (queued.has(childId)) continue;
            if (queued.size >= MAX_PUBLICATION_PAGES)
              throw new Error(`В публикации больше ${MAX_PUBLICATION_PAGES} страниц. Выберите меньшую ветку.`);
            queued.add(childId);
            pending.push(childId);
          }
        }
      }
      const nodes: PublicationNode[] = [];
      const seen = new Set<string>();
      const walk = (sourceUrl: string, parentSourceUrl?: string) => {
        if (seen.has(sourceUrl)) return;
        seen.add(sourceUrl);
        const page = pages.get(sourceUrl)!;
        nodes.push({ ...page.node, parentSourceUrl });
        for (const child of page.children) walk(child, sourceUrl);
      };
      walk(`https://buildin.ai/share/${encodeURIComponent(root)}`);
      return nodes;
    }
    // The share token is the public boundary; page_id only selects a page
    // within it. Never call an authenticated workspace endpoint.
    u.searchParams.delete("page_id");
    const nodes: PublicationNode[] = [];
    const seen = new Set<string>();
    const walk = async (target: URL, parent?: string) => {
      const data = JSON.parse(
        await read(`${target.origin}/api${target.pathname}/${target.search}`),
      );
      const identity = String(data.id ?? target.href);
      if (seen.has(identity)) return;
      if (nodes.length >= MAX_PUBLICATION_PAGES)
        throw new Error(
          `В публикации больше ${MAX_PUBLICATION_PAGES} страниц. Выберите меньшую ветку.`,
        );
      seen.add(identity);
      nodes.push({
        sourceUrl: target.href,
        parentSourceUrl: parent,
        title: data.title || data.name || "Публикация",
      });
      for (const c of data.children || []) {
        if (!Number.isSafeInteger(c.id) || c.id <= 0 || seen.has(String(c.id)))
          continue;
        const child = new URL(u);
        child.searchParams.set("page_id", String(c.id));
        await walk(child, target.href);
      }
    };
    await walk(u);
    return nodes;
  }
  async snapshot(
    value: string,
    atomic: boolean,
    options: ShareImportOptions,
  ): Promise<Partial<Material>> {
    const d = resolveLink(value);
    const tree = {
      visited: new Set<string>(),
      bytes: 0,
      count: 0,
      rootUrl: d.url,
      responses: new Map<string, Remote>(),
    };
    if (options.scope !== "menu")
      return this.publication(value, atomic, tree, options.scope);
    const menu = await this.navigation(value, tree);
    const allowed = new Set(menu.map((n) => n.sourceUrl));
    const selected = new Set(options.selectedUrls || allowed);
    if ([...selected].some((u) => !allowed.has(u)))
      throw new Error("Выбор страниц не соответствует публичному меню");
    selected.add(d.url);
    const root = await this.publication(value, atomic, tree, "article");
    const pages: NonNullable<Material["pages"]> = [];
    const navigation: PublicationNode[] = [];
    for (const node of menu) {
      if (!selected.has(node.sourceUrl)) continue;
      let parent = node.parentSourceUrl;
      const seen = new Set<string>();
      while (parent && !selected.has(parent) && !seen.has(parent)) {
        seen.add(parent);
        parent = menu.find((n) => n.sourceUrl === parent)?.parentSourceUrl;
      }
      if (node.sourceUrl === d.url) {
        navigation.push({
          ...node,
          parentSourceUrl: parent,
          ...(root.icon ? { icon: root.icon } : {}),
        });
        continue;
      }
      const page = await this.publication(
        node.sourceUrl,
        atomic,
        tree,
        "article",
      );
      navigation.push({
        ...node,
        parentSourceUrl: parent,
        ...(page.icon ? { icon: page.icon } : {}),
      });
      Object.assign(root.files!, page.files);
      root.warnings!.push(...(page.warnings || []));
      pages.push({
        sourceUrl: node.sourceUrl,
        parentSourceUrl: parent,
        slug: slugify(page.title!),
        title: page.title!,
        html: page.html!,
        paragraphs: page.paragraphs!,
        wordCount: page.wordCount!,
        ...(page.icon ? { icon: page.icon } : {}),
      });
    }
    if (!navigation.some((n) => n.sourceUrl === d.url))
      navigation.unshift({
        sourceUrl: d.url,
        title: root.title!,
        ...(root.icon ? { icon: root.icon } : {}),
      });
    const slugs = new Set<string>();
    for (const p of pages) {
      const base = p.slug;
      let i = 1;
      while (slugs.has(p.slug)) p.slug = `${base}-${++i}`;
      slugs.add(p.slug);
    }
    return {
      ...root,
      pages,
      navigation,
      warnings: [...new Set(root.warnings)],
      pageAddresses: Object.fromEntries(
        pages.map((p) => [p.slug, p.sourceUrl]),
      ),
    };
  }
  async publication(
    value: string,
    atomic = false,
    tree: PublicationTree = {
      visited: new Set<string>(),
      bytes: 0,
      count: 0,
      rootUrl: resolveLink(value).url,
      responses: new Map(),
    },
    scope: "article" | "branch" = "branch",
  ): Promise<Partial<Material>> {
    const d = resolveLink(value);
    if (++tree.count > MAX_PUBLICATION_PAGES)
      throw new Error(
        `В публикации больше ${MAX_PUBLICATION_PAGES} страниц. Выберите меньшую ветку.`,
      );
    const u = new URL(d.url);
    tree.visited.add(d.url);
    let api = value;
    if (d.provider === "buildin")
      api = `${u.origin}/api/docs/${encodeURIComponent(u.pathname.split("/")[2])}`;
    if (d.provider === "techhelper")
      api = `${u.origin}/api${u.pathname.replace(/\/$/, "")}/${u.search}`;
    const response = await this.readPublication(api, tree);
    if ([401, 403, 404, 410].includes(response.status))
      throw Object.assign(new Error("Источник закрыл или удалил публикацию"), {
        unavailable: true,
      });
    if (response.status !== 200)
      throw new Error(`Источник ответил HTTP ${response.status}`);
    let title = "";
    let html = "";
    let warnings: string[] = [];
    const files: Material["files"] = {};
    const extra: Partial<Material> = {};
    let sourceIcon: PublicationIcon | undefined;
    let linkIcons: ReturnType<typeof buildinArticle>["linkIcons"] = [];
    const visual: Material["representations"] = [];
    const children: { url: string; title: string }[] = [];
    const body = response.body.toString("utf8");
    if (response.contentType.includes("json")) {
      if (d.provider === "buildin") {
        const built = buildinArticle(
          buildinBlocks(body, u.pathname.split("/")[2]),
          u.pathname.split("/")[2],
        );
        ({ title, html, warnings } = built);
        sourceIcon = built.icon;
        linkIcons = built.linkIcons;
        children.push(...built.children);
      } else {
        const data = JSON.parse(body);
        title = data.title || data.name || "Публикация TechHelper";
        if (/^\/shared\/kb\//.test(u.pathname)) {
          if (Number.isSafeInteger(data.id))
            extra.sourcePageId = String(data.id);
          const alias = new URL(d.url);
          alias.searchParams.set("page_id", String(data.id));
          tree.visited.add(alias.href);
          if (Array.isArray(data.children))
            children.push(
              ...data.children
                .filter((c: any) => Number.isSafeInteger(c.id) && c.id > 0)
                .map((c: any) => {
                  const target = new URL(d.url);
                  target.searchParams.set("page_id", String(c.id));
                  return { url: target.href, title: c.title };
                }),
            );
        }
        const content = data.version_content || data.content;
        html =
          data.content_html ||
          (data.content_md || typeof content === "string"
            ? await marked(data.content_md || content)
            : richHtml(content));
        if (!html && data.transcript)
          html = await marked(
            typeof data.transcript === "string"
              ? data.transcript
              : richHtml(data.transcript),
          );
        const viewer = data.file_info?.viewer;
        if (viewer === "pdf") {
          const previewUrl = new URL(api);
          previewUrl.pathname += "file-source/";
          previewUrl.search = "?variant=preview";
          try {
            const preview = await this.get(previewUrl.href);
            if (
              preview.status !== 200 ||
              !preview.contentType.startsWith("application/pdf") ||
              !preview.body.subarray(0, 5).equals(Buffer.from("%PDF-"))
            )
              throw new Error("Нет опубликованного PDF");
            tree.bytes += preview.body.length;
            if (tree.bytes > 100 * 1024 * 1024)
              throw new Error("Публикация с разделами превышает 100 МБ");
            const id = randomUUID();
            const path = `snapshots/${id}/published.pdf`;
            mkdirSync(join(this.dataDir, "snapshots", id), { recursive: true });
            writeFileSync(join(this.dataDir, path), preview.body);
            files.pdf = {
              path,
              name: "published.pdf",
              size: preview.body.length,
              mime: "application/pdf",
            };
            visual.push("pdf");
          } catch {
            if (tree.bytes > 100 * 1024 * 1024)
              throw new Error("Публикация с разделами превышает 100 МБ");
            if (atomic)
              throw new Error(
                "Не удалось сохранить опубликованный PDF. Предыдущая версия целиком сохранена.",
              );
            warnings.push(
              "Опубликованный PDF недоступен. Сохранён только опубликованный текст, если он есть.",
            );
          }
        }
        if (viewer === "video" || viewer === "audio") {
          const mediaUrl = new URL(api);
          mediaUrl.pathname += "file-source/";
          mediaUrl.search = "?variant=preview";
          extra.mediaUrl = mediaUrl.href;
          extra.kind = viewer;
          visual.push(viewer);
          warnings.push(
            "Медиа загружается из опубликованного источника при воспроизведении. Сохранённый текст доступен независимо.",
          );
        }
      }
    } else {
      const { document } = parseHTML(body);
      const main =
        document.querySelector("article") || document.querySelector("main");
      if (!main) throw new Error("Не найдена основная опубликованная статья");
      main
        .querySelectorAll("nav,aside,script,style,header,footer,form")
        .forEach((n) => n.remove());
      title =
        main.querySelector("h1")?.textContent ||
        document.querySelector("title")?.textContent ||
        "Публикация";
      html = main.innerHTML;
    }
    // Resolve TechHelper's own link scheme before the generic HTML sanitizer
    // removes it. All links stay within the original public share token.
    const parsed = parseHTML(`<html><body>${html}</body></html>`).document;
    if (d.provider === "techhelper" && /^\/shared\/kb\//.test(u.pathname)) {
      for (const a of parsed.querySelectorAll('a[href^="kb://"]')) {
        const match = /^kb:\/\/(\d+)\/?(#[^\s]*)?$/.exec(
          a.getAttribute("href")!,
        );
        if (!match) {
          a.removeAttribute("href");
          continue;
        }
        const target = new URL(d.url);
        target.searchParams.set("page_id", match[1]);
        target.hash = match[2] || "";
        a.setAttribute("href", target.href);
      }
      // Some publications expose descendants only in the navigation response.
      for (const child of children) {
        const target = new URL(child.url);
        if (
          Array.from(parsed.querySelectorAll("a[href]")).some(
            (a) => a.getAttribute("href") === target.href,
          )
        )
          continue;
        const p = parsed.createElement("p");
        const a = parsed.createElement("a");
        a.setAttribute("href", target.href);
        a.textContent = child.title || "Раздел";
        p.appendChild(a);
        parsed.body.appendChild(p);
      }
    }
    // Markdown headings need stable fragment targets as well as preserved IDs
    // from HTML publications. Duplicate headings receive distinct anchors.
    const ids = new Set(
      Array.from(parsed.querySelectorAll("[id]")).map((el) => el.id),
    );
    for (const heading of parsed.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
      if (heading.id) continue;
      const base =
        (heading.textContent || "section")
          .toLowerCase()
          .trim()
          .replace(/[^\p{L}\p{N}_\s-]/gu, "")
          .replace(/\s+/g, "-") || "section";
      let id = base;
      let i = 1;
      while (ids.has(id)) id = `${base}-${++i}`;
      ids.add(id);
      heading.id = id;
    }
    html = cleanHtml(parsed.body.innerHTML);
    if (!plainParagraphs(html).length && !visual.length)
      throw new Error(
        "Источник не предоставил доступного опубликованного содержимого",
      );
    const { document } = parseHTML(`<html><body>${html}</body></html>`);
    for (const a of document.querySelectorAll("a[href]")) {
      try {
        if (a.getAttribute("href")!.startsWith("#")) continue;
        a.setAttribute("href", new URL(a.getAttribute("href")!, value).href);
      } catch {
        a.removeAttribute("href");
      }
    }
    const assets = Array.from(document.querySelectorAll("img[src]")).slice(
      0,
      30,
    );
    const directory = randomUUID();
    let total = 0;
    for (let i = 0; i < assets.length; i++) {
      const image = assets[i];
      try {
        const remote = await this.get(
          new URL(image.getAttribute("src")!, value).href,
          5 * 1024 * 1024,
        );
        const mime = remote.contentType.split(";")[0];
        if (
          remote.status !== 200 ||
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            mime,
          ) ||
          (total += remote.body.length) > 20 * 1024 * 1024
        )
          throw new Error("Ресурс не сохранён");
        tree.bytes += remote.body.length;
        if (tree.bytes > 100 * 1024 * 1024)
          throw new Error("Публикация с разделами превышает 100 МБ");
        const key =
          d.url !== tree.rootUrl ? `asset-${directory}-${i}` : `asset-${i}`;
        const dir = join(this.dataDir, "snapshots", directory);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, key), remote.body);
        files[key] = {
          path: `snapshots/${directory}/${key}`,
          name: key,
          mime,
          size: remote.body.length,
        };
        image.setAttribute("src", `snapshot:${key}`);
      } catch {
        if (tree.bytes > 100 * 1024 * 1024)
          throw new Error("Публикация с разделами превышает 100 МБ");
        if (atomic)
          throw new Error(
            "Не удалось сохранить изображение публикации. Предыдущая версия целиком сохранена.",
          );
        image.removeAttribute("src");
        warnings.push(
          "Одно из изображений не удалось сохранить; текст доступен.",
        );
      }
    }
    document.querySelectorAll("img[src]").forEach((el) => {
      if (!el.getAttribute("src")?.startsWith("snapshot:"))
        el.removeAttribute("src");
    });
    // Resolve controlled icon metadata after HTML sanitization; only locally
    // saved image bytes enter the article, never the source's expiring URL.
    for (const entry of linkIcons) {
      const marker = document.getElementById(entry.id);
      if (!marker) continue;
      try {
        const icon = await this.saveIcon(entry.icon, entry.sourceUrl, tree, files);
        if (!icon) { marker.remove(); continue; }
        const element = document.createElement(icon.type === "image" ? "img" : "span");
        element.className = "publication-link-icon";
        element.setAttribute("aria-hidden", "true");
        if (icon.type === "image") {
          element.setAttribute("src", icon.value);
          element.setAttribute("alt", "");
          element.setAttribute("width", "20");
          element.setAttribute("height", "20");
        } else element.textContent = icon.value;
        marker.replaceWith(element);
      } catch (error) {
        if (atomic || tree.bytes > 100 * 1024 * 1024) throw error;
        marker.remove();
        warnings.push("Иконку ссылки на раздел не удалось сохранить.");
      }
    }
    html = document.body.innerHTML;
    try {
      extra.icon =
        (await this.saveIcon(sourceIcon, d.url, tree, files)) || null;
    } catch (error) {
      if (atomic || tree.bytes > 100 * 1024 * 1024) throw error;
      warnings.push("Иконку страницы не удалось сохранить.");
      extra.icon = null;
    }
    const paragraphs = plainParagraphs(html);
    const pages: NonNullable<Material["pages"]> = [];
    const navigation: PublicationNode[] = [
      { sourceUrl: d.url, title, ...(extra.icon ? { icon: extra.icon } : {}) },
    ];
    if (scope === "branch")
      for (const child of children) {
        if (tree.visited.has(child.url)) continue;
        let saved: Partial<Material>;
        try {
          saved = await this.publication(child.url, atomic, tree, scope);
        } catch (error) {
          throw new Error(
            `Не удалось сохранить раздел «${child.title}»: ${error instanceof Error ? error.message : "ошибка источника"}. Предыдущая версия сохранена; повторите обновление позже.`,
          );
        }
        Object.assign(files, saved.files);
        warnings.push(...(saved.warnings || []));
        const childNavigation = saved.navigation || [];
        navigation.push(
          ...childNavigation.map((n, i) =>
            i === 0 ? { ...n, parentSourceUrl: d.url } : n,
          ),
        );
        if (navigation.length > MAX_PUBLICATION_PAGES)
          throw new Error(
            `В публикации больше ${MAX_PUBLICATION_PAGES} страниц. Выберите меньшую ветку.`,
          );
        pages.push(
          {
            sourceUrl: child.url,
            parentSourceUrl: d.url,
            slug: slugify(saved.title!),
            title: saved.title!,
            html: saved.html!,
            paragraphs: saved.paragraphs!,
            wordCount: saved.wordCount!,
            ...(saved.icon ? { icon: saved.icon } : {}),
          },
          ...(saved.pages || []),
        );
      }
    const slugs = new Set<string>();
    for (const page of pages) {
      const base = page.slug;
      let i = 1;
      while (slugs.has(page.slug)) page.slug = `${base}-${++i}`;
      slugs.add(page.slug);
    }
    return {
      title: title.trim().slice(0, 300),
      html,
      paragraphs,
      pages,
      navigation,
      pageAddresses: Object.fromEntries(
        pages.map((p) => [p.slug, p.sourceUrl]),
      ),
      files,
      representations: [
        ...visual,
        ...(paragraphs.length ? (["article", "text"] as const) : []),
      ],
      kind: "document",
      state: "ready",
      warnings: [...new Set(warnings)],
      wordCount: paragraphs.join(" ").split(/\s+/).filter(Boolean).length,
      ...extra,
    };
  }
  async add(
    value: string,
    title?: string,
    options: ShareImportOptions = { scope: "branch" },
  ) {
    const d = resolveLink(value);
    const existing = this.store
      .listMaterials()
      .find((m) => m.source.url === d.url);
    if (existing) {
      throw new DuplicateMaterialError(existing.title);
    }
    if (d.type === "link")
      return this.store.createMaterial({
        title:
          title?.trim() ||
          `${d.provider === "direct" ? "Медиа" : d.provider} — ${new URL(value).pathname.split("/").filter(Boolean).pop()}`,
        kind: d.kind,
        source: { type: "link", url: d.url, provider: d.provider },
        mediaUrl: d.embed,
        representations: [d.kind === "audio" ? "audio" : "video"],
        warnings: [
          "Для воспроизведения нужен доступ к источнику. Встраивание и кодек зависят от сервиса и браузера.",
        ],
      });
    options = validateImportOptions(options);
    const publication = await this.snapshot(value, false, options);
    return this.store.createMaterial({
      ...publication,
      title: title?.trim() || publication.title!,
      kind: publication.kind!,
      source: {
        type: "share",
        url: d.url,
        provider: d.provider,
        importOptions: options,
        savedAt: new Date().toISOString(),
        status: "saved",
      },
    });
  }
  async refresh(id: string) {
    const m = this.store.resolveMaterial(id);
    if (m.source.type !== "share" || !m.source.url)
      throw new Error("Материал не является сохранённой публикацией");
    try {
      const p = await this.snapshot(
        m.source.url,
        true,
        m.source.importOptions || { scope: "branch" },
      );
      // Titles and the order of descendants may change at the source. Keep
      // their public addresses, including reservations for removed sections.
      const addresses = { ...m.pageAddresses };
      for (const old of m.pages || []) addresses[old.slug] = old.sourceUrl;
      for (const page of p.pages || []) {
        const reserved = Object.entries(addresses).find(
          ([, url]) => url === page.sourceUrl,
        )?.[0];
        if (reserved) page.slug = reserved;
        else {
          const base = page.slug;
          let i = 1;
          while (addresses[page.slug]) page.slug = `${base}-${++i}`;
          addresses[page.slug] = page.sourceUrl;
        }
      }
      p.pageAddresses = addresses;
      return this.store.updateMaterial(
        m.id,
        {
          ...p,
          files: {
            ...p.files,
            ...(m.files.cover ? { cover: m.files.cover } : {}),
          },
          title: m.title,
          textVersion: m.textVersion + 1,
          source: {
            ...m.source,
            importOptions: m.source.importOptions || { scope: "branch" },
            status: "saved",
            message: "",
            savedAt: new Date().toISOString(),
            checkedAt: new Date().toISOString(),
          },
        },
        m.revision,
      );
    } catch (err) {
      if (err instanceof MaterialConflictError) throw err;
      return this.store.updateMaterial(
        m.id,
        {
          source: {
            ...m.source,
            status: (err as any).unavailable ? "unavailable" : "error",
            message: err instanceof Error ? err.message : "Не удалось обновить",
            checkedAt: new Date().toISOString(),
          },
        },
        m.revision,
      );
    }
  }
  finishUnavailable(id: string) {
    const m = this.store.resolveMaterial(id);
    if (m.source.status !== "unavailable")
      throw new Error("Сначала проверьте недоступность источника");
    return this.store.updateMaterial(m.id, {
      html: "",
      icon: null,
      pages: [],
      navigation: [],
      paragraphs: [],
      files: {},
      representations: [],
      wordCount: 0,
      textVersion: m.textVersion + 1,
      source: { ...m.source, status: "removed" },
    });
  }
}
