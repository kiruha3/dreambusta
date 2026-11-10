import type { Element } from '@xmldom/xmldom'
import type { PresentationBox, PresentationColor, PresentationShape } from '../shared/presentation.ts'
import { append, children, ensure } from './xml.ts'
import { colorHex } from './color.ts'
import { EMU_PER_PIXEL } from './geometry.ts'
import type { CoordinateSpace } from './types.ts'

/** Sets a solid or transparent fill without replacing unrelated source properties. */
export function writeFill(parent: Element, color: PresentationColor | null): void {
  const previous = children(parent).find(element => ['solidFill', 'noFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'].includes(element.localName ?? ''))
  const paint = parent.ownerDocument!.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', color ? 'a:solidFill' : 'a:noFill')
  if (previous) parent.replaceChild(paint, previous)
  else parent.insertBefore(paint, paintInsertion(parent))
  if (!color) return
  const rgb = append(paint, 'a:srgbClr')
  rgb.setAttribute('val', colorHex(color))
  if (color.a < 1) append(rgb, 'a:alpha').setAttribute('val', String(Math.round(color.a * 100000)))
}
/** Writes a normalized box back in its original parent/group coordinates. */
export function writeBox(transform: Element, box: PresentationBox, space: CoordinateSpace): void {
  const offset = ensure(transform, 'a:off')
  const extent = ensure(transform, 'a:ext')
  offset.setAttribute('x', String(Math.round((box.x / space.scaleX + space.originX) * EMU_PER_PIXEL)))
  offset.setAttribute('y', String(Math.round((box.y / space.scaleY + space.originY) * EMU_PER_PIXEL)))
  extent.setAttribute('cx', String(Math.round(box.width / space.scaleX * EMU_PER_PIXEL)))
  extent.setAttribute('cy', String(Math.round(box.height / space.scaleY * EMU_PER_PIXEL)))
  transform.setAttribute('rot', String(Math.round(box.rotation * 60000 * (box.flipX === box.flipY ? 1 : -1))))
  transform.setAttribute('flipH', box.flipX ? '1' : '0')
  transform.setAttribute('flipV', box.flipY ? '1' : '0')
}
/** Writes only supported line properties. */
export function writeStroke(properties: Element, stroke: PresentationShape['stroke'], scale: number): void {
  const line = ensure(properties, 'a:ln')
  const after = children(properties).find(element => ['effectLst', 'effectDag', 'scene3d', 'sp3d', 'extLst'].includes(element.localName ?? ''))
  if (after) properties.insertBefore(line, after)
  line.setAttribute('w', String(Math.round((stroke?.width ?? 0) / scale * EMU_PER_PIXEL)))
  writeFill(line, stroke?.color ?? null)
}

function paintInsertion(parent: Element): Element | null {
  return children(parent).find(element => ['ln', 'effectLst', 'effectDag', 'latin', 'ea', 'cs', 'sym', 'hlinkClick', 'extLst'].includes(element.localName ?? '')) ?? null
}
