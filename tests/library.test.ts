import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, supportedFormat, MAX_FILE_SIZE } from '../lib/books.ts';

test('normalizes document text and metadata, counts words', () => {
  const doc = validateDocument({title:'  Книга  ', author:' Автор ', paragraphs:['  Привет,   мир! ', '', 'Ещё строка.']});
  assert.equal(doc.title, 'Книга');
  assert.equal(doc.author, 'Автор');
  assert.equal(doc.wordCount, 4);
  assert.deepEqual(doc.paragraphs, ['Привет, мир!', 'Ещё строка.']);
});
test('rejects empty and malformed books instead of saving empty records', () => {
  for(const input of [{}, {title:'X', paragraphs:[]}, {title:'X', paragraphs:['  ']}, {title:'X',paragraphs:[7]}]) {
    assert.throws(() => validateDocument(input));
  }
});
test('format detection uses the full suffix and rejects unsupported extensions', () => {
  assert.equal(supportedFormat('КНИГА.FB2.ZIP'), 'FB2.ZIP');
  assert.equal(supportedFormat('novel.azw3'), 'AZW3');
  assert.equal(supportedFormat('image.png'), null);
  assert.equal(MAX_FILE_SIZE, 25 * 1024 * 1024);
});
