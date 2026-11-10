import type { Element } from '@xmldom/xmldom'
import type { PresentationObject, PresentationScene } from '../shared/presentation.ts'
import { child, children, descendants, ensure, xmlPart } from './xml.ts'
import { equal } from './validation.ts'
import { EMU_PER_PIXEL, ROOT_SPACE } from './geometry.ts'
import { writeImage } from './write-images.ts'
import { newShape } from './new-object.ts'
import { patchProperties } from './patch-object.ts'
import type { PresentationOrigins } from './origins.ts'
import type { ObjectBinding, PackageContext, PptxDocument } from './types.ts'

/** Source-preserving write state, private to one candidate save. */
export type ObjectWriter = {
  source: PptxDocument; context: PackageContext; scene: PresentationScene
  identities: Map<string, string>; origins: PresentationOrigins; nextIds: Map<string, number>; usedIds: Map<string, Set<number>>; cloningSlide: boolean
}
function sourceShape(tree: Element | undefined, shapeId: string): Element | undefined {
  for (const element of children(tree)) {
    if (['nvGrpSpPr', 'grpSpPr', 'extLst'].includes(element.localName ?? '')) continue
    if (descendants(element, 'cNvPr')[0]?.getAttribute('id') === shapeId) return element
    if (element.localName === 'grpSp') {
      const found = sourceShape(element, shapeId)
      if (found) return found
    }
  }
  return undefined
}
function nextId(writer: ObjectWriter, part: string): string {
  const root = xmlPart(writer.context, part).documentElement
  const used = writer.usedIds.get(part) ?? new Set(descendants(root, 'cNvPr').map(element => Number(element.getAttribute('id'))))
  writer.usedIds.set(part, used)
  let current = writer.nextIds.get(part) ?? 2
  while (used.has(current)) current++
  used.add(current)
  writer.nextIds.set(part, current + 1)
  return String(current)
}
function patchImage(shape: Element, object: PresentationObject, before: PresentationObject | undefined, part: string, writer: ObjectWriter): void {
  if (object.kind !== 'image') return
  const old = before?.kind === 'image' ? before : undefined
  const asset = writer.scene.assets.find(image => image.id === object.assetId)
  const oldAsset = writer.source.scene.assets.find(image => image.id === old?.assetId)
  const paint = (image: typeof old) => image ? { assetId: image.assetId, crop: image.crop, opacity: image.opacity } : undefined
  if (!equal(paint(old), paint(object)) || !equal(asset, oldAsset)) writeImage(shape, object, writer.scene, writer.context, part)
}
function objectElement(tree: Element, object: PresentationObject, part: string, writer: ObjectWriter): { shape: Element; binding?: ObjectBinding } {
  const binding = bindingOf(writer, object)
  if (binding?.inherited) throw Error('Нельзя переместить inherited объект')
  const reusable = reusableSource(writer, object, binding)
  const source = reusable && binding ? sourceShape(child(child(xmlPart(writer.context, part).documentElement, 'cSld'), 'spTree'), binding.shapeId) : undefined
  if (source) return { shape: source, binding }
  return { shape: newShape(tree, object, nextId(writer, part)) }
}
function writeObject(tree: Element, object: PresentationObject, part: string, writer: ObjectWriter): Element | undefined {
  if (inheritedObject(writer, object, part)) return undefined
  const { shape, binding } = objectElement(tree, object, part, writer)
  const before = binding?.baseline
  if (object.kind !== 'unsupported') patchProperties(shape, object, before, binding?.space ?? ROOT_SPACE)
  patchImage(shape, object, before, part, writer)
  renameShape(shape, object, before)
  if (object.kind === 'group') writeGroup(shape, object, part, writer, before === undefined)
  const shapeId = shapeIdentity(shape)
  writer.identities.set(`${part}:${part}:${shapeId}`, object.id)
  return shape
}
function writeGroup(shape: Element, object: Extract<PresentationObject, { kind: 'group' }>, part: string, writer: ObjectWriter, fresh: boolean): void {
  if (fresh) {
    const transform = ensure(ensure(shape, 'p:grpSpPr'), 'a:xfrm')
    ensure(transform, 'a:chOff').setAttribute('x', '0')
    ensure(transform, 'a:chOff').setAttribute('y', '0')
    const extent = ensure(transform, 'a:chExt')
    extent.setAttribute('cx', String(Math.round(object.box.width * EMU_PER_PIXEL)))
    extent.setAttribute('cy', String(Math.round(object.box.height * EMU_PER_PIXEL)))
  }
  writeObjects(shape, object.objects, part, writer)
}
/** Updates siblings while retaining unsupported elements and shape/group membership. */
export function writeObjects(tree: Element, objects: PresentationObject[], part: string, writer: ObjectWriter): void {
  const nodes = objects.map(object => writeObject(tree, object, part, writer)).filter((node): node is Element => node !== undefined)
  for (const element of children(tree)) if (!['nvGrpSpPr', 'grpSpPr', 'extLst'].includes(element.localName ?? '')) tree.removeChild(element)
  for (const node of nodes) tree.insertBefore(node, child(tree, 'extLst') ?? null)
}

function bindingOf(writer: ObjectWriter, object: PresentationObject): ObjectBinding | undefined {
  return writer.origins.objects.get(object.id)
}
function reusableSource(writer: ObjectWriter, object: PresentationObject, binding: ObjectBinding | undefined): boolean {
  if (!binding) return false
  return !object.cloneOf || writer.cloningSlide || writer.source.objects.has(object.id)
}
function inheritedObject(writer: ObjectWriter, object: PresentationObject, part: string): boolean {
  const binding = bindingOf(writer, object)
  if (!binding?.inherited) return false
  writer.identities.set(`${part}:${binding.part}:${binding.shapeId}`, object.id)
  return true
}
function renameShape(shape: Element, object: PresentationObject, before: PresentationObject | undefined): void {
  if (object.name !== before?.name) descendants(shape, 'cNvPr')[0]?.setAttribute('name', object.name)
}
function shapeIdentity(shape: Element): string { return descendants(shape, 'cNvPr')[0]?.getAttribute('id') ?? '' }
