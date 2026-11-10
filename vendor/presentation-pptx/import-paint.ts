import type { Element } from '@xmldom/xmldom'
import { child, children, numeric } from './xml.ts'
import { readColor, solidFill } from './color.ts'
import { shapeSources } from './inheritance.ts'
import { EMU_PER_PIXEL } from './geometry.ts'
import type { ShapeContext } from './types.ts'
import type { PresentationColor, PresentationShape } from '../shared/presentation.ts'

type Paint = { node: Element; reference?: PresentationColor }
function explicitPaint(shape: Element, type: 'fill' | 'ln'): Element | undefined {
  const properties = child(shape, 'spPr')
  if (type === 'ln') return child(properties, 'ln')
  return children(properties).find(node => ['solidFill', 'noFill', 'gradFill', 'blipFill'].includes(node.localName ?? ''))
}
function themedPaint(shape: Element, context: ShapeContext, type: 'fill' | 'ln'): Paint | undefined {
  const reference = child(child(shape, 'style'), `${type}Ref`)
  const list = child(child(child(context.theme, 'themeElements'), 'fmtScheme'), type === 'fill' ? 'fillStyleLst' : 'lnStyleLst')
  const node = children(list)[numeric(reference, 'idx') - 1]
  const color = readColor(children(reference)[0], context)
  return node ? { node, reference: color ?? undefined } : undefined
}
function paintSource(shape: Element, context: ShapeContext, type: 'fill' | 'ln'): Paint | undefined {
  for (const source of shapeSources(shape, context)) {
    const node = explicitPaint(source, type)
    if (node) return { node }
    const themed = themedPaint(source, context, type)
    if (themed) return themed
  }
  return undefined
}
function paintColor(paint: Paint | undefined, context: ShapeContext): PresentationColor | null {
  if (!paint) return null
  const effective = { ...context, placeholderColor: paint.reference }
  return paint.node.localName === 'solidFill' ? readColor(children(paint.node)[0], effective) : solidFill(paint.node, effective)
}
/** Resolves inherited solid paints and theme style-reference placeholder colors. */
export function shapePaint(shape: Element, context: ShapeContext): Pick<PresentationShape, 'fill' | 'stroke'> {
  const fill = paintSource(shape, context, 'fill')
  const line = paintSource(shape, context, 'ln')
  return { fill: paintColor(fill, context), stroke: stroke(line, context) }
}
function stroke(paint: Paint | undefined, context: ShapeContext): PresentationShape['stroke'] {
  if (!paint || child(paint.node, 'noFill')) return null
  return { color: paintColor(paint, context) ?? { r: 0, g: 0, b: 0, a: 1 }, width: numeric(paint.node, 'w', 12700) / EMU_PER_PIXEL * context.space.scaleY }
}
/** Resolves the nearest inherited slide background. */
export function background(roots: (Element | undefined)[], context: ShapeContext): PresentationColor | null {
  const source = roots.map(root => child(child(root, 'cSld'), 'bg')).find(Boolean)
  const direct = solidFill(child(source, 'bgPr'), context)
  if (direct) return direct
  return readColor(children(child(source, 'bgRef'))[0], context)
}
