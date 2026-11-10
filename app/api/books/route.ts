import { env } from 'cloudflare:workers';
import { MAX_FILE_SIZE, MAX_TEXT_SIZE, supportedFormat, validateDocument } from '@/lib/books';

export const dynamic = 'force-dynamic';
const columns = 'id, title, author, format, original_name AS originalName, word_count AS wordCount, created_at AS createdAt';
export async function GET() {
  try {
    const result = await env.DB!.prepare(`SELECT ${columns} FROM books ORDER BY created_at DESC`).all();
    return Response.json({ books: result.results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('library.list', error);
    return Response.json({ error: 'Библиотека пока недоступна. Попробуйте обновить страницу.' }, { status: 503 });
  }
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length')) > MAX_FILE_SIZE + MAX_TEXT_SIZE + 1024 * 1024) return Response.json({ error: 'Файл слишком большой.' }, { status: 413 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return Response.json({ error: 'Выберите непустой файл книги.' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: 'Максимальный размер книги — 25 МБ.' }, { status: 413 });
    const format = supportedFormat(file.name);
    if (!format) return Response.json({ error: 'Этот формат пока не поддерживается.' }, { status: 400 });
    const rawDocument = form.get('document');
    if (typeof rawDocument !== 'string' || rawDocument.length > MAX_TEXT_SIZE * 2) return Response.json({ error: 'Не удалось получить текст книги.' }, { status: 400 });
    const document = validateDocument(JSON.parse(rawDocument));
    const bytes = await file.arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const id = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
    const existing = await env.DB!.prepare(`SELECT ${columns} FROM books WHERE id = ?`).bind(id).first();
    if (existing) return Response.json({ book: existing, duplicate: true });
    await env.BUCKET!.put(`books/${id}/original`, bytes, { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
    await env.BUCKET!.put(`books/${id}/text.json`, JSON.stringify({ title: document.title, author: document.author, paragraphs: document.paragraphs }), { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
    const createdAt = new Date().toISOString();
    await env.DB!.prepare('INSERT INTO books (id,title,author,format,original_name,word_count,size,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id, document.title, document.author, format, file.name.slice(0, 300), document.wordCount, file.size, createdAt).run();
    const book = await env.DB!.prepare(`SELECT ${columns} FROM books WHERE id = ?`).bind(id).first();
    return Response.json({ book }, { status: 201 });
  } catch (error) {
    console.error('library.import', error);
    const message = error instanceof Error ? error.message : 'Не удалось загрузить книгу.';
    const known = /текст|книг|документ|назван|абзац|JSON/u.test(message);
    return Response.json({ error: known ? message : 'Не удалось сохранить книгу. Попробуйте ещё раз.' }, { status: known ? 400 : 500 });
  }
}
