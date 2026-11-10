import type { BookDocument } from '../books.ts';
import { htmlParagraphs } from './xml.ts';
export async function importMobi(file: File, fallback: string): Promise<BookDocument> {
  const header = new DataView(await file.slice(0, Math.min(file.size, 1024)).arrayBuffer());
  if (header.byteLength < 90) throw new Error('Файл MOBI/AZW3 повреждён.');
  const recordOffset = header.getUint32(78);
  const palmdoc = new DataView(await file.slice(recordOffset, recordOffset + 16).arrayBuffer());
  if (palmdoc.byteLength < 16) throw new Error('В MOBI/AZW3 не найден текст.');
  if (palmdoc.getUint16(12) !== 0) throw new Error('Книга защищена DRM. Нужен файл без защиты.');
  const { MOBI, isMOBI } = await import('foliate-js/mobi.js');
  if (!(await isMOBI(file))) throw new Error('Этот файл не является книгой MOBI/AZW3.');
  const book = await new MOBI({ unzlib: async (bytes: Uint8Array<ArrayBuffer>) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()) }).open(file);
  try {
    const paragraphs: string[] = [];
    for (const section of book.sections) {
      const doc = await section.createDocument();
      const html = Array.from(doc.childNodes).map(node => node.nodeType === 1 ? (node as HTMLElement).outerHTML : node.nodeType === 3 ? node.textContent : '').join('');
      paragraphs.push(...htmlParagraphs(html));
    }
    const author = book.metadata?.author ?? book.metadata?.creator;
    return { title: typeof book.metadata?.title === 'string' ? book.metadata.title || fallback : fallback, author: typeof author === 'string' ? author : Array.isArray(author) ? author.map((a: string | { name?: string }) => typeof a === 'string' ? a : a.name || '').join(', ') : '', paragraphs };
  } finally { book.destroy?.(); }
}
