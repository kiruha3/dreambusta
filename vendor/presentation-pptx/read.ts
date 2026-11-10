import { randomUUID } from 'node:crypto'
import type { Element } from '@xmldom/xmldom'
import type { PresentationSlide } from '../shared/presentation.ts'
import { PRESENTATION_MAX_SLIDES } from './constants.ts'
import { readArchive } from './archive.ts'
import { child, children, descendants, NS, numeric, xmlPart } from './xml.ts'
import { related, relationships, validateRelationships } from './relationships.ts'
import { EMU_PER_PIXEL } from './geometry.ts'
import { readObjects } from './import-objects.ts'
import type { ObjectImport } from './import-objects.ts'
import { background } from './import-paint.ts'
import { slideContext } from './slide-context.ts'
import type { PackageContext, PptxDocument, ShapeContext } from './types.ts'

function inheritedObjects(source: 'layout' | 'master', context: ShapeContext, state: ObjectImport) {
  const part = source === 'layout' ? related(context.package, context.part, 'slideLayout') : related(context.package, related(context.package, context.part, 'slideLayout') ?? '', 'slideMaster')
  if (!part) return []
  const tree = child(child(context[source], 'cSld'), 'spTree')
  const nodes = readObjects(tree, { ...context, part, inherited: true }, state)
  return nodes.filter(node => {
    const binding = state.objects.get(node.id)!
    const shape = descendants(tree, 'cNvPr').find(item => item.getAttribute('id') === binding.shapeId)?.parentNode?.parentNode as Element | undefined
    return !descendants(shape, 'ph').length
  })
}
function readSlide(part: string, context: PackageContext, presentation: Element, state: ObjectImport, id: string): PresentationSlide {
  const root = xmlPart(context, part).documentElement
  if (root.localName !== 'sld' || root.namespaceURI !== NS.p) throw Error('Неподдержанный PresentationML XML')
  const shape = slideContext(context, part, presentation)
  const inherited = root.getAttribute('showMasterSp') === '0' ? [] : [...inheritedObjects('master', shape, state), ...inheritedObjects('layout', shape, state)]
  const objects = [...inherited, ...readObjects(child(child(root, 'cSld'), 'spTree'), shape, state)]
  const safe = relationships(context, part).every(relation => ['slideLayout', 'image', 'notesSlide'].some(type => relation.type.endsWith(`/${type}`)))
  const deletion = !descendants(presentation, 'custShowLst').length && !descendants(presentation, 'sectionLst').length
  return { id, name: child(root, 'cSld')?.getAttribute('name') || 'Слайд', background: background([root, shape.layout, shape.master], shape), objects, capabilities: { duplicate: safe, delete: deletion } }
}
/** Materializes supported OOXML and retains every original part and source identity. */
export function readPackage(entries: Map<string, Uint8Array>, identities = new Map<string, string>(), sceneId: string = randomUUID()): PptxDocument {
  const context: PackageContext = { entries, xml: new Map() }
  validatePackage(context)
  const presentation = presentationRoot(context)
  const ids = children(child(presentation, 'sldIdLst'), 'sldId')
  if (ids.length > PRESENTATION_MAX_SLIDES) throw Error('Превышен лимит слайдов PPTX')
  const document: PptxDocument = { entries, objects: new Map(), slides: new Map(), scene: { id: sceneId, width: numeric(child(presentation, 'sldSz'), 'cx') / EMU_PER_PIXEL, height: numeric(child(presentation, 'sldSz'), 'cy') / EMU_PER_PIXEL, slides: [], assets: [], warnings: [] } }
  for (const entry of ids) importSlide(document, context, presentation, entry, identities)
  return document
}
function importSlide(document: PptxDocument, context: PackageContext, presentation: Element, entry: Element, identities: Map<string, string>): void {
  const relationshipId = entry.getAttributeNS(NS.r, 'id') ?? ''
  const part = slidePart(context, relationshipId)
  if ([...document.slides.values()].some(source => source.part === part)) throw Error('Повторный слайд PPTX')
  const numericId = entry.getAttribute('id') ?? ''
  validateSlideId(document, numericId)
  const id = identities.get(part) ?? randomUUID()
  const state: ObjectImport = { objects: document.objects, assets: document.scene.assets, warnings: document.scene.warnings, identities, ownerSlide: part, shapeIds: new Set() }
  const slide = readSlide(part, context, presentation, state, id)
  document.scene.slides.push(slide)
  document.slides.set(id, { part, relationshipId, numericId, baseline: structuredClone(slide) })
}
/** Opens a bounded real PPTX archive. */
export async function openPptx(bytes: Uint8Array): Promise<PptxDocument> {
  const document = readPackage(await readArchive(bytes))
  document.originalBytes = new Uint8Array(bytes)
  return document
}

function validatePackage(context: PackageContext): void {
  for (const part of context.entries.keys()) if (part.endsWith('.xml') || part.endsWith('.rels')) xmlPart(context, part)
  validateRelationships(context)
}
function presentationRoot(context: PackageContext): Element {
  const part = related(context, '', 'officeDocument')
  if (part !== 'ppt/presentation.xml') throw Error('Неподдержанный presentation part')
  const root = xmlPart(context, part).documentElement
  if (root.localName !== 'presentation' || root.namespaceURI !== NS.p) throw Error('Некорректный PresentationML XML')
  return root
}
function slidePart(context: PackageContext, relationshipId: string): string {
  const part = relationships(context, 'ppt/presentation.xml').find(relation => relation.id === relationshipId)?.target
  if (!part) throw Error('Отсутствует slide relationship')
  return part
}
function validateSlideId(document: PptxDocument, value: string): void {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 256 || id > 2147483647) throw Error('Неверный slide ID')
  if ([...document.slides.values()].some(source => source.numericId === value)) throw Error('Повторный slide ID')
}
