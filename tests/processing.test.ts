import test from 'node:test';
import assert from 'node:assert/strict';

async function processor() { const m = await import('../server/processing.ts').catch(() => null); assert.ok(m?.processFile, 'File processor is not implemented'); return m.processFile; }
test('Markdown creates a safe article and plain reading text', async () => {
  const run = await processor();
  const result = await run(new File(['# Заголовок\n\n**Первый** абзац.\n\n<script>alert(1)</script>'], 'article.md'));
  assert.ok(result.representations.includes('article')); assert.ok(result.representations.includes('text'));
  assert.match(result.html, /<h1>Заголовок<\/h1>/); assert.doesNotMatch(result.html, /<script|alert\(1\)/);
  assert.match(result.paragraphs.join(' '), /Первый абзац/); assert.doesNotMatch(result.paragraphs.join(' '), /\*\*|<script/);
});
test('PDF scan remains available visually without a fabricated text representation', async () => {
  const run = await processor();
  const contents = 'q 0 0 100 100 re S Q';
  const pdf = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj\n4 0 obj << /Length ${contents.length} >> stream\n${contents}\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF`;
  const result = await run(new File([pdf], 'scan.pdf'));
  assert.ok(result.representations.includes('pdf')); assert.ok(!result.representations.includes('text')); assert.equal(result.state, 'ready');
});
test('unsupported HTML lesson ZIP is rejected while original WBook formats remain allowed', async () => {
  const run = await processor();
  await assert.rejects(run(new File(['fake'], 'lesson.zip')), /формат/i);
  const result = await run(new File(['Первый абзац.\n\nВторой.'], 'book.txt'));
  assert.deepEqual(result.paragraphs, ['Первый абзац.', 'Второй.']);
});
