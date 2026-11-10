import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
async function service() { const m = await import('../server/shares.ts').catch(() => null); assert.ok(m?.Shares, 'Share service is missing'); return m; }
test('known video providers have safe embeds and direct media links retain their type', async () => {
  const { resolveLink } = await service();
  assert.equal(resolveLink('https://youtu.be/abcdefghijk').provider, 'youtube');
  assert.equal(resolveLink('https://rutube.ru/video/abcdef123456/').provider, 'rutube');
  assert.equal(resolveLink('https://example.org/podcast.mp3').kind, 'audio');
  assert.equal(resolveLink('https://buildin.ai/share/public').provider, 'buildin');
  assert.throws(() => resolveLink('javascript:alert(1)'), /http|адрес/i);
  assert.throws(() => resolveLink('https://youtube.com.evil.test/video'), /источник|поддерж/i);
});
test('Buildin saves only article; ordinary opens do not fetch; revoked update retains snapshot until explicit finish', async t => {
  const { Shares } = await service(); const dir = mkdtempSync(join(tmpdir(), 'dreambusta-share-')); const store = new Store(dir);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  let calls = 0; let mode = 'ok';
  const get = async () => { calls++; if (mode === 'timeout') throw new Error('timeout'); return { status: mode === 'gone' ? 404 : 200, body: Buffer.from('<html><title>Article</title><nav>WORKSPACE SECRET NAV</nav><main><h1>Правила работы</h1><p>Полезный опубликованный текст.</p><script>evil()</script></main></html>'), contentType: 'text/html' }; };
  const shares = new Shares(store, dir, get);
  const m = await shares.add('https://buildin.ai/share/public');
  assert.match(m.html, /Полезный опубликованный/); assert.doesNotMatch(m.html, /WORKSPACE|evil/);
  store.resolveMaterial(m.slug); store.resolveMaterial(m.slug); assert.equal(calls, 1);
  mode = 'gone'; const kept = await shares.refresh(m.id); assert.equal(kept.source.status, 'unavailable'); assert.match(kept.html, /Полезный/);
  mode = 'timeout'; const timeout = await shares.refresh(m.id); assert.match(timeout.html, /Полезный/); assert.equal(timeout.source.status, 'error');
  assert.throws(() => shares.finishUnavailable(m.id), /провер|недоступ/i);
  mode = 'gone'; await shares.refresh(m.id); const removed = shares.finishUnavailable(m.id);
  assert.equal(removed.html, ''); assert.deepEqual(removed.paragraphs, []); assert.deepEqual(removed.files, {}); assert.equal(removed.source.status, 'removed');
});
test('server fetch rejects loopback/private addresses and credentialed URLs', async () => {
  const m = await import('../server/sources/network.ts').catch(() => null); assert.ok(m?.validatePublicUrl, 'Network boundary is missing');
  for (const u of ['http://127.0.0.1/admin', 'http://[::1]/', 'http://192.168.1.2/', 'http://user:pass@example.com', 'http://169.254.169.254/']) await assert.rejects(m.validatePublicUrl(u));
});
