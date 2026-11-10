import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOMParser, parseHTML } from 'linkedom';
import { importBook } from '../lib/import.ts';
const { document } = parseHTML('<html><body></body></html>');
Object.assign(globalThis, { DOMParser, document, CSS: { escape: (text: string) => text.replace(/[^a-z0-9_-]/gi, char => '\\' + char) }, XMLSerializer: class { serializeToString(node: Node) { return (node as unknown as {outerHTML:string}).outerHTML; } } });

for (const format of ['mobi', 'azw3']) test(`extracts real public-domain ${format.toUpperCase()} book`, async () => {
  const data = await readFile(new URL('./fixtures/alice.' + format, import.meta.url));
  const doc = await importBook(new File([data], 'Alice.' + format));
  assert.ok(doc.paragraphs.join(' ').length > 100000);
  assert.match(doc.paragraphs.join(' '), /rabbit/i);
  assert.match(doc.author, /Carroll/i);
});
