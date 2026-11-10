import type { PresentationScene } from '../shared/presentation.ts'
import { child, ensure, serializeXml, xmlPart } from './xml.ts'
import { readPackage } from './read.ts'
import { commitCandidate } from './checkpoint.ts'
import { resolveOrigins } from './origins.ts'
import { writeArchive } from './archive.ts'
import { equal, validateEdits } from './validation.ts'
import { allocateSlide, removeSlides, setSlideOrder } from './write-slides.ts'
import { writeObjects } from './write-objects.ts'
import type { ObjectWriter } from './write-objects.ts'
import { writeFill } from './write-properties.ts'
import { EMU_PER_PIXEL } from './geometry.ts'
import type { PackageContext, PptxDocument } from './types.ts'

function preservedIdentities(document: PptxDocument): Map<string, string> {
  const result = new Map<string, string>()
  for (const [id, binding] of document.slides) result.set(binding.part, id)
  for (const [id, binding] of document.objects) result.set(`${binding.ownerSlide}:${binding.part}:${binding.shapeId}`, id)
  return result
}
function slideChanged(before: PresentationScene, after: PresentationScene): boolean {
  return !equal(before.slides.map(slide => slide.id), after.slides.map(slide => slide.id))
}
function dimensions(context: PackageContext, source: PresentationScene, scene: PresentationScene): void {
  if (source.width === scene.width && source.height === scene.height) return
  const presentation = xmlPart(context, 'ppt/presentation.xml')
  const size = child(presentation.documentElement, 'sldSz')
  if (!size) throw Error('Отсутствует размер слайда')
  size.setAttribute('cx', String(Math.round(scene.width * EMU_PER_PIXEL)))
  size.setAttribute('cy', String(Math.round(scene.height * EMU_PER_PIXEL)))
  context.entries.set('ppt/presentation.xml', serializeXml(presentation))
}
function writeOneSlide(writer: ObjectWriter, slide: PresentationScene['slides'][number], selected: ReturnType<typeof allocateSlide>): void {
  const { context } = writer
  writer.identities.set(selected.part, slide.id)
  const baseline = selected.original?.baseline
  if (equal(slide, baseline)) return
  writer.cloningSlide = Boolean(slide.cloneOf && !writer.source.slides.has(slide.id))
  const document = xmlPart(context, selected.part)
  const data = child(document.documentElement, 'cSld')
  const tree = child(data, 'spTree')
  if (!data || !tree) throw Error('Отсутствует shape tree')
  slideMetadata(data, slide, baseline)
  writeObjects(tree, slide.objects, selected.part, writer)
  context.entries.set(selected.part, serializeXml(document))
}
/** Builds an independent save candidate; callers commit it only after durable file writing. */
export async function writePptx(document: PptxDocument, scene: PresentationScene): Promise<{ bytes: Uint8Array; document: PptxDocument }> {
  const origins = resolveOrigins(document, scene)
  validateEdits(document, scene, origins)
  const context: PackageContext = { entries: new Map(document.entries), xml: new Map() }
  const writer: ObjectWriter = { source: document, context, scene, origins, identities: preservedIdentities(document), nextIds: new Map(), usedIds: new Map(), cloningSlide: false }
  const slides = scene.slides.map(slide => {
    const selected = allocateSlide(context, document, slide, origins.slides.get(slide.id))
    writeOneSlide(writer, slide, selected)
    return selected
  })
  if (slideChanged(document.scene, scene)) {
    setSlideOrder(context, slides)
    removeSlides(context, document, new Set(scene.slides.map(slide => slide.id)))
  }
  dimensions(context, document.scene, scene)
  const bytes = await writeArchive(context.entries)
  const candidate = readPackage(context.entries, writer.identities, scene.id)
  candidate.originalBytes = new Uint8Array(bytes)
  return { bytes, document: commitCandidate(candidate, scene) }
}

function slideMetadata(data: import('@xmldom/xmldom').Element, slide: PresentationScene['slides'][number], before: PresentationScene['slides'][number] | undefined): void {
  if (!equal(slide.background, before?.background)) writeBackground(data, slide.background)
  if (slide.name !== before?.name) data.setAttribute('name', slide.name)
}

function writeBackground(data: import('@xmldom/xmldom').Element, color: PresentationScene['slides'][number]['background']): void {
  const background = ensure(data, 'p:bg')
  data.insertBefore(background, child(data, 'spTree') ?? null)
  const reference = child(background, 'bgRef')
  if (reference) background.removeChild(reference)
  writeFill(ensure(background, 'p:bgPr'), color)
}
