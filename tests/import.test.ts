import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { DOMParser } from 'linkedom';
import { importBook } from '../lib/import.ts';
import { htmlParagraphs } from '../lib/formats/xml.ts';
Object.assign(globalThis, { DOMParser });

test('HTML keeps loose text and nested block content in reading order', () => {
  assert.deepEqual(htmlParagraphs('<html><body>Вступление<p>Первый <em>абзац</em>.</p>Послесловие</body></html>'), ['Вступление', 'Первый абзац.', 'Послесловие']);
});
test('XHTML self-closing title cannot swallow the chapter body', () => {
  const source = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title/></head><body><p>Текст главы.</p><p>Следующий абзац.</p></body></html>';
  assert.deepEqual(htmlParagraphs(source), ['Текст главы.', 'Следующий абзац.']);
});

test('imports UTF-8 TXT and preserves paragraphs', async () => {
  const doc = await importBook(new File(['Первый абзац.\n\nВторой абзац.'], 'Книга.txt'));
  assert.equal(doc.title, 'Книга');
  assert.deepEqual(doc.paragraphs, ['Первый абзац.', 'Второй абзац.']);
});
test('FB2 keeps poem verses as well as prose paragraphs', async () => {
  const doc = await importBook(new File(['<FictionBook><body><section><p>Вступление.</p><poem><stanza><v>Первая строка</v><v>Вторая строка</v></stanza></poem><p>Конец.</p></section></body></FictionBook>'], 'poem.fb2'));
  assert.deepEqual(doc.paragraphs, ['Вступление.', 'Первая строка', 'Вторая строка', 'Конец.']);
});
test('imports FB2 metadata and ignores embedded image binaries', async () => {
  const xml = '<FictionBook><description><title-info><book-title>Рассказ</book-title><author><first-name>Иван</first-name><last-name>Авторов</last-name></author></title-info></description><body><section><p>Первый абзац.</p><p>Второй абзац.</p></section></body><binary>NOT_BOOK_TEXT</binary></FictionBook>';
  const doc = await importBook(new File([xml], 'book.fb2'));
  assert.equal(doc.title, 'Рассказ');
  assert.equal(doc.author, 'Иван Авторов');
  assert.deepEqual(doc.paragraphs, ['Первый абзац.', 'Второй абзац.']);
  const zip = new JSZip(); zip.file('book.fb2', xml);
  const zipped = await importBook(new File([await zip.generateAsync({type:'arraybuffer'})], 'book.fb2.zip'));
  assert.deepEqual(zipped, doc);
});
test('EPUB follows spine order rather than archive order', async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/content.opf"/></rootfiles></container>');
  zip.file('OPS/content.opf', '<package><metadata><dc:title xmlns:dc="dc">Роман</dc:title><dc:creator xmlns:dc="dc">Автор</dc:creator></metadata><manifest><item id="b" href="b.xhtml"/><item id="a" href="a.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>');
  zip.file('OPS/b.xhtml', '<html><body><p>Вторая глава.</p></body></html>');
  zip.file('OPS/a.xhtml', '<html><body><p>Первая глава.</p></body></html>');
  const doc = await importBook(new File([await zip.generateAsync({type:'arraybuffer'})], 'book.epub'));
  assert.equal(doc.title, 'Роман');
  assert.deepEqual(doc.paragraphs, ['Первая глава.', 'Вторая глава.']);
});
test('EPUB keeps nonlinear notes and excludes actual navigation', async () => {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', '<container><rootfile full-path="book.opf"/></container>');
  zip.file('book.opf', '<package><manifest><item id="main" href="main.xhtml"/><item id="note" href="notes.xhtml"/><item id="nav" href="nav.xhtml" properties="nav"/></manifest><spine><itemref idref="main"/><itemref idref="note" linear="no"/><itemref idref="nav" linear="no"/></spine></package>');
  zip.file('main.xhtml', '<html><body><p>Main chapter.</p></body></html>');
  zip.file('notes.xhtml', '<html><body><p>AUTHOR NOTE.</p></body></html>');
  zip.file('nav.xhtml', '<html><body><p>Service navigation.</p></body></html>');
  const doc = await importBook(new File([await zip.generateAsync({type:'arraybuffer'})], 'notes.epub'));
  assert.deepEqual(doc.paragraphs, ['Main chapter.', 'AUTHOR NOTE.']);
});
test('DOCX extracts text runs and paragraph boundaries', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document xmlns:w="word"><w:body><w:p><w:r><w:t>Привет, </w:t></w:r><w:r><w:t>мир!</w:t></w:r></w:p><w:p><w:r><w:t>Абзац два.</w:t></w:r></w:p></w:body></w:document>');
  const doc = await importBook(new File([await zip.generateAsync({type:'arraybuffer'})], 'book.docx'));
  assert.deepEqual(doc.paragraphs, ['Привет, мир!', 'Абзац два.']);
});
test('empty text and broken containers produce useful errors', async () => {
  await assert.rejects(importBook(new File(['  '], 'empty.txt')), /не найден текст/u);
  await assert.rejects(importBook(new File(['broken'], 'broken.epub')), /повреждён|архив/u);
  await assert.rejects(importBook(new File(['image'], 'photo.png')), /формат/u);
});
