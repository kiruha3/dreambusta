import type { Element } from '@xmldom/xmldom'
import type { PresentationParagraph, PresentationRun, PresentationText } from '../shared/presentation.ts'
import { PRESENTATION_MAX_TEXT_LENGTH } from './constants.ts'
import { textDefaults, shapeSources } from './inheritance.ts'
import { runStyle, styleSources } from './text-style.ts'
import { child, children, numeric } from './xml.ts'
import { EMU_PER_PIXEL } from './geometry.ts'
import type { ShapeContext } from './types.ts'

type TextAccumulator = { content: string; runs: PresentationRun[]; paragraphs: PresentationParagraph[] }
function alignment(value: string | null | undefined): PresentationParagraph['align'] {
  return ({ l: 'left', ctr: 'center', r: 'right', just: 'justify' } as const)[value ?? ''] ?? 'left'
}
function addParagraph(acc: TextAccumulator, paragraph: Element, shape: Element, context: ShapeContext): void {
  if (acc.paragraphs.length) acc.content += '\n'
  const start = acc.content.length
  const properties = child(paragraph, 'pPr')
  const level = numeric(properties, 'lvl')
  const defaults = textDefaults(shape, context, level)
  for (const run of children(paragraph)) addRun(acc, run, properties, defaults, context)
  const align = properties?.getAttribute('algn') || defaults.map(source => source.getAttribute('algn')).find(Boolean)
  acc.paragraphs.push({ start, length: acc.content.length - start, align: alignment(align), level })
}
function addRun(acc: TextAccumulator, run: Element, paragraph: Element | undefined, defaults: Element[], context: ShapeContext): void {
  if (run.localName === 'br') { acc.content += '\n'; return }
  if (!['r', 'fld'].includes(run.localName ?? '')) return
  const text = child(run, 't')?.textContent ?? ''
  acc.runs.push({ start: acc.content.length, length: text.length, ...runStyle(styleSources(child(run, 'rPr'), paragraph, defaults), context) })
  acc.content += text
  if (acc.content.length > PRESENTATION_MAX_TEXT_LENGTH) throw Error('Превышен размер текста PPTX')
}
/** Imports native rich text, explicit breaks, empty paragraphs, styles and body geometry. */
export function readText(shape: Element, context: ShapeContext): PresentationText | undefined {
  const body = child(shape, 'txBody')
  if (!body) return undefined
  const acc: TextAccumulator = { content: '', runs: [], paragraphs: [] }
  for (const paragraph of children(body, 'p')) addParagraph(acc, paragraph, shape, context)
  const inheritedBodies = shapeSources(shape, context).map(source => child(child(source, 'txBody'), 'bodyPr'))
  const properties = inheritedBodies.filter((element): element is Element => Boolean(element))
  const defaults = textDefaults(shape, context, 0)
  const baseStyle = defaultStyle(acc.runs[0]) ?? runStyle(styleSources(undefined, undefined, defaults), context)
  return {
    ...acc, defaultStyle: { ...baseStyle },
    ...bodyProperties(properties),
  }
}

function bodyAttribute(sources: Element[], name: string): string | undefined {
  return sources.map(source => source.getAttribute(name)).find(value => value !== null && value !== '') ?? undefined
}
function bodyNumber(sources: Element[], name: string, fallback: number): number {
  return Number(bodyAttribute(sources, name) ?? fallback) / EMU_PER_PIXEL
}
function bodyProperties(sources: Element[]): Pick<PresentationText, 'verticalAlign' | 'insets'> {
  return {
    verticalAlign: ({ ctr: 'center', b: 'bottom' } as const)[bodyAttribute(sources, 'anchor') ?? ''] ?? 'top',
    insets: {
      left: bodyNumber(sources, 'lIns', 91440), right: bodyNumber(sources, 'rIns', 91440),
      top: bodyNumber(sources, 'tIns', 45720), bottom: bodyNumber(sources, 'bIns', 45720),
    },
  }
}

function defaultStyle(run: PresentationRun | undefined): PresentationText['defaultStyle'] | undefined {
  if (!run) return undefined
  const { start: _start, length: _length, ...style } = run
  return style
}
