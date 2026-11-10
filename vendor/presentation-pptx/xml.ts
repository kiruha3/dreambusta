import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import type { Document, Element, Node } from '@xmldom/xmldom'
import { PRESENTATION_MAX_XML_BYTES, PRESENTATION_MAX_XML_DEPTH, PRESENTATION_MAX_XML_ELEMENTS } from './constants.ts'
import type { PackageContext } from './types.ts'

/** OOXML namespaces; source prefixes never determine interpretation. */
export const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
}
/** Direct child elements preserve document and stacking order. */
export function children(node: Node | undefined | null, localName?: string): Element[] {
  const result: Element[] = []
  for (let child = node?.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue
    const element = child as Element
    if (!localName || element.localName === localName) result.push(element)
  }
  return result
}
/** Finds one direct child without accidentally traversing embedded objects. */
export function child(node: Node | undefined | null, localName: string): Element | undefined {
  return children(node, localName)[0]
}
/** Finds descendant elements in source order. */
export function descendants(node: Node | undefined | null, localName: string): Element[] {
  return children(node).flatMap(element => [...(element.localName === localName ? [element] : []), ...descendants(element, localName)])
}
/** Reads a finite numeric XML attribute. */
export function numeric(node: Element | undefined, name: string, fallback = 0): number {
  const raw = node?.getAttribute(name)
  if (raw === null || raw === undefined || raw === '') return fallback
  const result = Number(raw)
  if (!Number.isFinite(result)) throw Error('Некорректное число в XML')
  return result
}
function boundTree(document: Document): void {
  const pending: { node: Node; depth: number }[] = [{ node: document, depth: 0 }]
  let count = 0
  while (pending.length) {
    const item = pending.pop()!
    if (++count > PRESENTATION_MAX_XML_ELEMENTS || item.depth > PRESENTATION_MAX_XML_DEPTH) throw Error('Превышен лимит XML')
    for (const element of children(item.node)) pending.push({ node: element, depth: item.depth + 1 })
  }
}
/** Parses inert XML, rejecting declarations and malformed documents. */
export function parseXml(bytes: Uint8Array): Document & { documentElement: Element } {
  if (bytes.length > PRESENTATION_MAX_XML_BYTES) throw Error('Превышен размер XML')
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (/<!\s*(DOCTYPE|ENTITY)/i.test(source)) throw Error('DTD/DOCTYPE в XML запрещён')
  const document = new DOMParser({ onError: (_level, message) => { throw Error(`Ошибка XML: ${message}`) } }).parseFromString(source, 'application/xml')
  if (!document.documentElement) throw Error('Пустой XML')
  boundTree(document)
  return document as Document & { documentElement: Element }
}
/** Retrieves a required package XML document. */
export function xmlPart(context: PackageContext, part: string): Document & { documentElement: Element } {
  const cached = context.xml.get(part)
  if (cached) return cached
  const bytes = context.entries.get(part)
  if (!bytes) throw Error(`Отсутствует часть PPTX: ${part}`)
  const document = parseXml(bytes)
  context.xml.set(part, document)
  return document as Document & { documentElement: Element }
}
/** Serializes only a changed package part. */
export function serializeXml(node: Node): Uint8Array {
  return new TextEncoder().encode(new XMLSerializer().serializeToString(node))
}
/** Adds a DrawingML/PresentationML element with a deterministic prefix. */
export function append(parent: Element, name: string): Element {
  const prefix = name.split(':')[0] as 'a' | 'p'
  const element = parent.ownerDocument!.createElementNS(NS[prefix], name)
  parent.appendChild(element)
  return element
}
/** Gets or creates a direct child. */
export function ensure(parent: Element, name: string): Element {
  return child(parent, name.split(':')[1]!) ?? append(parent, name)
}
