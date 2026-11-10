import type { Element } from '@xmldom/xmldom'
import { child, children, descendants, numeric } from './xml.ts'
import type { ShapeContext } from './types.ts'

function placeholder(shape: Element): Element | undefined {
  const nonvisual = children(shape).find(element => element.localName?.startsWith('nv'))
  return child(child(nonvisual, 'nvPr'), 'ph')
}
function matching(root: Element | undefined, reference: Element, byIndex: boolean): Element | undefined {
  const source = placeholder(reference)
  if (!source) return undefined
  return descendants(root, 'sp').find(shape => {
    const candidate = placeholder(shape)
    if (!candidate) return false
    return byIndex ? numeric(candidate, 'idx') === numeric(source, 'idx') : (candidate.getAttribute('type') ?? 'obj') === (source.getAttribute('type') ?? 'obj')
  })
}
/** Returns source/inherited shapes in descending override priority. */
export function shapeSources(shape: Element, context: ShapeContext): Element[] {
  if (context.inherited) return [shape]
  const layout = matching(context.layout, shape, true)
  const master = matching(context.master, layout ?? shape, false)
  return [shape, layout, master].filter((element): element is Element => element !== undefined)
}
/** Finds the first explicitly defined property, including explicit noFill/false/zero. */
export function inheritedChild(sources: Element[], name: string, property = 'spPr'): Element | undefined {
  return sources.map(source => child(child(source, property), name)).find(Boolean)
}
/** Resolves inherited paragraph/run defaults, closest source first. */
export function textDefaults(shape: Element, context: ShapeContext, level: number): Element[] {
  const sources = shapeSources(shape, context)
  const listLevels = sources.map(source => child(child(child(source, 'txBody'), 'lstStyle'), `lvl${level + 1}pPr`))
  const type = sources.map(source => placeholder(source)?.getAttribute('type')).find(Boolean) ?? 'obj'
  const style = ['title', 'ctrTitle'].includes(type) ? 'titleStyle' : type === 'body' ? 'bodyStyle' : 'otherStyle'
  const masterLevel = child(child(child(context.master, 'txStyles'), style), `lvl${level + 1}pPr`)
  const globalLevel = child(context.defaultText, `lvl${level + 1}pPr`)
  const paragraphs = sources.slice(1).map(source => child(child(source, 'txBody'), 'p'))
  return [...paragraphs.map(paragraph => child(paragraph, 'pPr')), ...listLevels, masterLevel, globalLevel].filter((element): element is Element => Boolean(element))
}
/** Resolves a theme font reference without changing its source declaration. */
export function themeFont(name: string, context: ShapeContext): string {
  if (!name.startsWith('+m')) return name
  const kind = name.startsWith('+mj') ? 'majorFont' : 'minorFont'
  const scheme = child(child(child(context.theme, 'themeElements'), 'fontScheme'), kind)
  return child(scheme, 'latin')?.getAttribute('typeface') || 'Arial'
}
