import { Editor, Transforms, Element as SlateElement, Path, Node } from "slate";
import type {
  TableElement,
  TableRowElement,
  TableCellElement,
  ParagraphElement,
  CustomElement,
} from "./types";

/**
 * Insert a new table at current selection
 */
export function insertTable(
  editor: Editor,
  rows: number = 2,
  cols: number = 2
): void {
  const table = createTable(rows, cols);
  
  // Insert table and paragraph after it
  Transforms.insertNodes(editor, [
    table,
    { type: "paragraph", children: [{ text: "" }] } as ParagraphElement,
  ]);
}

/**
 * Create a new table element
 */
export function createTable(rows: number, cols: number): TableElement {
  const tableRows: TableRowElement[] = [];

  for (let i = 0; i < rows; i++) {
    const cells: TableCellElement[] = [];
    for (let j = 0; j < cols; j++) {
      cells.push(createTableCell());
    }
    tableRows.push({
      type: "table-row",
      children: cells,
    });
  }

  return {
    type: "table",
    children: tableRows,
  };
}

/**
 * Create an empty table cell
 */
export function createTableCell(): TableCellElement {
  return {
    type: "table-cell",
    children: [createEmptyParagraph()],
  };
}

/**
 * Create an empty paragraph
 */
export function createEmptyParagraph(): ParagraphElement {
  return {
    type: "paragraph",
    children: [{ text: "" }],
  };
}

/**
 * Check if currently inside a table
 */
export function isInTable(editor: Editor): boolean {
  const [table] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === "table",
  });
  return !!table;
}

/**
 * Get the current table, row, and cell
 */
export function getTableContext(editor: Editor): {
  table: [TableElement, Path] | null;
  row: [TableRowElement, Path] | null;
  cell: [TableCellElement, Path] | null;
} {
  const [tableEntry] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === "table",
  });
  const [rowEntry] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === "table-row",
  });
  const [cellEntry] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === "table-cell",
  });

  return {
    table: tableEntry ? [tableEntry[0] as TableElement, tableEntry[1]] : null,
    row: rowEntry ? [rowEntry[0] as TableRowElement, rowEntry[1]] : null,
    cell: cellEntry ? [cellEntry[0] as TableCellElement, cellEntry[1]] : null,
  };
}

/**
 * Add a row after the current row
 */
export function addRowAfter(editor: Editor): void {
  const context = getTableContext(editor);
  if (!context.table || !context.row) return;

  const [table, tablePath] = context.table;
  const [, rowPath] = context.row;
  const colCount = table.children[0]?.children.length || 2;

  const newRow: TableRowElement = {
    type: "table-row",
    children: Array(colCount)
      .fill(null)
      .map(() => createTableCell()),
  };

  const insertPath = Path.next(rowPath);
  Transforms.insertNodes(editor, newRow, { at: insertPath });
}

/**
 * Add a row before the current row
 */
export function addRowBefore(editor: Editor): void {
  const context = getTableContext(editor);
  if (!context.row) return;

  const [, rowPath] = context.row;
  const [table] = context.table!;
  const colCount = table.children[0]?.children.length || 2;

  const newRow: TableRowElement = {
    type: "table-row",
    children: Array(colCount)
      .fill(null)
      .map(() => createTableCell()),
  };

  Transforms.insertNodes(editor, newRow, { at: rowPath });
}

/**
 * Add a column after the current column
 */
export function addColumnAfter(editor: Editor): void {
  const context = getTableContext(editor);
  if (!context.table || !context.cell) return;

  const [table, tablePath] = context.table;
  const [, cellPath] = context.cell;
  const colIndex = cellPath[cellPath.length - 1];

  // Add a cell to each row
  table.children.forEach((row, rowIndex) => {
    const insertPath = [...tablePath, rowIndex, colIndex + 1];
    Transforms.insertNodes(editor, createTableCell(), { at: insertPath });
  });
}

/**
 * Add a column before the current column
 */
