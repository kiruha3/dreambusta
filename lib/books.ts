import type { BookChapter, ParagraphLocation } from '../shared/types.ts';
import { normalizeChapters } from './chapters.ts';
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_TEXT_SIZE = 50 * 1024 * 1024;
export const FORMATS = ['EPUB', 'FB2', 'FB2.ZIP', 'PDF', 'TXT', 'DOCX', 'MOBI', 'AZW3'] as const;
export type BookDocument = { title: string; author: string; paragraphs: string[]; chapters?: BookChapter[]; paragraphLocations?: ParagraphLocation[] };
export type BookSummary = { id: string; title: string; author: string; format: string; wordCount: number; createdAt: string; originalName: string };
export function supportedFormat(name: string): string | null {
  const upper = name.toUpperCase();
  return FORMATS.find(f => upper.endsWith('.' + f)) ?? null;
}
export function validateDocument(input: unknown): BookDocument & { wordCount: number } {
  if (!input || typeof input !== 'object') throw new Error('Не удалось прочитать документ.');
  const d = input as Record<string, unknown>;
  if (!Array.isArray(d.paragraphs) || d.paragraphs.some(p => typeof p !== 'string')) throw new Error('Некорректный текст книги.');
  if (d.paragraphs.length > 250000) throw new Error('В книге слишком много абзацев.');
  const paragraphs: string[] = [];
  const remap: number[] = [];
  for (const p of d.paragraphs as string[]) {
    remap.push(paragraphs.length);
    const normalized = p.replace(/\s+/gu, ' ').trim();
    if (normalized) paragraphs.push(normalized);
  }
  const text = paragraphs.join('\n\n');
  if (!text) throw new Error('В файле не найден текст. Распознавание сканов пока не поддерживается.');
  if (new TextEncoder().encode(text).byteLength > MAX_TEXT_SIZE) throw new Error('Извлечённый текст больше 50 МБ.');
  const title = typeof d.title === 'string' ? d.title.trim().slice(0, 300) : '';
  if (!title) throw new Error('У книги нет названия.');
  const chapters = Array.isArray(d.chapters) ? normalizeChapters(d.chapters.flatMap(c => c && Number.isInteger(c.paragraph) && c.paragraph >= 0 && c.paragraph < remap.length ? [{title:c.title,paragraph:remap[c.paragraph]}] : []), paragraphs.length) : undefined;
  return { title, author: typeof d.author === 'string' ? d.author.trim().slice(0, 300) : '', paragraphs, ...(chapters ? {chapters} : {}), wordCount: text.split(/\s+/u).length };
}
