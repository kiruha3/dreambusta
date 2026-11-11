import type { Element } from '@xmldom/xmldom'
import type { PresentationBox, PresentationShape } from '../shared/presentation.ts'
import { child, children, numeric } from './xml.ts'
import { readColor } from './color.ts'
import { EMU_PER_PIXEL } from './geometry.ts'
import type { ShapeContext } from './types.ts'

function coordinate(point: Element, attribute: string, scale: number): string | undefined {
  const raw = point.getAttribute(attribute) ?? ''
  // Formula/guide evaluation is intentionally unsupported; never evaluate source expressions.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return undefined
  const value = Number(raw) * scale
  return Number.isFinite(value) && Math.abs(value) < 1e9 ? String(Math.round(value * 1e6) / 1e6) : undefined
}
/** Native freeform paths, limited to explicit points (not DrawingML guide expressions). */
export function readPaths(shape: Element, box: PresentationBox, context: ShapeContext): PresentationShape['paths'] {
  const geometry = child(child(shape, 'spPr'), 'custGeom')
  if (!geometry || children(child(geometry, 'gdLst')).length || children(child(geometry, 'avLst')).length) return undefined
  const paths = children(child(geometry, 'pathLst'), 'path')
  if (!paths.length || paths.length > 1024) return undefined
  const result: NonNullable<PresentationShape['paths']> = []
  let count = 0
  for (const path of paths) {
    const width = numeric(path, 'w', box.width / context.space.scaleX * EMU_PER_PIXEL)
    const height = numeric(path, 'h', box.height / context.space.scaleY * EMU_PER_PIXEL)
    if (width <= 0 || height <= 0) return undefined
    const commands: string[] = []
    for (const command of children(path)) {
      if (++count > 100000) throw Error('Превышен размер векторного контура PPTX')
      const spec = ({ moveTo: ['M', 1], lnTo: ['L', 1], cubicBezTo: ['C', 3], quadBezTo: ['Q', 2], close: ['Z', 0] } as const)[command.localName ?? '']
      if (!spec) return undefined
      const points = children(command, 'pt')
      if (points.length !== spec[1]) return undefined
      const values = points.flatMap(point => [coordinate(point, 'x', box.width / width), coordinate(point, 'y', box.height / height)])
      if (values.some(value => value === undefined)) return undefined
      commands.push([spec[0], ...values].join(' '))
    }
    result.push({ d: commands.join(' '), fill: path.getAttribute('fill') !== 'none', stroke: !['0', 'false'].includes(path.getAttribute('stroke') ?? '') })
  }
  return result
}
/** Circle/path gradients used for decorative translucent glows in exported decks. */
export function readGradient(shape: Element, context: ShapeContext): PresentationShape['gradient'] {
  const gradient = child(child(shape, 'spPr'), 'gradFill')
  const path = child(gradient, 'path')
  if (!gradient || path?.getAttribute('path') !== 'circle' || child(path, 'fillToRect') || child(gradient, 'tileRect')) return undefined
  const stops = children(child(gradient, 'gsLst'), 'gs')
  if (stops.length < 2 || stops.length > 256) return undefined
  const result: NonNullable<PresentationShape['gradient']>['stops'] = []
  for (const stop of stops) {
    const color = readColor(children(stop)[0], context)
    const offset = numeric(stop, 'pos') / 100000
    if (!color || offset < 0 || offset > 1) return undefined
    result.push({ offset, color })
  }
  return { kind: 'radial', stops: result.sort((a, b) => a.offset - b.offset) }
}
