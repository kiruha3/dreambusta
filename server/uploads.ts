import { createWriteStream, createReadStream, statSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Store } from './store.ts';
import type { Material } from '../shared/types.ts';
import { extension, fileLimit, mediaTypes, processFile } from './processing.ts';
import { HttpError } from './app.ts';
import { convertDoc } from './conversion.ts';

export async function upload(req: IncomingMessage, store: Store, dataDir: string, name: string, existing?: Material) {
  if (!name || name.length > 255 || /[\x00-\x1f/\\]/.test(name)) throw new HttpError(400, 'Некорректное имя файла');
  const limit = fileLimit(name); const declared = Number(req.headers['content-length']);
  if (declared > limit) throw new HttpError(413, `Лимит файла — ${limit / 1024 / 1024} МБ`);
  const ext = extension(name); const dirName = randomUUID(); const relative = `files/${dirName}/original.${ext}`;
  const dir = join(dataDir, 'files', dirName); mkdirSync(dir, { recursive: true });
  let size = 0;
  try {
    await pipeline(req, new Transform({ transform(chunk, _enc, cb) { size += chunk.length; cb(size > limit ? new HttpError(413, 'Превышен размер файла') : null, chunk); } }), createWriteStream(join(dataDir, relative), { flags: 'wx' }));
    if (!size) throw new Error('Файл пуст');
  } catch (err) { rmSync(dir, { recursive: true, force: true }); throw err; }
  const mime = mediaTypes[ext] || ({ pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', md: 'text/markdown', txt: 'text/plain' } as Record<string, string>)[ext] || 'application/octet-stream';
  let m = existing || store.createMaterial({ title: name.replace(/\.(fb2\.zip|[^.]+)$/i, ''), kind: 'document', source: { type: 'file' }, state: 'processing' });
  const files = { original: { path: relative, name, mime, size } } as Material['files'];
  try {
    let file = new File(mediaTypes[ext] ? [new Uint8Array([1])] : [readFileSync(join(dataDir, relative))], name);
    if (ext === 'doc') {
      const converted = await convertDoc(join(dataDir, relative), dir);
      const bytes = readFileSync(converted); file = new File([bytes], name.replace(/\.doc$/i, '.docx'));
      files.docx = { path: `files/${dirName}/${converted.split(/[\\/]/).pop()}`, name: file.name, size: bytes.length, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    }
    const { scene, ...processed } = await processFile(file);
    if (scene) { const value = JSON.stringify(scene); writeFileSync(join(dir, 'slides.json'), value); files.slides = { path: `files/${dirName}/slides.json`, name: 'slides.json', mime: 'application/json', size: Buffer.byteLength(value) }; }
    if (ext === 'pdf') files.pdf = files.original;
    if (ext === 'docx') files.docx = files.original;
    m = store.updateMaterial(m.id, { ...processed, title: existing?.title || processed.title!, source: { type: 'file' }, files, textVersion: existing ? existing.textVersion + 1 : 1 });
  } catch (err) {
    if (existing) { rmSync(dir, { recursive: true, force: true }); throw new HttpError(400, `Новая версия не принята; предыдущая сохранена. ${err instanceof Error ? err.message : 'Ошибка обработки'}`); }
    m = store.updateMaterial(m.id, { files, state: 'error', error: err instanceof Error ? err.message : 'Ошибка обработки' });
  }
  return m;
}
export function serveFile(req: IncomingMessage, res: ServerResponse, material: Material, key: string, dataDir: string, editor: boolean) {
  const ref = material.files[key];
  if (!ref || (key === 'original' && !material.downloadable && !editor && !material.representations.some(x => ['pdf', 'docx', 'video', 'audio'].includes(x)))) throw new HttpError(404, 'Файл недоступен');
  const full = resolve(dataDir, ref.path); if (!full.startsWith(resolve(dataDir) + sep)) throw new HttpError(404, 'Файл не найден');
  let size: number; try { size = statSync(full).size; } catch { throw new HttpError(404, 'Файл отсутствует на диске'); }
  res.setHeader('Content-Type', ref.mime); res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Disposition', `${['application/pdf', 'video/mp4', 'video/webm', 'audio/mpeg', 'application/json'].includes(ref.mime) || ref.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(ref.name)}`);
  let start = 0; let end = size - 1;
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!range || (!range[1] && !range[2])) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    if (!range[1]) start = Math.max(0, size - Number(range[2])); else start = Number(range[1]);
    if (range[1] && range[2]) end = Math.min(end, Number(range[2]));
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`); res.statusCode = 206;
  }
  res.setHeader('Content-Length', end - start + 1);
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(full, { start, end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
}
