import type { PublicationNode, PublicationIcon } from "../../shared/types.ts";
import { MAX_PUBLICATION_PAGES } from "../../shared/publication.ts";

type Block = {
  type: number;
  title?: string;
  parentId?: string;
  subNodes?: string[];
  data?: any;
};
export type Blocks = Record<string, Block>;
function pageIcon(b: Block): PublicationIcon | undefined {
  const icon = b.data?.icon;
  if (!icon || typeof icon.value !== "string" || icon.value.length > 4096)
    return;
  if (icon.type === "emoji" && icon.value.length <= 40)
    return { type: "emoji", value: icon.value };
  if (icon.type === "upload" && /^s3\//.test(icon.value))
    return { type: "image", value: icon.value };
  if (icon.type === "http" && /^https?:\/\//.test(icon.value))
    return { type: "image", value: icon.value };
  if (icon.type === "icon" && /^\/[a-z-]+\/[a-z0-9-]+\.svg$/i.test(icon.value))
    return {
      type: "image",
      value: `https://buildin-static.flowus.space/assets/byte-icon/light${icon.value}`,
    };
}
function pageTitle(b: Block) {
  const visible = (b.data?.segments || [])
    .map((segment: any) =>
      typeof segment.text === "string" ? segment.text : "",
    )
    .join("")
    .trim();
  return visible || b.title?.trim() || "Страница";
}
function linkUrl(value: string) {
  try {
    const url = new URL(value, "https://buildin.ai");
    const page = /^\/(?:share\/)?([a-f0-9-]{36})\/?$/i.exec(url.pathname);
    if (url.hostname === "buildin.ai" && page)
      return buildinUrl(page[1]) + url.hash;
    return url.href;
  } catch {
    return value;
  }
}
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const buildinUrl = (id: string) =>
  `https://buildin.ai/share/${encodeURIComponent(id)}`;
export function buildinBlocks(body: string, id: string): Blocks {
  const data = JSON.parse(body);
  const blocks = data.data?.blocks;
  if (!blocks?.[id] || blocks[id].type !== 0)
    throw new Error("Публичная статья Buildin недоступна");
  return blocks;
}
// Ancestors are supplied by the anonymous public document endpoint. Never
// enumerate workspace records or guess another workspace's root.
export function buildinMenuRoot(blocks: Blocks, id: string) {
  let root = id;
  const seen = new Set<string>();
  while (blocks[id] && !seen.has(id)) {
    seen.add(id);
    if (blocks[id].type === 0) root = id;
    id = blocks[id].parentId || "";
  }
  return root;
}
export function buildinNavigation(
  blocks: Blocks,
  id: string,
): PublicationNode[] {
  const visited = new Set<string>();
  const nodes: PublicationNode[] = [];
  function walk(key: string, parent?: string, depth = 0) {
    if (visited.has(key) || !blocks[key]) return;
    if (depth > 100 || visited.size >= 20000)
      throw new Error("Дерево публикации слишком сложное");
    visited.add(key);
    const b = blocks[key];
    if (b.type === 0) {
      if (nodes.length >= MAX_PUBLICATION_PAGES)
        throw new Error(
          `В публикации больше ${MAX_PUBLICATION_PAGES} страниц. Выберите меньшую ветку.`,
        );
      nodes.push({
        sourceUrl: buildinUrl(key),
        parentSourceUrl: parent,
        title: pageTitle(b),
        ...(pageIcon(b) ? { icon: pageIcon(b) } : {}),
      });
      parent = buildinUrl(key);
    }
    for (const child of b.subNodes || []) walk(child, parent, depth + 1);
  }
  walk(id);
  return nodes;
}
export function buildinArticle(blocks: Blocks, id: string) {
  const visited = new Set<string>();
  const children: { url: string; title: string }[] = [];
  const linkIcons: { id: string; icon: PublicationIcon; sourceUrl: string }[] =
    [];
  const walk = (key: string, depth: number): string => {
    if (visited.has(key)) return "";
    if (depth > 100 || visited.size >= 20000)
      throw new Error(
        "Дерево публикации слишком сложное: превышен лимит глубины или блоков",
      );
    visited.add(key);
    const b = blocks[key];
    if (!b) return "";
    if (b.type === 0 && key !== id) {
      children.push({ url: buildinUrl(key), title: pageTitle(b) });
      const icon = pageIcon(b);
      const marker = `buildin-page-icon-${linkIcons.length}`;
      if (icon)
        linkIcons.push({ id: marker, icon, sourceUrl: buildinUrl(key) });
      return `<p><a href="${buildinUrl(key)}">${icon ? `<span id="${marker}"></span>` : ""}${esc(pageTitle(b))}</a></p>`;
    }
    const text =
      (b.data?.segments || [])
        .map((s: any) => {
          let v = esc(s.text);
          const e = s.enhancer || {};
          if (e.bold) v = `<strong>${v}</strong>`;
          if (e.italic) v = `<em>${v}</em>`;
          const href = e.link || s.url;
          if (typeof href === "string")
            v = `<a href="${esc(linkUrl(href))}">${v}</a>`;
          return v;
        })
        .join("") || esc(b.title);
    const tag =
      b.type === 7
        ? `h${Math.min(6, Math.max(1, Number(b.data?.level) || 2))}`
        : b.type === 14
          ? "pre"
          : "p";
    return (
      (key === id
        ? `<h1>${esc(pageTitle(blocks[id]))}</h1>`
        : text
          ? `<${tag}>${text}</${tag}>`
          : "") + (b.subNodes || []).map((x) => walk(x, depth + 1)).join("")
    );
  };
  const html = walk(id, 0);
  return {
    title: pageTitle(blocks[id]),
    icon: pageIcon(blocks[id]),
    html,
    children,
    linkIcons,
    warnings: ["Сложные блоки Buildin могут быть представлены текстом."],
  };
}
