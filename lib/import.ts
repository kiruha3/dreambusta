import { MAX_FILE_SIZE, supportedFormat, validateDocument } from './books.ts';
import type { BookDocument } from './books.ts';
import { decodeText } from './formats/xml.ts';
import { importEpub, importDocx, importFb2 } from './formats/archive.ts';
export async function importBook(file: File, report?: (message: string) => void): Promise<BookDocument> {
  if (file.size > MAX_FILE_SIZE) throw new Error('Максимальный размер книги — 25 МБ.');
  const format = supportedFormat(file.name);
  if (!format) throw new Error('Этот формат пока не поддерживается.');
  if (!file.size) throw new Error('Файл пуст. Выберите другую книгу.');
  const fallback = file.name.replace(/\.(fb2\.zip|[^.]+)$/i, '').replace(/_/g, ' ');
  report?.('Читаем файл…');
  let result: BookDocument;
  if (format === 'TXT') {
    const text = decodeText(await file.arrayBuffer()).replace(/\r\n?/g, '\n');
    result = { title: fallback, author: '', paragraphs: text.split(/\n[\t ]*\n/u) };
  } else if (format === 'EPUB') result = await importEpub(file, fallback);
  else if (format === 'DOCX') result = await importDocx(file, fallback);
  else if (format === 'FB2' || format === 'FB2.ZIP') result = await importFb2(file, fallback);
  else if (format === 'PDF') {
    const { importPdf } = await import('./formats/pdf.ts');
    result = await importPdf(file, fallback, report);
  } else {
    const { importMobi } = await import('./formats/mobi.ts');
    result = await importMobi(file, fallback);
  }
  const { wordCount: _wordCount, ...document } = validateDocument(result);
  return document;
}
