import type { Element } from '@xmldom/xmldom'
import type { PresentationRun, PresentationText, PresentationTextStyle } from '../shared/presentation.ts'
import { append, child, children, ensure } from './xml.ts'
import { writeFill } from './write-properties.ts'
import { EMU_PER_PIXEL } from './geometry.ts'
import { paragraphSlices } from './text-paragraphs.ts'

function writeStyle(element: Element, style: PresentationTextStyle, scale: number): void {
  element.setAttribute('sz', String(Math.round(style.fontSize / scale * 75)))
  element.setAttribute('b', style.fontWeight >= 600 ? '1' : '0')
  element.setAttribute('i', style.italic ? '1' : '0')
  element.setAttribute('u', style.underline ? 'sng' : 'none')
  element.setAttribute('strike', style.strike ? 'sngStrike' : 'noStrike')
  writeFill(element, style.color)
  ensure(element, 'a:latin').setAttribute('typeface', style.fontFamily)
}
function segments(text: PresentationText, start: number, end: number): { start: number; end: number; style: PresentationTextStyle }[] {
  const boundaries = new Set([start, end])
  for (const run of text.runs) {
    boundaries.add(Math.max(start, Math.min(end, run.start)))
    boundaries.add(Math.max(start, Math.min(end, run.start + run.length)))
  }
  const sorted = [...boundaries].sort((left, right) => left - right)
  return sorted.slice(0, -1).map((offset, index) => ({ start: offset, end: sorted[index + 1]!, style: text.runs.find(run => run.start <= offset && run.start + run.length > offset) ?? text.defaultStyle }))
}
function writeToken(paragraph: Element, text: string, style: PresentationTextStyle | PresentationRun, scale: number): void {
  const run = append(paragraph, 'a:r')
  writeStyle(append(run, 'a:rPr'), style, scale)
  const value = append(run, 'a:t')
  value.setAttribute('xml:space', 'preserve')
  value.appendChild(value.ownerDocument!.createTextNode(text))
}
function writeParagraph(body: Element, text: PresentationText, index: number, offset: number, value: string, previous: Element | undefined, scale: number): void {
  const paragraph = append(body, 'a:p')
  const oldProperties = child(previous, 'pPr')
  if (oldProperties) paragraph.appendChild(oldProperties.cloneNode(true))
  const properties = ensure(paragraph, 'a:pPr')
  paragraphProperties(properties, text, index, offset, scale)
  for (const segment of segments(text, offset, offset + value.length)) writeRun(paragraph, text.content.slice(segment.start, segment.end), segment.style, scale)
  const end = child(previous, 'endParaRPr')
  if (end) paragraph.appendChild(end.cloneNode(true))
}
/** Rebuilds changed supported text while retaining paragraph/body extension properties. */
export function writeText(shape: Element, text: PresentationText, scale: number): void {
  const body = ensure(shape, 'p:txBody')
  const properties = ensure(body, 'a:bodyPr')
  ensure(body, 'a:lstStyle')
  properties.setAttribute('anchor', ({ top: 't', center: 'ctr', bottom: 'b' })[text.verticalAlign])
  for (const [key, attribute] of [['left', 'lIns'], ['right', 'rIns'], ['top', 'tIns'], ['bottom', 'bIns']] as const) properties.setAttribute(attribute, String(Math.round(text.insets[key] * EMU_PER_PIXEL)))
  const previous = children(body, 'p')
  for (const paragraph of previous) body.removeChild(paragraph)
  paragraphSlices(text).forEach((paragraph, index) => {
    writeParagraph(body, text, index, paragraph.start, paragraph.value, previous[index], scale)
  })
}

function paragraphProperties(properties: Element, text: PresentationText, index: number, offset: number, scale: number): void {
  const definition = text.paragraphs.find(item => item.start === offset) ?? text.paragraphs[index]
  const align = definition?.align ?? 'left'
  properties.setAttribute('algn', ({ left: 'l', center: 'ctr', right: 'r', justify: 'just' })[align])
  properties.setAttribute('lvl', String(definition?.level ?? 0))
  writeStyle(ensure(properties, 'a:defRPr'), text.defaultStyle, scale)
}

function writeRun(paragraph: Element, text: string, style: PresentationTextStyle | PresentationRun, scale: number): void {
  text.split('\n').forEach((value, index) => {
    if (index > 0) append(paragraph, 'a:br')
    if (value) writeToken(paragraph, value, style, scale)
  })
}
