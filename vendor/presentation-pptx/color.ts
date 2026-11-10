import type { Element } from '@xmldom/xmldom'
import type { PresentationColor } from '../shared/presentation.ts'
import { child, children, numeric } from './xml.ts'
import { changeLuminance } from './color-luminance.ts'
import type { ShapeContext } from './types.ts'

/** An opaque sRGB color from a hexadecimal OOXML value. */
export function hexColor(value: string): PresentationColor {
  if (!/^[\da-f]{6}$/i.test(value)) throw Error('Некорректный OOXML цвет')
  return { r: parseInt(value.slice(0, 2), 16) / 255, g: parseInt(value.slice(2, 4), 16) / 255, b: parseInt(value.slice(4, 6), 16) / 255, a: 1 }
}
function schemeColor(node: Element, context: ShapeContext, depth: number): PresentationColor | null {
  const value = node.getAttribute('val') ?? ''
  if (value === 'phClr') return context.placeholderColor ?? null
  const mapped = context.colorMap?.getAttribute(value) || ({ tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' }[value]) || value
  const scheme = child(child(context.theme, 'themeElements'), 'clrScheme')
  const source = children(child(scheme, mapped))[0]
  return source ? readColor(source, context, depth + 1) : null
}
function transform(color: PresentationColor, effect: Element): PresentationColor {
  const fraction = numeric(effect, 'val') / 100000
  const operations: Record<string, (value: number) => number> = {
    tint: value => value + (1 - value) * fraction,
    shade: value => value * fraction,
  }
  const luminance: Record<string, (value: number) => number> = { lum: () => fraction, lumMod: value => value * fraction, lumOff: value => value + fraction }
  const adjust = luminance[effect.localName ?? '']
  if (adjust) return changeLuminance(color, adjust)
  if (effect.localName === 'alpha') return { ...color, a: fraction }
  const apply = operations[effect.localName ?? '']
  return apply ? { ...color, r: Math.max(0, Math.min(1, apply(color.r))), g: Math.max(0, Math.min(1, apply(color.g))), b: Math.max(0, Math.min(1, apply(color.b))) } : color
}
/** Resolves theme/system/sRGB paints and the common Office color transforms. */
export function readColor(node: Element | undefined, context: ShapeContext, depth = 0): PresentationColor | null {
  if (!node) return null
  if (depth > 8) throw Error('Циклический theme color')
  const color = baseColor(node, context, depth)
  if (!color) return null
  return children(node).reduce(transform, color)
}
/** Reads a solid fill while retaining unsupported paint in source XML. */
export function solidFill(parent: Element | undefined, context: ShapeContext): PresentationColor | null {
  return readColor(children(child(parent, 'solidFill'))[0], context)
}
/** Emits a color in OOXML sRGB notation. */
export function colorHex(color: PresentationColor): string {
  return [color.r, color.g, color.b].map(value => Math.round(value * 255).toString(16).padStart(2, '0')).join('')
}

function baseColor(node: Element, context: ShapeContext, depth: number): PresentationColor | null {
  switch (node.localName) {
    case 'srgbClr': return hexColor(node.getAttribute('val') ?? '')
    case 'sysClr': return hexColor(node.getAttribute('lastClr') || '000000')
    case 'schemeClr': return schemeColor(node, context, depth)
    default: return null
  }
}
