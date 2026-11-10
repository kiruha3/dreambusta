import type { Element } from '@xmldom/xmldom'
import type { PresentationObject } from '../shared/presentation.ts'
import { ensure } from './xml.ts'
import { equal } from './validation.ts'
import { lineBox } from './geometry.ts'
import { writeBox, writeFill, writeStroke } from './write-properties.ts'
import { writeText } from './write-text.ts'
import type { CoordinateSpace } from './types.ts'

function patchPaint(properties: Element, object: PresentationObject, before: PresentationObject | undefined, space: CoordinateSpace): void {
  if (object.kind !== 'shape') return
  const old = before?.kind === 'shape' ? before : undefined
  if (!equal(object.fill, old?.fill)) writeFill(properties, object.fill)
  if (!equal(object.stroke, old?.stroke)) writeStroke(properties, object.stroke, space.scaleY)
  patchPreset(properties, object, old)
}
function patchText(shape: Element, object: PresentationObject, before: PresentationObject | undefined, scale: number): void {
  const text = objectText(object)
  const oldText = objectText(before)
  if (text && !equal(text, oldText)) writeText(shape, text, scale)
}
/** Patches supported properties while leaving unknown source markup intact. */
export function patchProperties(shape: Element, object: PresentationObject, before: PresentationObject | undefined, space: CoordinateSpace): void {
  const properties = ensure(shape, object.kind === 'group' ? 'p:grpSpPr' : 'p:spPr')
  if (!equal(object.box, before?.box)) patchBox(properties, object, space)
  patchPaint(properties, object, before, space)
  patchText(shape, object, before, space.scaleY)
  if (object.kind === 'text' && !before) { writeFill(properties, null); writeStroke(properties, null, 1) }
}
function patchBox(properties: Element, object: PresentationObject, space: CoordinateSpace): void {
  const box = object.kind === 'shape' && object.shape === 'line' ? lineBox(object.box, true) : object.box
  const transform = ensure(properties, 'a:xfrm')
  if (properties.firstChild !== transform) properties.insertBefore(transform, properties.firstChild)
  writeBox(transform, box, space)
}

function objectText(object: PresentationObject | undefined) {
  if (!object) return undefined
  return object.kind === 'text' || object.kind === 'shape' ? object.text : undefined
}
function patchPreset(properties: Element, object: Extract<PresentationObject, { kind: 'shape' }>, before: Extract<PresentationObject, { kind: 'shape' }> | undefined): void {
  if (object.shape !== before?.shape) ensure(properties, 'a:prstGeom').setAttribute('prst', ({ rectangle: 'rect', ellipse: 'ellipse', line: 'line' })[object.shape])
}
