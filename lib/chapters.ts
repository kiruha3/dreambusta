import type { BookChapter } from "../shared/types.ts";
import type { Token } from "./reader.ts";

export type WordChapter = BookChapter & { start: number; end: number };
export function normalizeChapters(
  chapters: readonly BookChapter[] | undefined,
  paragraphCount: number,
): BookChapter[] {
  if (!Array.isArray(chapters) || chapters.length > 10000) return [];
  const seen = new Set<number>();
  return chapters
    .filter(
      (c) =>
        c &&
        Number.isInteger(c.paragraph) &&
        c.paragraph >= 0 &&
        c.paragraph < paragraphCount &&
        typeof c.title === "string" &&
        c.title.trim(),
    )
    .sort((a, b) => a.paragraph - b.paragraph)
    .flatMap((c) => {
      if (seen.has(c.paragraph)) return [];
      seen.add(c.paragraph);
      return [
        {
          title: c.title.trim().replace(/\s+/gu, " ").slice(0, 200),
          paragraph: c.paragraph,
        },
      ];
    });
}

const ordinal =
  "(?:первая|первый|первое|вторая|второй|второе|третья|третий|третье|четв[её]ртая|четв[её]ртый|пятая|пятый|шестая|шестой|седьмая|седьмой|восьмая|восьмой|девятая|девятый|десятая|десятый|один|два|три|четыре|пять|шесть|семь|восемь|девять|десять|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third)";
const headingPrefix =
  /^(?:глава|часть|том|раздел|книга|chapter|part)\s+(.+)$/iu;
const numberPrefix = new RegExp(
  `^(?:\\d+(?:[.-]\\d+)*|[ivxlcdm]+|${ordinal})(.*)$`,
  "iu",
);
const standalone =
  /^(?:пролог|эпилог|предисловие|послесловие|введение|заключение|prologue|epilogue)(?:\s*[:.—–-].*)?$/iu;
export function detectChapters(
  paragraphs: readonly string[],
  marker?: string,
): BookChapter[] {
  const prefix = marker?.trim().toLocaleLowerCase();
  if (marker !== undefined && (!prefix || prefix.length > 80)) return [];
  const result: BookChapter[] = [];
  for (let paragraph = 0; paragraph < paragraphs.length; paragraph++) {
    const title = paragraphs[paragraph].trim();
    if (!title || title.length > 180) continue;
    const lower = title.toLocaleLowerCase();
    const heading = headingPrefix.exec(title);
    const tail = heading ? numberPrefix.exec(heading[1])?.[1] : undefined;
    const numbered =
      tail !== undefined &&
      (!tail ||
        /^\s*[:.\-—–]/u.test(tail) ||
        /^\s+[«“"\p{Lu}\p{N}]/u.test(tail));
    const matches = prefix
      ? lower.startsWith(prefix) &&
        (!lower[prefix.length] || !/[\p{L}\p{N}_]/u.test(lower[prefix.length]))
      : numbered || standalone.test(title);
    if (matches) result.push({ title, paragraph });
    if (result.length > 10000) break;
  }
  return result;
}
export function resolveChapters(
  paragraphs: readonly string[],
  native?: readonly BookChapter[],
  marker?: string,
): BookChapter[] {
  let chapters =
    marker === undefined ? normalizeChapters(native, paragraphs.length) : [];
  if (!chapters.length)
    chapters = normalizeChapters(
      detectChapters(paragraphs, marker),
      paragraphs.length,
    );
  if (chapters.length && chapters[0].paragraph > 0)
    chapters.unshift({ title: "Вступление", paragraph: 0 });
  return chapters;
}
export function wordChapters(
  chapters: readonly BookChapter[],
  tokens: readonly Token[],
): WordChapter[] {
  const result: WordChapter[] = [];
  for (const c of chapters) {
    let lo = 0,
      hi = tokens.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (tokens[mid].paragraph < c.paragraph) lo = mid + 1;
      else hi = mid;
    }
    if (lo >= tokens.length || result.at(-1)?.start === lo) continue;
    if (result.length) result[result.length - 1].end = lo;
    result.push({ ...c, start: lo, end: tokens.length });
  }
  return result;
}
export function chapterAt(
  chapters: readonly WordChapter[],
  word: number,
): number {
  let lo = 0,
    hi = chapters.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (chapters[mid].start <= word) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}
