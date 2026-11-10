import type { Element } from '@xmldom/xmldom'
import { children, descendants } from './xml.ts'

const GRAPHIC_TYPES: Record<string, string> = {
  'http://schemas.openxmlformats.org/drawingml/2006/table': 'table',
  'http://schemas.openxmlformats.org/drawingml/2006/chart': 'chart',
  'http://schemas.openxmlformats.org/drawingml/2006/diagram': 'smartArt',
}
/** Identifies multimedia without exposing XML tags in presentation UI. */
export function hasMedia(shape: Element): boolean {
  return ['videoFile', 'audioFile', 'media', 'wavAudioFile'].some(name => descendants(shape, name).length > 0)
}
/** Stable localization codes, independent of source prefixes or product language. */
export function unsupportedLabel(shape: Element): string {
  if (hasMedia(shape)) return 'media'
  if (descendants(shape, 'oMath').length) return 'equation'
  const data = descendants(shape, 'graphicData')[0]
  const uri = data?.getAttribute('uri') ?? ''
  return GRAPHIC_TYPES[uri] ?? 'object'
}

/** Locks unsupported paints/effects instead of rendering an apparently editable empty shape. */
export function unsupportedVisual(shape: Element): boolean {
  const paints = ['custGeom', 'gradFill', 'pattFill', 'blipFill'].some(name => descendants(shape, name).length > 0)
  const effects = descendants(shape, 'effectLst').some(element => children(element).length > 0)
  return paints || effects
}