export function addColumnBefore(editor: Editor): void {
  const context = getTableContext(editor);
  if (!context.table || !context.cell) return;

  const [table, tablePath] = context.table;
  const [, cellPath] = context.cell;
  const colIndex = cellPath[cellPath.length - 1];

  // Add a cell to each row
  table.children.forEach((row, rowIndex) => {
    const insertPath = [...tablePath, rowIndex, colIndex];
    Transforms.insertNodes(editor, createTableCell(), { at: insertPath });
  });
}

/**
 * Delete the current row
 */
export function deleteRow(editor: Editor): void {
  const context = getTableContext(editor);
  if (!context.table || !context.row) return;

  const [table] = context.table;
  const [, rowPath] = context.row;

  // Don't delete if it's the last row
  if (table.children.length <= 1) {
    deleteTable(editor);
    return;
  }

  Transforms.removeNodes(editor, { at: rowPath });
}

/**
 * Delete the current column
 */
export function deleteColumn(editor: Editor): void {
  const context = getTableContext(editor);
  if (!context.table || !context.cell) return;

  const [table, tablePath] = context.table;
  const [, cellPath] = context.cell;
  const colIndex = cellPath[cellPath.length - 1];

  // Don't delete if it's the last column
  if (table.children[0]?.children.length <= 1) {
    deleteTable(editor);
    return;
  }

  // Remove cell from each row (in reverse order to maintain indices)
  for (let i = table.children.length - 1; i >= 0; i--) {
    const deletePath = [...tablePath, i, colIndex];
    Transforms.removeNodes(editor, { at: deletePath });
  }
}

/**
 * Delete the entire table
 */
export function deleteTable(editor: Editor): void {
  const context = getTableContext(editor);
  if (!context.table) return;

  const [, tablePath] = context.table;
  Transforms.removeNodes(editor, { at: tablePath });
}

/**
 * Move to next cell (Tab key)
 */
export function moveToNextCell(editor: Editor): boolean {
  const context = getTableContext(editor);
  if (!context.table || !context.cell || !context.row) return false;

  const [table, tablePath] = context.table;
  const [, cellPath] = context.cell;
  const [, rowPath] = context.row;

  const rowIndex = rowPath[rowPath.length - 1];
  const colIndex = cellPath[cellPath.length - 1];
  const rowCount = table.children.length;
  const colCount = table.children[0]?.children.length || 0;

  let nextRowIndex = rowIndex;
  let nextColIndex = colIndex + 1;

  // Move to next row if at end of current row
  if (nextColIndex >= colCount) {
    nextColIndex = 0;
    nextRowIndex++;
  }

  // If at end of table, add a new row
  if (nextRowIndex >= rowCount) {
    addRowAfter(editor);
    nextRowIndex = rowCount; // The new row
    nextColIndex = 0;
  }

  // Select the first paragraph in the next cell
  const nextCellPath = [...tablePath, nextRowIndex, nextColIndex, 0, 0];
  Transforms.select(editor, { path: nextCellPath, offset: 0 });

  return true;
}

/**
 * Move to previous cell (Shift+Tab key)
 */
export function moveToPreviousCell(editor: Editor): boolean {
  const context = getTableContext(editor);
  if (!context.table || !context.cell || !context.row) return false;

  const [table, tablePath] = context.table;
  const [, cellPath] = context.cell;
  const [, rowPath] = context.row;

  const rowIndex = rowPath[rowPath.length - 1];
  const colIndex = cellPath[cellPath.length - 1];
  const colCount = table.children[0]?.children.length || 0;

  let prevRowIndex = rowIndex;
  let prevColIndex = colIndex - 1;

  // Move to previous row if at start of current row
  if (prevColIndex < 0) {
    prevColIndex = colCount - 1;
    prevRowIndex--;
  }

  // If at start of table, don't move
  if (prevRowIndex < 0) {
    return false;
  }

  // Select the first paragraph in the previous cell
  const prevCellPath = [...tablePath, prevRowIndex, prevColIndex, 0, 0];
  Transforms.select(editor, { path: prevCellPath, offset: 0 });

  return true;
}
