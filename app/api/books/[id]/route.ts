import { env } from 'cloudflare:workers';
export const dynamic = 'force-dynamic';
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(id)) return Response.json({ error: 'Книга не найдена.' }, { status: 404 });
  try {
    // Keep the catalogue entry until both files are removed so a failed deletion can be retried.
    // Both operations are idempotent, including a retry after the response was lost.
    await env.BUCKET!.delete([`books/${id}/original`, `books/${id}/text.json`]);
    await env.DB!.prepare('DELETE FROM books WHERE id = ?').bind(id).run();
    return Response.json({ deleted: true, id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('library.delete', error);
    return Response.json({ error: 'Не удалось завершить удаление книги. Попробуйте ещё раз.' }, { status: 503 });
  }
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(id)) return Response.json({ error: 'Книга не найдена.' }, { status: 404 });
  try {
    const book = await env.DB!.prepare('SELECT id,title,author,format,original_name AS originalName,word_count AS wordCount,created_at AS createdAt FROM books WHERE id = ?').bind(id).first();
    if (!book) return Response.json({ error: 'Книга не найдена.' }, { status: 404 });
    const object = await env.BUCKET!.get(`books/${id}/text.json`);
    if (!object) return Response.json({ error: 'Текст книги временно недоступен.' }, { status: 503 });
    return Response.json({ book, document: await object.json() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('library.open', error);
    return Response.json({ error: 'Не удалось открыть книгу. Попробуйте ещё раз.' }, { status: 503 });
  }
}
