import type { Element } from '@xmldom/xmldom'
import { child, descendants, xmlPart } from './xml.ts'
import { related } from './relationships.ts'
import { ROOT_SPACE } from './geometry.ts'
import type { PackageContext, ShapeContext } from './types.ts'

type RelatedRoot = { part: string; root: Element }
function rootRelated(context: PackageContext, part: string | undefined, kind: string): RelatedRoot | undefined {
  if (!part) return undefined
  const path = related(context, part, kind)
  return path ? { part: path, root: xmlPart(context, path).documentElement } : undefined
}
function partOf(root: RelatedRoot | undefined): string | undefined { return root?.part }
function rootOf(root: RelatedRoot | undefined): Element | undefined { return root?.root }
function overrideColor(root: Element | undefined): Element | undefined { return child(child(root, 'clrMapOvr'), 'overrideClrMapping') }
function colorMap(slide: Element, layout: Element | undefined, master: Element | undefined): Element | undefined {
  return overrideColor(slide) ?? overrideColor(layout) ?? child(master, 'clrMap')
}
/** Resolves the complete slide-layout-master-theme relationship chain. */
export function slideContext(context: PackageContext, part: string, presentation: Element): ShapeContext {
  const layout = rootRelated(context, part, 'slideLayout')
  const master = rootRelated(context, partOf(layout), 'slideMaster')
  const theme = rootRelated(context, partOf(master), 'theme')
  const override = rootRelated(context, part, 'themeOverride')
  const slide = xmlPart(context, part).documentElement
  return {
    package: context, part, layout: rootOf(layout), master: rootOf(master), theme: rootOf(override ?? theme),
    defaultText: child(presentation, 'defaultTextStyle'), colorMap: colorMap(slide, rootOf(layout), rootOf(master)),
    inherited: false, space: ROOT_SPACE, canRemove: descendants(slide, 'timing').length === 0,
  }
}
