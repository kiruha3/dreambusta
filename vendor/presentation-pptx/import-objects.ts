import { randomUUID } from 'node:crypto'
import type { Element } from '@xmldom/xmldom'
import type { PresentationImage, PresentationObject, PresentationObjectBase, PresentationShape, PresentationText, PresentationWarning } from '../shared/presentation.ts'
import { PRESENTATION_MAX_OBJECTS } from './constants.ts'
import { child, children, descendants } from './xml.ts'
import { inheritedChild, shapeSources } from './inheritance.ts'
import { groupSpace, hasShear, lineBox, readBox } from './geometry.ts'
import { readText } from './text.ts'
import { readTable } from './import-table.ts'
import { readPaths, readGradient } from './import-vector.ts'
import { readImage } from './images.ts'
import { shapePaint } from './import-paint.ts'
import { hasMedia, unsupportedLabel, unsupportedVisual } from './unsupported.ts'
import type { ObjectBinding, ShapeContext } from './types.ts'

/** Import operation state, scoped to a single source document. */
export type ObjectImport = {
  objects: Map<string, ObjectBinding>; assets: PresentationImage[]; warnings: PresentationWarning[]
  identities: Map<string, string>; ownerSlide: string; shapeIds: Set<string>
}
function properties(shape: Element, context: ShapeContext): Element | undefined {
  return inheritedChild(shapeSources(shape, context), 'xfrm', shape.localName === 'grpSp' ? 'grpSpPr' : 'spPr') ?? child(shape, 'xfrm')
}
function objectBase(shape: Element, context: ShapeContext, state: ObjectImport): PresentationObjectBase {
  const identity = descendants(shape, 'cNvPr')[0]
  const shapeId = identity?.getAttribute('id') ?? ''
  const key = `${state.ownerSlide}:${context.part}:${shapeId}`
  const id = state.identities.get(key) ?? randomUUID()
  const box = readBox(properties(shape, context), context.space)
  const locked = context.inherited || hasShear(box, context.space)
  return { id, name: identity?.getAttribute('name') || 'Объект', box, locked, capabilities: { geometry: !locked, text: !locked, style: !locked, remove: !locked && context.canRemove !== false } }
}
function unsupported(base: PresentationObjectBase, label: string, state: ObjectImport): PresentationObject {
  state.warnings.push({ code: 'unsupported_object', objectId: base.id, detail: label })
  return { ...base, kind: 'unsupported', label, locked: true, capabilities: { geometry: false, text: false, style: false, remove: false } }
}
function importShape(shape: Element, context: ShapeContext, base: PresentationObjectBase, state: ObjectImport): PresentationObject {
  const paths = readPaths(shape, base.box, context)
  const gradient = readGradient(shape, context)
  if (unsupportedVisual(shape, false, [...(paths ? ['custGeom'] : []), ...(gradient ? ['gradFill'] : [])])) return unsupported(base, 'shape', state)
  const text = readText(shape, context)
  const paint = shapePaint(shape, context)
  if (plainTextBox(shape, text, paint)) return { ...base, kind: 'text', text }
  const preset = child(child(shape, 'spPr'), 'prstGeom')?.getAttribute('prst') ?? 'rect'
  const kind = basicShape(preset)
  if (!kind) return unsupported(base, 'shape', state)
  const box = kind === 'line' ? lineBox(base.box) : base.box
  if (descendants(shape, 'effectLst').some(effect => children(effect).length))
    state.warnings.push({ code: 'unsupported_effects', objectId: base.id })
  const adjustment = children(child(child(child(shape, 'spPr'), 'prstGeom'), 'avLst'))
    .find(value => value.getAttribute('name') === 'adj')?.getAttribute('fmla')
  const radius = /^val\s+([0-9]+)$/.exec(adjustment ?? '')
  const cornerRadius = preset === 'roundRect'
    ? Math.min(box.width, box.height) * Math.min(50000, Number(radius?.[1] ?? 16667)) / 100000
    : undefined
  return { ...base, box, kind: 'shape', shape: kind, ...paint, text, ...(cornerRadius === undefined ? {} : { cornerRadius }),
    ...(paths ? { paths } : {}), ...(gradient ? { gradient } : {}),
    ...(paths || gradient ? { locked: true, capabilities: { geometry: false, text: false, style: false, remove: false } } : {}),
  }
}
function importGroup(shape: Element, context: ShapeContext, base: PresentationObjectBase, state: ObjectImport): PresentationObject {
  const space = groupSpace(properties(shape, context), context.space)
  const objects = readObjects(shape, { ...context, space }, state)
  return { ...base, kind: 'group', objects, capabilities: { ...base.capabilities, geometry: false, text: false, style: false } }
}
function isTextBox(shape: Element): boolean {
  return child(child(shape, 'nvSpPr'), 'cNvSpPr')?.getAttribute('txBox') === '1'
}
function basicShape(preset: string) {
  return ({ rect: 'rectangle', roundRect: 'rectangle', ellipse: 'ellipse', line: 'line' } as const)[preset]
}
function readOne(shape: Element, context: ShapeContext, base: PresentationObjectBase, state: ObjectImport): PresentationObject {
  if (base.locked && !context.inherited) return unsupported(base, 'groupTransform', state)
  if (hasMedia(shape)) return unsupported(base, 'media', state)
  if (shape.localName === 'sp') return importShape(shape, context, base, state)
  if (shape.localName === 'grpSp') return importGroup(shape, context, base, state)
  if (shape.localName === 'pic') return readImage(shape, context, base, state.assets) ?? unsupported(base, 'imageFormat', state)
  if (shape.localName === 'graphicFrame') {
    const table = readTable(shape, context, base)
    if (table) return table
  }
  return unsupported(base, unsupportedLabel(shape), state)
}
function importObject(shape: Element, context: ShapeContext, state: ObjectImport): PresentationObject {
  assertShapeIdentity(shape, context, state)
  const result = readOne(shape, context, objectBase(shape, context, state), state)
  if (unsupportedText(shape)) { result.capabilities.text = false; state.warnings.push({ code: 'unsupported_text_features', objectId: result.id }) }
  const shapeId = descendants(shape, 'cNvPr')[0]?.getAttribute('id') ?? ''
  state.objects.set(result.id, { part: context.part, ownerSlide: state.ownerSlide, shapeId, inherited: context.inherited, space: context.space, baseline: structuredClone(result) })
  if (state.objects.size > PRESENTATION_MAX_OBJECTS) throw Error('Превышен лимит объектов PPTX')
  return result
}
/** Reads shape-tree siblings in exact source z-order. */
export function readObjects(tree: Element | undefined, context: ShapeContext, state: ObjectImport): PresentationObject[] {
  return children(tree).filter(shape => !['nvGrpSpPr', 'grpSpPr', 'extLst'].includes(shape.localName ?? '')).map(shape => importObject(shape, context, state))
}

function assertShapeIdentity(shape: Element, context: ShapeContext, state: ObjectImport): void {
  const value = descendants(shape, 'cNvPr')[0]?.getAttribute('id')
  if (!value) return
  const key = `${context.part}:${value}`
  if (state.shapeIds.has(key)) throw Error('Повторяющийся shape ID')
  state.shapeIds.add(key)
}

function unsupportedText(shape: Element): boolean {
  return descendants(shape, 'fld').length > 0 || descendants(shape, 'hlinkClick').length > 0
}

function plainTextBox(shape: Element, text: PresentationText | undefined, paint: Pick<PresentationShape, 'fill' | 'stroke'>): text is PresentationText {
  return text !== undefined && isTextBox(shape) && paint.fill === null && paint.stroke === null
}
