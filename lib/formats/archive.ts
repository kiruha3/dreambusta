import JSZip from 'jszip';
import { parseXml, nodes, value, htmlParagraphs, decodeText } from './xml.ts';
import type { BookDocument } from '../books.ts';

type ZipStream = {
  on(event: 'data', callback: (chunk: Uint8Array) => void): ZipStream;
  on(event: 'end', callback: () => void): ZipStream;
  on(event: 'error', callback: (error: Error) => void): ZipStream;
  pause(): void;
  resume(): void;
};
type StreamableEntry = JSZip.JSZipObject & { internalStream(type: 'uint8array'): ZipStream };

export async function openArchive(file: File, maxBytes = 80 * 1024 * 1024) {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    let size = 0;
    for (const entry of Object.values(zip.files)) {
      const info = entry as typeof entry & { _data?: { uncompressedSize: number } };
      size += info._data?.uncompressedSize ?? 0;
      if (size > maxBytes) throw new Error('Превышен лимит распаковки архива (80 МБ).');
    }
    let totalBytes = 0;
    const read = (entry: JSZip.JSZipObject): Promise<ArrayBuffer> => new Promise((resolve, reject) => {
      let chunks: Uint8Array[] = []; let length = 0; let done = false;
      const stream = (entry as StreamableEntry).internalStream('uint8array');
      stream.on('data', chunk => {
        if (done) return;
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBytes) {
          done = true; chunks = []; stream.pause();
          reject(new Error('Превышен лимит распаковки архива (80 МБ).'));
          return;
        }
        chunks.push(chunk); length += chunk.byteLength;
      });
      stream.on('error', () => { if (!done) { done = true; chunks = []; reject(new Error('Архив повреждён: не удалось распаковать файл.')); } });
      stream.on('end', () => {
        if (done) return;
        done = true;
        const result = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
        chunks = []; resolve(result.buffer);
      });
      stream.resume();
    });
    return { files: zip.files, file: (name: string) => zip.file(name), read, text: async (entry: JSZip.JSZipObject) => decodeText(await read(entry)) };
  } catch (error) {
    if (error instanceof Error && error.message.includes('лимит распаковки')) throw error;
    throw new Error('Файл повреждён или не является книжным архивом.');
  }
}
export function parseFb2(text: string, fallback: string): BookDocument {
  const doc = parseXml(text);
  const info = nodes(doc, 'title-info')[0];
  const authors = info ? nodes(info, 'author').map(a => ['first-name', 'middle-name', 'last-name'].map(n => value(a, n)).filter(Boolean).join(' ') || value(a, 'nickname')).filter(Boolean) : [];
  const paragraphs = nodes(doc, 'body').flatMap(body => Array.from(body.querySelectorAll('*')).filter(e => /^(p|v|subtitle|text-author)$/.test(e.localName.split(':').pop() || '')).map(p => p.textContent ?? ''));
  return { title: info ? value(info, 'book-title') || fallback : fallback, author: authors.join(', '), paragraphs };
}
export async function importEpub(file: File, fallback: string): Promise<BookDocument> {
  const zip = await openArchive(file);
  const container = zip.file('META-INF/container.xml');
  if (!container) throw new Error('В EPUB не найдено описание книги.');
  const root = nodes(parseXml(await zip.text(container)), 'rootfile')[0]?.getAttribute('full-path');
  if (!root || !zip.file(root)) throw new Error('В EPUB повреждён каталог книги.');
  const opf = parseXml(await zip.text(zip.file(root)!));
  const encryption = zip.file('META-INF/encryption.xml');
  if (encryption) {
    const algorithms = nodes(parseXml(await zip.text(encryption)), 'EncryptionMethod').map(e => e.getAttribute('Algorithm') || '');
    if (algorithms.some(a => !/idpf\.org\/2008\/embedding|adobe\.com\/pdf\/enc#RC/i.test(a))) throw new Error('Книга защищена DRM. Нужен файл без защиты.');
  }
  const manifest = new Map(nodes(opf, 'item').map(e => [e.getAttribute('id'), { href: e.getAttribute('href'), navigation: (e.getAttribute('properties') || '').split(/\s+/).includes('nav') }]));
  const resolvePath = (href: string) => decodeURIComponent(new URL(href, 'https://ebook.invalid/' + root).pathname.slice(1));
  const navigationPaths = new Set(nodes(opf, 'reference').filter(e => (e.getAttribute('type') || '').split(/\s+/).includes('toc')).map(e => e.getAttribute('href')).filter((h): h is string => !!h).map(resolvePath));
  const paragraphs: string[] = [];
  for (const ref of nodes(opf, 'itemref')) {
    const item = manifest.get(ref.getAttribute('idref'));
    if (item?.navigation) continue;
    const href = item?.href;
    if (!href) throw new Error('В EPUB отсутствует глава из оглавления.');
    const path = resolvePath(href);
    if (navigationPaths.has(path)) continue;
    const chapter = zip.file(path);
    if (!chapter) throw new Error('В EPUB отсутствует файл главы.');
    paragraphs.push(...htmlParagraphs(await zip.text(chapter)));
  }
  return { title: value(opf, 'title') || fallback, author: nodes(opf, 'creator').map(e => e.textContent?.trim()).filter(Boolean).join(', '), paragraphs };
}
export async function importDocx(file: File, fallback: string): Promise<BookDocument> {
  const zip = await openArchive(file);
  const source = zip.file('word/document.xml');
  if (!source) throw new Error('В DOCX не найден текст документа.');
  const doc = parseXml(await zip.text(source));
  const paragraphs = nodes(doc, 'p').map(p => Array.from(p.querySelectorAll('*')).map(e => {
    const name = e.localName.split(':').pop();
    return name === 't' ? e.textContent || '' : name === 'tab' || name === 'br' ? ' ' : '';
  }).join(''));
  const core = zip.file('docProps/core.xml');
  const metadata = core ? parseXml(await zip.text(core)) : null;
  return { title: metadata ? value(metadata, 'title') || fallback : fallback, author: metadata ? value(metadata, 'creator') : '', paragraphs };
}
export async function importFb2(file: File, fallback: string): Promise<BookDocument> {
  if (file.name.toLowerCase().endsWith('.zip')) {
    const zip = await openArchive(file);
    const entries = Object.values(zip.files).filter(e => !e.dir && /\.fb2$/i.test(e.name));
    if (entries.length !== 1) throw new Error('В FB2.ZIP должна быть одна книга FB2.');
    return parseFb2(decodeText(await zip.read(entries[0])), fallback);
  }
  return parseFb2(decodeText(await file.arrayBuffer()), fallback);
}
