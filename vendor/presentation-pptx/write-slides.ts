import { posix } from 'node:path'
import type { PresentationSlide } from '../shared/presentation.ts'
import { child, children, NS, serializeXml, xmlPart } from './xml.ts'
import { addRelationship, contentType } from './write-images.ts'
import { related, relationshipPart } from './relationships.ts'
import type { PackageContext, PptxDocument, SlideBinding } from './types.ts'

/** A selected source or newly allocated slide in a candidate package. */
export type WriteSlide = { part: string; relationshipId: string; numericId: string; original?: SlideBinding }
function uniquePart(context: PackageContext, directory: string, stem: string): string {
  let index = 1
  while (context.entries.has(`${directory}/${stem}${index}.xml`)) index++
  return `${directory}/${stem}${index}.xml`
}
function emptySlide(): Uint8Array {
  return new TextEncoder().encode(`<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`)
}
function cloneNotes(context: PackageContext, source: string, destination: string): void {
  const notes = related(context, source, 'notesSlide')
  if (!notes) return
  const target = uniquePart(context, 'ppt/notesSlides', 'notesSlide')
  context.entries.set(target, context.entries.get(notes)!)
  const relationsPart = relationshipPart(notes)
  if (context.entries.has(relationsPart)) context.entries.set(relationshipPart(target), context.entries.get(relationsPart)!)
  const document = xmlPart(context, relationshipPart(target))
  replaceTarget(document.documentElement, 'slide', posix.relative(posix.dirname(target), destination))
  context.entries.set(relationshipPart(target), serializeXml(document))
  const slideRelations = xmlPart(context, relationshipPart(destination))
  replaceTarget(slideRelations.documentElement, 'notesSlide', posix.relative(posix.dirname(destination), target))
  context.entries.set(relationshipPart(destination), serializeXml(slideRelations))
  contentType(context, target, 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml')
}
/** Allocates distinct slide parts and relationships while keeping source dependencies intact. */
export function allocateSlide(context: PackageContext, source: PptxDocument, slide: PresentationSlide, clone: SlideBinding | undefined): WriteSlide {
  const original = source.slides.get(slide.id)
  if (original) return { ...original, original }
  const part = uniquePart(context, 'ppt/slides', 'slide')
  context.entries.set(part, clone ? context.entries.get(clone.part)! : emptySlide())
  if (clone && context.entries.has(relationshipPart(clone.part))) context.entries.set(relationshipPart(part), context.entries.get(relationshipPart(clone.part))!)
  if (clone) cloneNotes(context, clone.part, part)
  else addBlankLayout(context, source, part)
  const relationshipId = addRelationship(context, 'ppt/presentation.xml', part, 'slide')
  const numericId = nextSlideId(context)
  contentType(context, part, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml')
  return { part, relationshipId, numericId, original: clone }
}
function addBlankLayout(context: PackageContext, source: PptxDocument, part: string): void {
  const first = [...source.slides.values()][0]
  const layout = first ? related(context, first.part, 'slideLayout') : undefined
  if (layout) addRelationship(context, part, layout, 'slideLayout')
}
/** Changes only the presentation's explicit order/ID list. */
export function setSlideOrder(context: PackageContext, slides: WriteSlide[]): void {
  const presentation = xmlPart(context, 'ppt/presentation.xml')
  const list = child(presentation.documentElement, 'sldIdLst')
  if (!list) throw Error('Отсутствует список слайдов')
  const existing = new Map(children(list, 'sldId').map(element => [element.getAttributeNS(NS.r, 'id'), element]))
  for (const element of children(list, 'sldId')) list.removeChild(element)
  for (const slide of slides) {
    const element = existing.get(slide.relationshipId) ?? presentation.createElementNS(NS.p, 'p:sldId')
    element.setAttribute('id', slide.numericId)
    element.setAttributeNS(NS.r, 'r:id', slide.relationshipId)
    list.insertBefore(element, child(list, 'extLst') ?? null)
  }
  context.entries.set('ppt/presentation.xml', serializeXml(presentation))
}
/** Removes explicit relationships for deleted slides without deleting shared source parts. */
export function removeSlides(context: PackageContext, source: PptxDocument, retained: Set<string>): void {
  const part = relationshipPart('ppt/presentation.xml')
  const document = xmlPart(context, part)
  const removed = [...source.slides].filter(([id]) => !retained.has(id)).map(([, binding]) => binding.relationshipId)
  for (const element of children(document.documentElement)) if (removed.includes(element.getAttribute('Id') ?? '')) document.documentElement.removeChild(element)
  if (removed.length) context.entries.set(part, serializeXml(document))
}

function replaceTarget(root: import('@xmldom/xmldom').Element, kind: string, target: string): void {
  for (const element of children(root)) if (element.getAttribute('Type')?.endsWith(`/${kind}`)) element.setAttribute('Target', target)
}

function nextSlideId(context: PackageContext): string {
  const root = xmlPart(context, 'ppt/presentation.xml').documentElement
  context.slideIds ??= new Set(children(child(root, 'sldIdLst'), 'sldId').map(element => Number(element.getAttribute('id'))))
  let next = context.nextSlideId ?? 256
  while (context.slideIds.has(next)) next++
  context.slideIds.add(next)
  context.nextSlideId = next + 1
  return String(next)
}
