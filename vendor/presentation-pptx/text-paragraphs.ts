import type { PresentationText } from '../shared/presentation.ts'

/** A paragraph may contain soft newline characters without becoming several paragraphs. */
export type ParagraphSlice = { start: number; value: string }
function startAfter(text: PresentationText, index: number): number {
  if (index === 0) return 0
  const previous = text.paragraphs[index - 1]!
  return previous.start + previous.length + 1
}
function completeRanges(text: PresentationText): boolean {
  const last = text.paragraphs.at(-1)
  if (!last || last.start + last.length !== text.content.length) return false
  return text.paragraphs.every((paragraph, index) => paragraph.start === startAfter(text, index) && (index === 0 || text.content[paragraph.start - 1] === '\n'))
}
/** Uses supplied paragraph boundaries when valid; authored plain text receives hard paragraphs. */
export function paragraphSlices(text: PresentationText): ParagraphSlice[] {
  if (completeRanges(text)) return text.paragraphs.map(paragraph => ({ start: paragraph.start, value: text.content.slice(paragraph.start, paragraph.start + paragraph.length) }))
  let start = 0
  return text.content.split('\n').map(value => {
    const result = { start, value }
    start += value.length + 1
    return result
  })
}
