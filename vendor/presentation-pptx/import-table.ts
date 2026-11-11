import type { Element } from '@xmldom/xmldom'
import type { PresentationObjectBase, PresentationTable, PresentationTableCell } from '../shared/presentation.ts'
import { child, children, numeric, NS } from './xml.ts'
import { EMU_PER_PIXEL } from './geometry.ts'
import { solidFill } from './color.ts'
import { readText } from './text.ts'
import { runStyle } from './text-style.ts'
import type { ShapeContext } from './types.ts'

function dimension(value: number, allowZero = false): number {
  if (value < 0 || (!allowZero && value === 0)) throw Error('Некорректный размер таблицы PPTX')
  return value
}
function span(cell: Element, attribute: string, remaining: number): number {
  const value = numeric(cell, attribute, 1)
  if (!Number.isInteger(value) || value < 1 || value > remaining) throw Error('Некорректное объединение ячеек PPTX')
  return value
}
function cellText(cell: Element, context: ShapeContext): PresentationTableCell['text'] {
  const text = readText(cell, context) ?? {
    content: '', runs: [], paragraphs: [], defaultStyle: runStyle([], context),
    verticalAlign: 'top', insets: { left: 0, right: 0, top: 0, bottom: 0 },
  }
  const properties = child(cell, 'tcPr')
  text.verticalAlign = ({ ctr: 'center', b: 'bottom' } as const)[properties?.getAttribute('anchor') ?? ''] ?? 'top'
  text.insets = {
    left: numeric(properties, 'marL', 91440) / EMU_PER_PIXEL * context.space.scaleX,
    right: numeric(properties, 'marR', 91440) / EMU_PER_PIXEL * context.space.scaleX,
    top: numeric(properties, 'marT', 45720) / EMU_PER_PIXEL * context.space.scaleY,
    bottom: numeric(properties, 'marB', 45720) / EMU_PER_PIXEL * context.space.scaleY,
  }
  return text
}
function border(properties: Element | undefined, side: string, context: ShapeContext): PresentationTableCell['borders']['left'] {
  const line = child(properties, `ln${side}`)
  const color = solidFill(line, context)
  return color && !child(line, 'noFill')
    ? { color, width: Math.max(0, numeric(line, 'w', 12700)) / EMU_PER_PIXEL * context.space.scaleY }
    : null
}
/** Imports native table cells in reading order, retaining grid geometry and explicit paint. */
export function readTable(frame: Element, context: ShapeContext, base: PresentationObjectBase): PresentationTable | undefined {
  const data = child(child(frame, 'graphic'), 'graphicData')
  const table = child(data, 'tbl')
  if (data?.getAttribute('uri') !== `${NS.a.replace('/main', '')}/table` || !table) return undefined
  const rows = children(table, 'tr')
  const columns = children(child(table, 'tblGrid'), 'gridCol').map(col => dimension(numeric(col, 'w')) / EMU_PER_PIXEL * context.space.scaleX)
  if (!rows.length || !columns.length || rows.length * columns.length > 100000) throw Error('Превышен размер таблицы PPTX')
  const cells: PresentationTableCell[] = []
  rows.forEach((row, rowIndex) => {
    const sourceCells = children(row, 'tc')
    if (sourceCells.length !== columns.length) throw Error('Некорректная сетка таблицы PPTX')
    sourceCells.forEach((cell, column) => {
      if (['hMerge', 'vMerge'].some(name => ['1', 'true'].includes(cell.getAttribute(name) ?? ''))) return
      const properties = child(cell, 'tcPr')
      cells.push({
        row: rowIndex, column,
        rowSpan: span(cell, 'rowSpan', rows.length - rowIndex), columnSpan: span(cell, 'gridSpan', columns.length - column),
        text: cellText(cell, context), fill: solidFill(properties, context),
        borders: {
          left: border(properties, 'L', context), right: border(properties, 'R', context),
          top: border(properties, 'T', context), bottom: border(properties, 'B', context),
        },
      })
    })
  })
  return {
    ...base, kind: 'table', columns, rows: rows.map(row => dimension(numeric(row, 'h'), true) / EMU_PER_PIXEL * context.space.scaleY), cells,
    locked: true, capabilities: { geometry: false, text: false, style: false, remove: false },
  }
}
