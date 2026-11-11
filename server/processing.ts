import { DOMParser, parseHTML } from "linkedom";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { importBook } from "../lib/import.ts";
import { MAX_TEXT_SIZE } from "../lib/books.ts";
import { importDocx } from "../lib/formats/archive.ts";
import { importPdf } from "../lib/formats/pdf.ts";
import { decodeText } from "../lib/formats/xml.ts";
import type { Material } from "../shared/types.ts";
import { openPptx } from "../vendor/presentation-pptx/read.ts";
Object.assign(globalThis, { DOMParser });

export const mediaTypes: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
};
export const extension = (name: string) =>
  name.toLowerCase().endsWith(".fb2.zip")
    ? "fb2.zip"
    : name.split(".").pop()!.toLowerCase();
export function fileLimit(name: string) {
  const ext = extension(name);
  if (mediaTypes[ext]) return 1024 * 1024 * 1024;
  if (["pdf", "docx", "doc"].includes(ext)) return 100 * 1024 * 1024;
  if (ext === "pptx") return 32 * 1024 * 1024;
  if (
    [
      "md",
      "markdown",
      "txt",
      "epub",
      "fb2",
      "fb2.zip",
      "mobi",
      "azw3",
    ].includes(ext)
  )
    return 25 * 1024 * 1024;
  throw new Error(
    "Этот формат не поддерживается. HTML ZIP не является форматом книги.",
  );
}
export function cleanHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "h1",
      "h2",
      "details",
      "summary",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      "*": ["id"],
    },
    allowedSchemes: ["https", "http"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attrs) => ({
        tagName: "a",
        attribs: {
          ...attrs,
          rel: "noopener noreferrer",
          target: attrs.href?.startsWith("#") ? "_self" : "_blank",
        },
      }),
    },
  });
}
export function plainParagraphs(html: string) {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  document
    .querySelectorAll(".publication-link-icon")
    .forEach((el) => el.remove());
  for (const br of document.querySelectorAll("br")) br.replaceWith("\n");
  const blocks = document.querySelectorAll(
    "p,h1,h2,h3,h4,h5,h6,li,pre,tr,blockquote",
  );
  return (
    blocks.length
      ? Array.from(blocks)
          .filter((el) => !el.querySelector("p,h1,h2,h3,h4,li,pre,tr"))
          .map((el) => el.textContent || "")
      : [document.body.textContent || ""]
  )
    .map((s) => s.trim())
    .filter(Boolean);
}
type Processed = Partial<Material> & { scene?: unknown };
export async function processFile(file: File): Promise<Processed> {
  const ext = extension(file.name);
  const limit = fileLimit(file.name);
  if (!file.size) throw new Error("Файл пуст");
  if (file.size > limit)
    throw new Error(
      `Максимальный размер этого формата — ${Math.round(limit / 1024 / 1024)} МБ`,
    );
  const result: Processed = {
    title: file.name.replace(/\.(fb2\.zip|[^.]+)$/i, ""),
    kind: "document",
    paragraphs: [],
    chapters: [],
    html: "",
    representations: [],
    warnings: [],
    state: "ready",
  };
  if (mediaTypes[ext])
    return {
      ...result,
      kind: mediaTypes[ext].startsWith("video") ? "video" : "audio",
      representations: [
        mediaTypes[ext].startsWith("video") ? "video" : "audio",
      ],
      warnings: [
        "Воспроизведение зависит от поддержки кодека браузером. Автоматическая расшифровка не выполняется.",
      ],
    };
  if (ext === "md" || ext === "markdown") {
    result.html = cleanHtml(await marked(decodeText(await file.arrayBuffer())));
    result.paragraphs = plainParagraphs(result.html);
    result.representations = ["article"];
  } else if (ext === "pdf") {
    const document = await importPdf(file, result.title!);
    result.title = document.title;
    result.paragraphs = document.paragraphs;
    result.paragraphLocations = document.paragraphLocations;
    result.author = document.author;
    result.representations = ["pdf"];
    if (!result.paragraphs.some((x) => x.trim()))
      result.warnings!.push(
        "В PDF нет доступного текстового слоя. Доступен просмотр страниц; OCR не выполняется.",
      );
  } else if (ext === "pptx") {
    const doc = await openPptx(new Uint8Array(await file.arrayBuffer()));
    result.scene = doc.scene;
    result.kind = "presentation";
    result.representations = ["slides"];
    const collect = (objects: any[]): string[] =>
      objects.flatMap((o) =>
        o.kind === "group"
          ? collect(o.objects)
          : o.kind === "table"
            ? (() => {
                const rows = new Map<number, string[]>();
                for (const cell of o.cells) {
                  const text = cell.text.content.trim();
                  if (!text) continue;
                  const row = rows.get(cell.row) ?? [];
                  row.push(text);
                  rows.set(cell.row, row);
                }
                return [...rows.values()].map((row) => row.join(" · "));
              })()
            : o.text?.content
              ? [o.text.content]
              : [],
      );
    result.paragraphLocations = [];
    result.paragraphs = doc.scene.slides.flatMap((s, i) => {
      const text = collect(s.objects);
      const paragraphs = text.length ? [`Слайд ${i + 1}`, ...text] : [];
      result.paragraphLocations!.push(
        ...paragraphs.map(() => ({ slide: i + 1 })),
      );
      return paragraphs;
    });
    result.warnings = [
      "Статический просмотр: анимация, видео и сложные объекты PowerPoint могут не отображаться.",
      ...Array.from(
        new Set(
          doc.scene.warnings.map((w) =>
            w.code === "unsupported_effects"
              ? "Тени и некоторые эффекты показаны упрощённо."
              : w.code === "unsupported_text_features"
                ? "Некоторые дополнительные свойства текста могут отличаться от PowerPoint."
                : "Некоторые сложные объекты пока не поддерживаются просмотрщиком.",
          ),
        ),
      ),
    ].slice(0, 20);
  } else if (ext === "doc") {
    throw new Error(
      "Для старого DOC нужен LibreOffice. Установите его и задайте LIBREOFFICE_PATH; оригинал сохранён.",
    );
  } else {
    const book =
      ext === "docx"
        ? await importDocx(file, result.title!)
        : await importBook(file);
    result.title = book.title;
    result.paragraphs = book.paragraphs;
    result.author = book.author;
    result.chapters = book.chapters || [];
    if (ext === "docx") result.representations = ["docx"];
    else result.kind = "book";
  }
  if (result.paragraphLocations)
    result.paragraphLocations = result.paragraphLocations.filter(
      (_l, i) => !!result.paragraphs![i].trim(),
    );
  result.paragraphs = result.paragraphs!.map((s) => s.trim()).filter(Boolean);
  if (
    new TextEncoder().encode(result.paragraphs.join("\n\n")).byteLength >
    MAX_TEXT_SIZE
  )
    throw new Error("Текст превышает 50 МБ");
  result.wordCount = result.paragraphs
    .join(" ")
    .split(/\s+/u)
    .filter(Boolean).length;
  if (result.wordCount) result.representations!.push("text");
  return result;
}
