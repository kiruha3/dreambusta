import type { Element } from '@xmldom/xmldom'
import type { PresentationTextStyle } from '../shared/presentation.ts'
import { solidFill } from './color.ts'
import { themeFont } from './inheritance.ts'
import { child } from './xml.ts'
import type { ShapeContext } from './types.ts'

function attribute(sources: Element[], name: string): string | undefined {
  return sources.map(source => source.getAttribute(name)).find(value => value !== null && value !== undefined && value !== '') ?? undefined
}
/** Resolves run properties after merging inherited paragraph defaults. */
export function runStyle(sources: Element[], context: ShapeContext): PresentationTextStyle {
  const family = sources.map(source => child(source, 'latin')?.getAttribute('typeface')).find(Boolean) || '+mn-lt'
  const fill = sources.map(source => solidFill(source, context)).find(Boolean)
  return {
    fontFamily: themeFont(family, context),
    fontSize: Number(attribute(sources, 'sz') ?? 1800) / 75 * context.space.scaleY,
    fontWeight: truthy(attribute(sources, 'b')) ? 700 : 400,
    italic: truthy(attribute(sources, 'i')),
    color: fill ?? { r: 0, g: 0, b: 0, a: 1 },
    underline: !['none', undefined].includes(attribute(sources, 'u')),
    strike: ['sngStrike', 'dblStrike'].includes(attribute(sources, 'strike') ?? ''),
  }
}
/** Explicit sources precede paragraph defaults and inherited run defaults. */
export function styleSources(run: Element | undefined, paragraph: Element | undefined, defaults: Element[]): Element[] {
  return [run, child(paragraph, 'defRPr'), ...defaults.map(source => child(source, 'defRPr'))].filter((element): element is Element => Boolean(element))
}

function truthy(value: string | undefined): boolean { return value === '1' || value === 'true' }
