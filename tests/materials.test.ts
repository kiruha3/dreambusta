import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function fixture(t: { after: (fn: () => void) => void }) {
  const mod = await import('../server/store.ts').catch(() => null);
  assert.ok(mod?.Store, 'The persistent material store is not implemented yet');
  const dir = mkdtempSync(join(tmpdir(), 'dreambusta-store-'));
  const store = new mod.Store(dir);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { store, dir, Store: mod.Store };
}
test('Cyrillic titles receive readable, unique slugs with stable material IDs', async t => {
  const { store } = await fixture(t);
  const a = store.createMaterial({ title: 'Регламент согласования', kind: 'document', source: { type: 'file' } });
  const b = store.createMaterial({ title: 'Регламент согласования', kind: 'document', source: { type: 'file' } });
  assert.equal(a.slug, 'reglament-soglasovaniya');
  assert.equal(b.slug, 'reglament-soglasovaniya-2');
  assert.notEqual(a.id, b.id);
});
test('renaming keeps the ID and old URLs reserved forever', async t => {
  const { store } = await fixture(t);
  const a = store.createMaterial({ title: 'Документ', kind: 'document', source: { type: 'file' } });
  const renamed = store.updateMaterial(a.id, { slug: 'novoe-imya', title: 'Новое имя' });
  assert.equal(renamed.id, a.id);
  assert.equal(store.resolveMaterial('dokument').slug, 'novoe-imya');
  const b = store.createMaterial({ title: 'Документ', kind: 'document', source: { type: 'file' } });
  assert.equal(b.slug, 'dokument-2');
  assert.throws(() => store.updateMaterial(b.id, { slug: 'dokument' }), /адрес|занят/i);
});
test('collection order and material metadata survive closing and reopening SQLite', async t => {
  const { store, dir, Store } = await fixture(t);
  const a = store.createMaterial({ title: 'Первый', kind: 'document', source: { type: 'file' } });
  const b = store.createMaterial({ title: 'Второй', kind: 'book', source: { type: 'file' } });
  const c = store.saveCollection({ title: 'Начните здесь', materialIds: [b.id, a.id], visible: true });
  store.close();
  const restored = new Store(dir);
  assert.deepEqual(restored.resolveCollection(c.slug).materialIds, [b.id, a.id]);
  restored.saveCollection({ ...c, materialIds: [a.id] });
  assert.equal(restored.resolveMaterial(b.id).title, 'Второй');
  restored.close();
});
test('changing a title does not silently change a copied link', async t => {
  const { store } = await fixture(t);
  const a = store.createMaterial({ title: 'Простое имя', kind: 'document', source: { type: 'file' } });
  assert.equal(store.updateMaterial(a.id, { title: 'Другое название' }).slug, 'prostoe-imya');
});
