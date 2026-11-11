export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Документ повреждён: некорректный XML.');
  return doc;
}
type QueryRoot = Pick<ParentNode, 'querySelectorAll'>;
export const nodes = (root: QueryRoot, name: string) => Array.from(root.querySelectorAll('*')).filter(e => e.localName.split(':').pop() === name);
export const value = (root: QueryRoot, name: string) => nodes(root, name)[0]?.textContent?.trim() ?? '';
export function htmlParagraphs(source: string, anchors?: Map<string, number>): string[] {
  const parser = new DOMParser();
  // EPUB chapters are XHTML: HTML parsing treats <title/> as an unclosed
  // raw-text element and swallows the entire body. Prefer the XML tree.
  let doc = parser.parseFromString(source, 'application/xhtml+xml');
  if (doc.querySelector('parsererror') || !doc.documentElement) {
    const html = source.replace(/<(title|script|style|textarea)(\s[^<>]*?)?\s*\/>/gi, '<$1$2></$1>');
    doc = parser.parseFromString(html, 'text/html');
  }
  doc.querySelectorAll('script,style,nav,head,svg,noscript').forEach(e => e.remove());
  const paragraphs: string[] = [];
  let text = '';
  const flush = () => { if (text.trim()) paragraphs.push(text.trim()); text = ''; };
  const walk = (node: Node) => {
    if (node.nodeType === 3) { text += node.textContent ?? ''; return; }
    const block = node.nodeType === 1 && /^(p|h[1-6]|div|section|article|li|blockquote|pre|td|dt|dd|br|hr)$/i.test((node as HTMLElement).localName);
    if (block) flush();
    if (anchors && node.nodeType === 1) {
      const el = node as Element;
      const id = el.getAttribute('id') || el.getAttribute('name');
      if (id && !anchors.has(id)) anchors.set(id, paragraphs.length);
    }
    Array.from(node.childNodes).forEach(walk);
    if (block) flush();
  };
  walk(doc); flush();
  return paragraphs;
}
export function decodeText(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  if (view[0] === 0xff && view[1] === 0xfe) return new TextDecoder('utf-16le').decode(view);
  if (view[0] === 0xfe && view[1] === 0xff) return new TextDecoder('utf-16be').decode(view);
  const header = new TextDecoder('ascii').decode(view.subarray(0, 180));
  const declared = header.match(/encoding\s*=\s*["']([^"']+)/i)?.[1];
  if (declared) { try { return new TextDecoder(declared).decode(view); } catch {} }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(view); }
  catch { return new TextDecoder('windows-1251').decode(view); }
}
