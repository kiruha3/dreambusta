import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

const origin = process.env.WBOOK_ORIGIN || 'http://127.0.0.1:5173';
const tag = randomUUID();
const document = {title:'Проверка общей библиотеки',author:'WBook',paragraphs:['Это проверка загрузки книги в общую библиотеку.', 'У каждого читателя сохраняется собственное место.', 'Тест ' + tag]};
const bytes = document.paragraphs.join('\n\n');
const id = createHash('sha256').update(bytes).digest('hex');
async function catalogue() {
  const response = await fetch(origin + '/api/books', {headers:{'Cookie':'independent-session=second'}, cache:'no-store'});
  assert.ok(response.ok);
  return (await response.json()).books;
}
async function upload() {
  const form = new FormData();
  form.append('file', new File([bytes], 'Проверка-' + tag + '.txt', {type:'text/plain'}));
  form.append('document', JSON.stringify(document));
  const response = await fetch(origin + '/api/books', {method:'POST', body:form});
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
}
async function remove() {
  const response = await fetch(origin + '/api/books/' + id, {method:'DELETE'});
  assert.equal(response.status, 200, await response.text());
}
const originalIds = (await catalogue()).map(book => book.id);
try {
  const first = await upload();
  const second = await upload();
  assert.equal(first.book.id, id);
  assert.equal(second.book.id, id);
  assert.equal(second.duplicate, true);
  assert.equal((await catalogue()).filter(b => b.id === id).length, 1);
  const opened = await (await fetch(origin + '/api/books/' + id)).json();
  assert.deepEqual(opened.document.paragraphs, document.paragraphs);
  assert.equal((await fetch(origin + '/api/books/not-an-id')).status, 404);
  assert.equal((await fetch(origin + '/api/books/not-an-id', {method:'DELETE'})).status, 404);

  await remove();
  assert.equal((await catalogue()).some(book => book.id === id), false);
  assert.equal((await fetch(origin + '/api/books/' + id)).status, 404);
  await remove(); // A lost response can safely be retried.
  const restored = await upload();
  assert.equal(restored.book.id, id);
  assert.notEqual(restored.duplicate, true);
  const reopened = await (await fetch(origin + '/api/books/' + id)).json();
  assert.deepEqual(reopened.document.paragraphs, document.paragraphs);
} finally {
  await remove(); // Only the unique book created by this run is deleted.
}
const remaining = new Set((await catalogue()).map(book => book.id));
assert.equal(remaining.has(id), false);
assert.ok(originalIds.every(originalId => remaining.has(originalId)), 'Existing books must be preserved');
console.log('PASS: shared import, duplicate detection, full text, invalid ids, deletion, safe retry, reimport; existing library preserved');
