import { parseHTML } from 'linkedom';
import { marked } from 'marked';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Store } from './store.ts';
import type { Material, Kind } from '../shared/types.ts';
import { cleanHtml, plainParagraphs } from './processing.ts';
import { fetchPublic } from './sources/network.ts';
import type { FetchPublic } from './sources/network.ts';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function resolveLink(value: string) {
  const url = new URL(value); const h = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Нужен HTTP(S) адрес без пароля');
  const p = url.pathname;
  let provider = ''; let kind: Kind = 'document'; let embed = ''; let type: 'share' | 'link' = 'link';
  if (h === 'youtu.be' || h === 'youtube.com' || h === 'm.youtube.com') { const id = h === 'youtu.be' ? p.split('/')[1] : url.searchParams.get('v') || p.split('/').filter(Boolean).pop(); if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Укажите ссылку на отдельное видео YouTube'); provider = 'youtube'; kind = 'video'; embed = `https://www.youtube-nocookie.com/embed/${id}`; }
  else if (h === 'rutube.ru') { const id = /\/(?:video|play\/embed)\/([a-z0-9]+)/i.exec(p)?.[1]; if (!id) throw new Error('Укажите ссылку на отдельное видео Rutube'); provider = 'rutube'; kind = 'video'; embed = `https://rutube.ru/play/embed/${id}`; }
  else if (['vk.com', 'vkvideo.ru'].includes(h)) { const match = /video(-?\d+)_(\d+)/.exec(p); const oid = match?.[1] || url.searchParams.get('oid'); const id = match?.[2] || url.searchParams.get('id'); if (!oid || !id || !/^-?\d+$/.test(oid) || !/^\d+$/.test(id)) throw new Error('Укажите публичную ссылку на видео VK'); provider = 'vk'; kind = 'video'; embed = `https://vk.com/video_ext.php?oid=${oid}&id=${id}`; }
  else if (/\.(mp4|webm|mov|m4v)$/i.test(p)) { provider = 'direct'; kind = 'video'; embed = url.href; }
  else if (/\.(mp3|m4a|ogg|oga|wav|flac)$/i.test(p)) { provider = 'direct'; kind = 'audio'; embed = url.href; }
  else if (h === 'buildin.ai' && /^\/share\/[^/]+\/?$/.test(p)) { provider = 'buildin'; type = 'share'; }
  else if (/^\/shared\/(?:d\/|s\/|kb\/|meetings\/)?[^/]+\/?$/.test(p)) { provider = 'techhelper'; type = 'share'; }
  else throw new Error('Этот источник пока не поддерживается. Используйте TechHelper, Buildin, ссылку на видео или прямой медиафайл.');
  return { url: url.href, provider, kind, embed, type };
}
function richHtml(node: any): string {
  if (typeof node === 'string') return esc(node);
  if (Array.isArray(node)) return node.map(richHtml).join('');
  if (!node || typeof node !== 'object') return '';
  if (typeof node.text === 'string') {
    let s = esc(node.text); const marks = node.marks?.map((m: any) => m.type) || [];
    if (node.bold || marks.includes('bold')) s = `<strong>${s}</strong>`;
    if (node.italic || marks.includes('italic')) s = `<em>${s}</em>`;
    return s;
  }
  const inner = richHtml(node.children || node.content || []);
  const types: Record<string, string> = { paragraph: 'p', heading: `h${Math.min(6, Math.max(1, Number(node.attrs?.level) || 2))}`, 'heading-one': 'h1', 'heading-two': 'h2', blockquote: 'blockquote', bulletList: 'ul', orderedList: 'ol', listItem: 'li', table: 'table', tableRow: 'tr', tableCell: 'td', tableHeader: 'th', codeBlock: 'pre' };
  if (node.type === 'image') return `<img src="${esc(node.attrs?.src || node.url)}" alt="${esc(node.attrs?.alt)}">`;
  if (node.type === 'hardBreak') return '<br>';
  const tag = types[node.type]; return tag ? `<${tag}>${inner}</${tag}>` : inner;
}
function buildinHtml(body: string, id: string) {
  const data = JSON.parse(body); const blocks = data.data?.blocks; const root = blocks?.[id];
  if (!root) throw new Error('Публичная статья Buildin недоступна');
  const visited = new Set<string>();
  const walk = (key: string, depth: number): string => {
    if (visited.has(key) || depth > 30 || visited.size > 10000) return ''; visited.add(key);
    const b = blocks[key]; if (!b) return '';
    if (b.type === 0 && key !== id) return `<p><a href="https://buildin.ai/share/${esc(key)}">${esc(b.title)}</a></p>`;
    const text = (b.data?.segments || []).map((s: any) => {
      let v = esc(s.text); const e = s.enhancer || {}; if (e.bold) v = `<strong>${v}</strong>`; if (e.italic) v = `<em>${v}</em>`;
      if (e.link) v = `<a href="${esc(e.link)}">${v}</a>`; return v;
    }).join('') || esc(b.title);
    const tag = b.type === 7 ? `h${Math.min(6, Number(b.data?.level) || 2)}` : b.type === 14 ? 'pre' : 'p';
    return (key === id ? `<h1>${esc(root.title)}</h1>` : text ? `<${tag}>${text}</${tag}>` : '') + (b.subNodes || []).map((x: string) => walk(x, depth + 1)).join('');
  };
  return { title: root.title || 'Buildin', html: walk(id, 0), warnings: ['Сохранена основная статья. Вложенные страницы открываются по ссылкам и добавляются отдельно. Сложные блоки могут быть представлены текстом.'] };
}
export class Shares {
  store: Store; dataDir: string; get: FetchPublic;
  constructor(store: Store, dataDir: string, get: FetchPublic = fetchPublic) { this.store = store; this.dataDir = dataDir; this.get = get; }
  async publication(value: string): Promise<Partial<Material>> {
    const d = resolveLink(value); const u = new URL(value); let api = value;
    if (d.provider === 'buildin') api = `${u.origin}/api/docs/${encodeURIComponent(u.pathname.split('/')[2])}`;
    if (d.provider === 'techhelper') api = `${u.origin}/api${u.pathname.replace(/\/$/, '')}/${u.search}`;
    const response = await this.get(api);
    if ([401, 403, 404, 410].includes(response.status)) throw Object.assign(new Error('Источник закрыл или удалил публикацию'), { unavailable: true });
    if (response.status !== 200) throw new Error(`Источник ответил HTTP ${response.status}`);
    let title = ''; let html = ''; let warnings: string[] = []; const files: Material['files'] = {};
    const body = response.body.toString('utf8');
    if (response.contentType.includes('json')) {
      if (d.provider === 'buildin') ({ title, html, warnings } = buildinHtml(body, u.pathname.split('/')[2]));
      else {
        const data = JSON.parse(body); title = data.title || data.name || 'Публикация TechHelper';
        const content = data.version_content || data.content;
        html = data.content_html || (data.content_md || typeof content === 'string' ? await marked(data.content_md || content) : richHtml(content));
        if (!html && data.transcript) html = await marked(typeof data.transcript === 'string' ? data.transcript : richHtml(data.transcript));
        if (data.file_info?.viewer && !['native', 'markdown'].includes(data.file_info.viewer)) warnings.push('Сохранён опубликованный текст. Файловое представление этого источника пока добавляется отдельным файлом.');
      }
    } else {
      const { document } = parseHTML(body); const main = document.querySelector('article') || document.querySelector('main');
      if (!main) throw new Error('Не найдена основная опубликованная статья');
      main.querySelectorAll('nav,aside,script,style,header,footer,form').forEach(n => n.remove());
      title = main.querySelector('h1')?.textContent || document.querySelector('title')?.textContent || 'Публикация'; html = main.innerHTML;
    }
    html = cleanHtml(html); if (!plainParagraphs(html).length) throw new Error('Источник не предоставил читаемого опубликованного содержимого');
    const { document } = parseHTML(`<html><body>${html}</body></html>`);
    for (const a of document.querySelectorAll('a[href]')) { try { a.setAttribute('href', new URL(a.getAttribute('href')!, value).href); } catch { a.removeAttribute('href'); } }
    const assets = Array.from(document.querySelectorAll('img[src]')).slice(0, 30); const directory = randomUUID(); let total = 0;
    for (let i = 0; i < assets.length; i++) {
      const image = assets[i];
      try {
        const remote = await this.get(new URL(image.getAttribute('src')!, value).href, 5 * 1024 * 1024);
        const mime = remote.contentType.split(';')[0];
        if (remote.status !== 200 || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime) || (total += remote.body.length) > 20 * 1024 * 1024) throw new Error('Ресурс не сохранён');
        const key = `asset-${i}`; const dir = join(this.dataDir, 'snapshots', directory); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, key), remote.body);
        files[key] = { path: `snapshots/${directory}/${key}`, name: key, mime, size: remote.body.length }; image.setAttribute('src', `snapshot:${key}`);
      } catch { image.removeAttribute('src'); warnings.push('Одно из изображений не удалось сохранить; текст доступен.'); }
    }
    document.querySelectorAll('img[src]').forEach(el => { if (!el.getAttribute('src')?.startsWith('snapshot:')) el.removeAttribute('src'); });
    html = document.body.innerHTML; const paragraphs = plainParagraphs(html);
    return { title: title.trim().slice(0, 300), html, paragraphs, files, representations: ['article', 'text'], kind: 'document', state: 'ready', warnings, wordCount: paragraphs.join(' ').split(/\s+/).length };
  }
  async add(value: string, title?: string) {
    const d = resolveLink(value);
    if (d.type === 'link') return this.store.createMaterial({ title: title?.trim() || `${d.provider === 'direct' ? 'Медиа' : d.provider} — ${new URL(value).pathname.split('/').filter(Boolean).pop()}`, kind: d.kind, source: { type: 'link', url: d.url, provider: d.provider }, mediaUrl: d.embed, representations: [d.kind === 'audio' ? 'audio' : 'video'], warnings: ['Для воспроизведения нужен доступ к источнику. Встраивание и кодек зависят от сервиса и браузера.'] });
    const publication = await this.publication(value);
    return this.store.createMaterial({ ...publication, title: title?.trim() || publication.title!, kind: publication.kind!, source: { type: 'share', url: d.url, provider: d.provider, savedAt: new Date().toISOString(), status: 'saved' } });
  }
  async refresh(id: string) {
    const m = this.store.resolveMaterial(id); if (m.source.type !== 'share' || !m.source.url) throw new Error('Материал не является сохранённой публикацией');
    try {
      const p = await this.publication(m.source.url);
      return this.store.updateMaterial(m.id, { ...p, title: m.title, textVersion: m.textVersion + 1, source: { ...m.source, status: 'saved', message: '', savedAt: new Date().toISOString(), checkedAt: new Date().toISOString() } });
    } catch (err) {
      return this.store.updateMaterial(m.id, { source: { ...m.source, status: (err as any).unavailable ? 'unavailable' : 'error', message: err instanceof Error ? err.message : 'Не удалось обновить', checkedAt: new Date().toISOString() } });
    }
  }
  finishUnavailable(id: string) {
    const m = this.store.resolveMaterial(id); if (m.source.status !== 'unavailable') throw new Error('Сначала проверьте недоступность источника');
    return this.store.updateMaterial(m.id, { html: '', paragraphs: [], files: {}, representations: [], wordCount: 0, textVersion: m.textVersion + 1, source: { ...m.source, status: 'removed' } });
  }
}
