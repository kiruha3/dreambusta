import { createPaths } from "../../shared/paths.ts";
import { createHash } from "node:crypto";
import type { Material } from "../../shared/types.ts";
import type { SearchLocation, SearchResult } from "../../shared/search.ts";

export interface SearchChunk {
  id: string;
  materialId: string;
  fingerprint: string;
  title: string;
  context: string;
  text: string;
  location: SearchLocation;
  metadata: boolean;
  spans?: { start: number; paragraph: number; offset: number }[];
}
export function fingerprint(m: Material) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "chunks-v2",
        m.revision,
        m.textVersion,
        m.title,
        m.author,
        m.description,
        m.tags,
        m.kind,
        m.visible,
        m.state,
        m.source.status,
        m.paragraphs,
        m.pages,
        m.paragraphLocations,
        m.chapters,
      ]),
    )
    .digest("hex");
}
export const normalizeSearch = (text: string) =>
  text.toLocaleLowerCase("ru").replaceAll("ё", "е");
const stopwords = new Set(
  "и в во на по к ко с со из у за от до о об а но или что это как кто какой какая какие когда где чем для при the a an and or of to in is who how what".split(
    " ",
  ),
);
export function queryTerms(query: string) {
  return [...new Set(normalizeSearch(query).match(/[\p{L}\p{N}]+/gu) || [])]
    .filter((t) => !stopwords.has(t))
    .slice(0, 12);
}
export function chunkMaterial(m: Material): SearchChunk[] {
  if (m.state !== "ready" || m.source.status === "removed") return [];
  const hash = fingerprint(m);
  const out: SearchChunk[] = [];
  const add = (
    text: string,
    context: string,
    location: SearchLocation,
    metadata = false,
    spans?: SearchChunk["spans"],
  ) => {
    out.push({
      id: `${m.id}:${out.length}`,
      materialId: m.id,
      fingerprint: hash,
      title: m.title,
      context,
      text,
      location,
      metadata,
      spans,
    });
  };
  add(
    [m.author, m.description, ...m.tags].filter(Boolean).join(" · "),
    "Описание материала",
    { mode: "metadata" },
    true,
  );
  for (const section of [
    {
      paragraphs: m.paragraphs,
      slug: undefined as string | undefined,
      title: "",
    },
    ...(m.pages || []).map((p) => ({ ...p })),
  ]) {
    let slide = 0;
    let block:
      | {
          text: string;
          context: string;
          location: SearchLocation;
          key: string;
          spans: NonNullable<SearchChunk["spans"]>;
        }
      | undefined;
    const flush = () => {
      if (block)
        add(block.text, block.context, block.location, false, block.spans);
      block = undefined;
    };
    section.paragraphs.forEach((paragraph, i) => {
      if (!paragraph.trim()) return;
      const native = !section.slug ? m.paragraphLocations?.[i] : undefined;
      if (
        !section.slug &&
        m.representations.includes("slides") &&
        /^Слайд \d+$/.test(paragraph) &&
        (!native ||
          i === 0 ||
          native.slide !== m.paragraphLocations?.[i - 1]?.slide)
      ) {
        slide = Number(paragraph.split(" ")[1]);
        return;
      }
      const chapter = !section.slug
        ? m.chapters?.filter((c) => c.paragraph <= i).at(-1)
        : undefined;
      const location: SearchLocation = {
        mode: native?.page ? "pdf" : native?.slide || slide ? "slides" : "text",
        paragraph: i,
        ...(section.slug ? { publicationPage: section.slug } : {}),
        ...(native?.page ? { page: native.page } : {}),
        ...(native?.slide || slide ? { slide: native?.slide || slide } : {}),
      };
      const context = [
        section.title,
        chapter?.title,
        location.page
          ? `Страница ${location.page}`
          : location.slide
            ? `Слайд ${location.slide}`
            : `Абзац ${i + 1}`,
      ]
        .filter(Boolean)
        .join(" · ");
      const key = JSON.stringify([
        location.mode,
        location.page,
        location.slide,
        chapter?.paragraph,
      ]);
      if (
        block &&
        (block.key !== key || block.text.length + 2 + paragraph.length > 1200)
      )
        flush();
      if (paragraph.length <= 1200) {
        if (!block) block = { text: "", context, location, key, spans: [] };
        const start = block.text.length ? block.text.length + 2 : 0;
        block.spans.push({ start, paragraph: i, offset: 0 });
        block.text += (block.text.length ? "\n\n" : "") + paragraph;
        return;
      }
      // Long paragraphs retain overlapping windows; short ones share bounded structural blocks.
      for (let offset = 0; offset < paragraph.length; offset += 1000) {
        add(paragraph.slice(offset, offset + 1200), context, {
          ...location,
          offset,
        });
        if (offset + 1200 >= paragraph.length) break;
      }
    });
    flush();
  }
  return out;
}
export function resultFor(
  chunk: SearchChunk,
  m: Material,
  query: string,
): SearchResult {
  const terms = queryTerms(query);
  const normalized = normalizeSearch(chunk.text);
  const at =
    terms
      .map((t) => normalized.indexOf(t))
      .filter((n) => n >= 0)
      .sort((a, b) => a - b)[0] || 0;
  const start = Math.max(0, at - 100);
  const snippet =
    (start ? "…" : "") +
    chunk.text.slice(start, start + 390) +
    (start + 390 < chunk.text.length ? "…" : "");
  const params = new URLSearchParams();
  const span = chunk.spans?.filter((s) => s.start <= at).at(-1);
  const l = span
    ? {
        ...chunk.location,
        paragraph: span.paragraph,
        offset: span.offset + at - span.start,
      }
    : { ...chunk.location, offset: (chunk.location.offset || 0) + at };
  if (l.publicationPage) params.set("page", l.publicationPage);
  if (!chunk.metadata) {
    params.set("view", l.mode);
    params.set("paragraph", String(l.paragraph || 0));
    if (l.offset) params.set("offset", String(l.offset));
    if (l.page) params.set("pdfPage", String(l.page));
    if (l.slide) params.set("slide", String(l.slide));
    params.set("version", String(m.textVersion));
    params.set("q", query);
  }
  return {
    id: chunk.id,
    materialId: m.id,
    title: m.title,
    kind: m.kind,
    context:
      l.paragraph !== undefined
        ? chunk.context.replace(/Абзац \d+$/, `Абзац ${l.paragraph + 1}`)
        : chunk.context,
    snippet: snippet || m.description || m.title,
    url:
      createPaths(process.env.DREAMBUSTA_BASE_PATH).public(
        createPaths(process.env.DREAMBUSTA_BASE_PATH).material(m.slug),
      ) + (params.size ? "?" + params : ""),
    location: l,
    textVersion: m.textVersion,
  };
}
