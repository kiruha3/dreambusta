export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_TEXT_SIZE = 10 * 1024 * 1024;
export const FORMATS = ['EPUB', 'FB2', 'FB2.ZIP', 'PDF', 'TXT', 'DOCX', 'MOBI', 'AZW3'] as const;
export type BookDocument = { title: string; author: string; paragraphs: string[] };
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
  const paragraphs = d.paragraphs.map((p: string) => p.replace(/\s+/gu, ' ').trim()).filter(Boolean);
  const text = paragraphs.join('\n\n');
  if (!text) throw new Error('В файле не найден текст. Распознавание сканов пока не поддерживается.');
  if (new TextEncoder().encode(text).byteLength > MAX_TEXT_SIZE) throw new Error('Извлечённый текст больше 10 МБ.');
  const title = typeof d.title === 'string' ? d.title.trim().slice(0, 300) : '';
  if (!title) throw new Error('У книги нет названия.');
  return { title, author: typeof d.author === 'string' ? d.author.trim().slice(0, 300) : '', paragraphs, wordCount: text.split(/\s+/u).length };
}
