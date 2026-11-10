import { Descendant } from "slate";
import type {
  DocumentElement,
  ParagraphElement as DocParagraph,
  TableElement as DocTable,
  TableRowElement as DocTableRow,
  TableCellElement as DocTableCell,
  RunElement,
  TextElement,
  Document,
} from "../layout/types";
import type {
  CustomElement,
  CustomText,
  ParagraphElement,
  TableElement,
  TableRowElement,
  TableCellElement,
  ImageElement,
  ListItemElement,
  BulletedListElement,
  NumberedListElement,
  DividerElement,
  HeadingOneElement,
  HeadingTwoElement,
  HeadingThreeElement,
} from "./types";

// Counter for generating unique uids
let uidCounter = 0;

/**
 * Generate a unique uid for a node
 */
function generateUid(): string {
  return `n${uidCounter++}`;
}

/**
 * Ensure all block-level nodes have uid for stable AI suggestion references
 */
export function ensureUids(nodes: Descendant[], parentUid?: string): Descendant[] {
  return nodes.map((node, index) => {
    // Skip text nodes (they don't need uid)
    if ("text" in node) {
      return node;
    }
    
    const element = node as any;
    // Keep existing uid or generate new one
    const uid = element.uid || (parentUid ? `${parentUid}-${index}` : generateUid());
    
    // Recursively process children if they have block-level elements
    let children = element.children;
    if (children && Array.isArray(children)) {
      // Check if any children are block-level (have 'type' property)
      const hasBlockChildren = children.some((c: any) => c.type);
      if (hasBlockChildren) {
        children = ensureUids(children, uid);
      }
    }
    
    return {
      ...element,
      uid,
      children,
    };
  });
}

/**
 * Reset uid counter (useful when loading new document)
 */
export function resetUidCounter() {
  uidCounter = 0;
}

/**
 * Convert Document model to Slate Descendant array
 */
export function documentToSlate(doc: Document): Descendant[] {
  // Reset counter for new document
  resetUidCounter();

  const filtered = doc.elements.filter(filterDropCapsAndFloating);

  // elementToSlate may return single element, array of elements, or null
  const flatResult: Descendant[] = [];
  for (const element of filtered) {
    const converted = elementToSlate(element);
    if (converted) {
      if (Array.isArray(converted)) {
        flatResult.push(...converted);
      } else {
        flatResult.push(converted);
      }
    }
  }

  // Group consecutive list-item elements into bulleted-list / numbered-list containers
  const result = groupListItems(flatResult);

  // Slate requires at least one element with text
  if (result.length === 0) {
    return [{ type: "paragraph", uid: generateUid(), children: [{ text: "" }] }];
  }

  // Validate each element has text children, then add uids
  const withTextChildren = result.map(ensureTextChildren);
  return ensureUids(withTextChildren);
}

/**
 * Group consecutive list-item elements into bulleted-list / numbered-list wrappers
 */
function groupListItems(nodes: Descendant[]): Descendant[] {
  const result: Descendant[] = [];
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i] as any;

    if (node.type === "list-item") {
      // Start collecting consecutive list items of the same type
      const listType = node.listType as "bullet" | "numbered";
      const slateListType = listType === "bullet" ? "bulleted-list" : "numbered-list";
      const items: ListItemElement[] = [node as ListItemElement];
      i++;

      // Collect all consecutive list items (regardless of type - they can be mixed in Word)
      while (i < nodes.length && (nodes[i] as any).type === "list-item") {
        items.push(nodes[i] as any as ListItemElement);
        i++;
      }

      // Group into list containers by consecutive same-type runs
      let j = 0;
      while (j < items.length) {
        const currentType = items[j].listType === "bullet" ? "bulleted-list" : "numbered-list";
        const groupItems: ListItemElement[] = [items[j]];
        j++;

        while (j < items.length) {
          const nextType = items[j].listType === "bullet" ? "bulleted-list" : "numbered-list";
          if (nextType === currentType) {
            groupItems.push(items[j]);
            j++;
          } else {
            break;
          }
        }

        result.push({
          type: currentType as "bulleted-list" | "numbered-list",
          children: groupItems,
        } as BulletedListElement | NumberedListElement);
      }
    } else {
      result.push(node);
      i++;
    }
  }

  return result;
}

/**
 * Extract plain text from children for filtering
 */
function extractPlainText(children: DocumentElement[]): string {
  let text = "";
  for (const child of children) {
    if (child.type === "run") {
      const run = child as RunElement;
      for (const c of run.children || []) {
        if (c.type === "text") {
          text += (c as TextElement).text;
        }
      }
    } else if (child.type === "text") {
      text += (child as TextElement).text;
    }
  }
  return text;
}

/**
 * Filter out drop caps and floating text boxes from DOCX
 */
function filterDropCapsAndFloating(element: DocumentElement): boolean {
  if (element.type !== "paragraph") return true;
  
  const para = element as DocParagraph;
  
  // Check for framePr (indicates drop cap or floating text box)
  if (para.props?.framePr) {
    return false;
  }
  
  // Check for dropCap property
  if (para.props?.dropCap) {
    return false;
  }
  
  return true;
}

/**
 * Ensure element has valid text children (required by Slate)
 */
function ensureTextChildren(node: Descendant): Descendant {
  if ("text" in node) {
    return node; // Already a text node
  }
  
  const element = node as any;
  
  if (!element.children || element.children.length === 0) {
    return {
      ...element,
      children: [{ text: "" }],
    };
  }
  
  // Recursively ensure children have text
  return {
    ...element,
    children: element.children.map(ensureTextChildren),
  };
}

/**
 * Convert a single DocumentElement to Slate element(s)
 * May return multiple elements if paragraph contains line breaks
 */
export function elementToSlate(element: DocumentElement): CustomElement | CustomElement[] | null {
  switch (element.type) {
    case "paragraph":
      return paragraphToSlate(element as DocParagraph);
    case "table":
      return tableToSlate(element as DocTable);
    case "table-row":
      return tableRowToSlate(element as DocTableRow);
    case "table-cell":
      return tableCellToSlate(element as DocTableCell);
    case "image":
      return imageToSlate(element);
    case "section-break":
      return null;
    case "page-break":
      return {
        type: "divider",
        children: [{ text: "" }],
      } as DividerElement;
    default: {
      // Skip floating/special elements (textbox, shape, etc.)
      const skipTypes = ["textbox", "shape", "drawing"];
      if (skipTypes.includes(element.type as string)) {
        return null;
      }
      // Log unknown element types for debugging
      console.warn("Unknown element type:", element.type);
      return null;
    }
  }
}

/**
 * Detect heading level from paragraph style
 */
function detectHeadingLevel(props: any): number {
  if (!props?.pStyle?.val) return 0;
  const styleName = (props.pStyle.val as string).toLowerCase();
  // English: Heading1, Heading 1, heading1
  // Russian: Заголовок1, Заголовок 1 (styleId is usually like "1" or "Heading1")
  const match = styleName.match(/^(?:heading|заголовок)\s*(\d)$/i);
  if (match) return parseInt(match[1], 10);
  // Also check numeric-only style IDs (Word sometimes uses "1", "2", etc. for headings)
  if (/^\d$/.test(styleName)) {
    const level = parseInt(styleName, 10);
    if (level >= 1 && level <= 6) return level;
  }
  return 0;
}

/**
 * Check if a numbering format is bullet-like
 */
function isBulletFormat(numFmt: string): boolean {
  return ['bullet', 'none'].includes(numFmt);
}

/**
 * Convert paragraph element to Slate element(s)
 * Handles headings, list items, and regular paragraphs
 */
function paragraphToSlate(paragraph: DocParagraph): CustomElement | CustomElement[] {
  const textChildren = extractTextFromChildren(paragraph.children || []);

  // Check for inline images in paragraph children
  const inlineImages: ImageElement[] = [];
  for (const child of paragraph.children || []) {
    if (child.type === "image") {
      const img = child as any;
      inlineImages.push({
        type: "image",
        src: img.src || "",
        width: img.width || 300,
        height: img.height || 200,
        alt: img.alt || "Image",
        children: [{ text: "" }],
      });
    }
  }

  // If paragraph contains only images (no meaningful text), return images directly
  const hasText = textChildren.some(c => c.text.trim().length > 0);
  if (inlineImages.length > 0 && !hasText) {
    return inlineImages.length === 1 ? inlineImages[0] : inlineImages;
  }

  const align = mapAlignment(paragraph.props?.alignment || paragraph.props?.jc?.val);

  // Check if this is a list item
  const numPr = paragraph.props?.numPr;
  if (numPr && numPr.numId > 0) {
    if (textChildren.length === 0) textChildren.push({ text: "" });
    const listType = isBulletFormat(numPr.numFmt || "decimal") ? "bullet" : "numbered";
    const listItem: ListItemElement = {
      type: "list-item",
      listType,
      level: numPr.ilvl || 0,
      numId: numPr.numId,
      numFmt: numPr.numFmt,
      children: textChildren,
    };
    // Append images after list item if present
    if (inlineImages.length > 0) return [listItem, ...inlineImages];
    return listItem;
  }

  // Check if this is a heading
  const headingLevel = detectHeadingLevel(paragraph.props);
  if (headingLevel >= 1 && headingLevel <= 3) {
    if (textChildren.length === 0) textChildren.push({ text: "" });
    const headingTypes: Record<number, "heading-one" | "heading-two" | "heading-three"> = {
      1: "heading-one",
      2: "heading-two",
      3: "heading-three",
    };
    const heading = {
      type: headingTypes[headingLevel],
      align: align as any,
      children: textChildren,
    } as HeadingOneElement | HeadingTwoElement | HeadingThreeElement;
    if (inlineImages.length > 0) return [heading, ...inlineImages];
    return heading;
  }

  // Convert twips to pixels (1 inch = 1440 twips, 1 inch = 96 pixels)
  const twipsToPixels = (twips: string | number | undefined): number | undefined => {
    if (twips === undefined || twips === null) return undefined;
    const value = typeof twips === 'string' ? parseInt(twips, 10) : twips;
    if (isNaN(value)) return undefined;
    return Math.round(value * 96 / 1440);
  };

  const spacing = paragraph.props?.spacing;
  const indLeft = twipsToPixels(paragraph.props?.ind?.left) || 0;
  const indRight = twipsToPixels(paragraph.props?.ind?.right) || 0;
  const indFirstLine = twipsToPixels(paragraph.props?.ind?.firstLine);
  const indHanging = twipsToPixels(paragraph.props?.ind?.hanging);

  let effectiveFirstLine: number | undefined;
  if (indHanging) {
    effectiveFirstLine = -indHanging;
  } else if (indFirstLine) {
    effectiveFirstLine = indFirstLine;
  }

  const makePara = (children: CustomText[]): ParagraphElement => ({
    type: "paragraph",
    align: align as any,
    spacing,
    indent: indLeft,
    indentLeft: indLeft,
    indentRight: indRight,
    indentFirstLine: effectiveFirstLine,
    children: children.length > 0 ? children : [{ text: "" }],
  });

  // Check if we have line breaks - if so, split into multiple paragraphs
  const hasLineBreaks = textChildren.some(child => child.text.includes("\n"));

  if (!hasLineBreaks) {
    const para = makePara(textChildren);
    if (inlineImages.length > 0) return [para, ...inlineImages];
    return para;
  }

  // Split children by line breaks into multiple paragraphs
  const paragraphs: ParagraphElement[] = [];
  let currentChildren: CustomText[] = [];

  for (const child of textChildren) {
    if (!child.text.includes("\n")) {
      currentChildren.push(child);
      continue;
    }

    const parts = child.text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part || i === 0) {
        currentChildren.push({ ...child, text: part });
      }
      if (i < parts.length - 1) {
        if (currentChildren.length > 0 || part === "") {
          paragraphs.push(makePara(currentChildren));
        }
        currentChildren = [];
      }
    }
  }

  if (currentChildren.length > 0) {
    paragraphs.push(makePara(currentChildren));
  }

  if (paragraphs.length === 0) {
    paragraphs.push(makePara([]));
  }

  if (inlineImages.length > 0) return [...paragraphs, ...inlineImages];
  return paragraphs;
}

/**
 * Map DOCX alignment to CSS/Slate alignment
 */
function mapAlignment(align: string | undefined): string {
  if (!align) return "left";
  if (align === "both") return "justify";
  if (align === "start") return "left";
  if (align === "end") return "right";
  return align;
}

/**
 * Convert image element to Slate image
 */
function imageToSlate(image: any): ImageElement {
  return {
    type: "image",
    src: image.src || "",
    width: image.width || 300,
    height: image.height || 200,
    alt: image.alt || "Image",
    children: [{ text: "" }], // Void elements need empty text child
  };
}

/**
 * Calculate rowSpan values for cells with vMerge='restart'
 * Returns a map: rowIndex-colIndex -> rowSpan value
 */
function calculateTableRowSpans(table: DocTable): Map<string, number> {
  const rowSpanMap = new Map<string, number>();
  const rows = (table.children || []).filter((child) => child.type === "table-row") as DocTableRow[];

  if (rows.length === 0) return rowSpanMap;

  // First pass: find all merge starts and track them
  const mergeStarts = new Map<number, { startRow: number; startCol: number }>();

  rows.forEach((row, rowIndex) => {
    let colIndex = 0;
    const cells = (row.children || []).filter((c) => c.type === "table-cell") as DocTableCell[];

    for (const cell of cells) {
      const props = cell.props || {};
      const colSpan = props.colSpan || 1;

      if (props.vMerge === 'restart') {
        // Start of vertical merge - record it
        mergeStarts.set(colIndex, { startRow: rowIndex, startCol: colIndex });
      } else if (props.vMerge === 'continue') {
        // Continue - do nothing, just track
      } else {
        // No merge - if there was an active merge for this column, it ended in previous row
        const mergeStart = mergeStarts.get(colIndex);
        if (mergeStart) {
          const rowSpanValue = rowIndex - mergeStart.startRow;
          if (rowSpanValue > 1) {
            rowSpanMap.set(`${mergeStart.startRow}-${mergeStart.startCol}`, rowSpanValue);
          }
          mergeStarts.delete(colIndex);
        }
      }

      colIndex += colSpan;
    }
  });

  // Finish all remaining merges that go to the end of the table
  mergeStarts.forEach((mergeStart) => {
    const rowSpanValue = rows.length - mergeStart.startRow;
    if (rowSpanValue > 1) {
      rowSpanMap.set(`${mergeStart.startRow}-${mergeStart.startCol}`, rowSpanValue);
    }
  });

  return rowSpanMap;
}

/**
 * Convert table element to Slate table
 */
function tableToSlate(table: DocTable): TableElement {
  // Pre-calculate rowSpan values
  const rowSpanMap = calculateTableRowSpans(table);

  const rows = (table.children || [])
    .filter((child) => child.type === "table-row")
    .map((row, rowIndex) => tableRowToSlate(row as DocTableRow, table.grid, rowIndex, rowSpanMap));

  // Ensure at least one row
  if (rows.length === 0) {
    rows.push({
      type: "table-row",
      children: [
        {
          type: "table-cell",
          children: [{ type: "paragraph", children: [{ text: "" }] }],
        },
      ],
    });
  }

  // Calculate total table width
  const colWidths = table.grid?.map((col) => col.width) || [];
  const tableWidth = colWidths.reduce((sum, w) => sum + (w || 0), 0);

  return {
    type: "table",
    colWidths,
    tableWidth: tableWidth > 0 ? tableWidth : undefined,
    children: rows,
  };
}

/**
 * Convert table row element to Slate table row
 */
function tableRowToSlate(
  row: DocTableRow,
  grid?: { width: number }[],
  rowIndex?: number,
  rowSpanMap?: Map<string, number>
): TableRowElement {
  let colIndex = 0;
  const cells = (row.children || [])
    .filter((child) => child.type === "table-cell")
    .map((cell) => {
      const slateCell = tableCellToSlate(cell as DocTableCell, grid, colIndex, rowIndex, rowSpanMap);
      colIndex += slateCell.colSpan || 1;
      return slateCell;
    });

  // Ensure at least one cell
  if (cells.length === 0) {
    cells.push({
      type: "table-cell",
      children: [{ type: "paragraph", children: [{ text: "" }] }],
    });
  }

  return {
    type: "table-row",
    children: cells,
  };
}

/**
 * Convert table cell element to Slate table cell
 */
function tableCellToSlate(
  cell: DocTableCell,
  grid?: { width: number }[],
  colIndex?: number,
  rowIndex?: number,
  rowSpanMap?: Map<string, number>
): TableCellElement {
  // elementToSlate may return single element or array
  const content: (ParagraphElement | TableElement)[] = [];
  for (const child of cell.children || []) {
    const converted = elementToSlate(child);
    if (converted) {
      if (Array.isArray(converted)) {
        content.push(...(converted as (ParagraphElement | TableElement)[]));
      } else {
        content.push(converted as ParagraphElement | TableElement);
      }
    }
  }

  // Ensure at least one paragraph with text
  if (content.length === 0) {
    content.push({ type: "paragraph", children: [{ text: "" }] });
  }

  // Ensure each child has text
  const validContent = content.map((child) => {
    if (child.type === "paragraph" && (!child.children || child.children.length === 0)) {
      return { ...child, children: [{ text: "" }] };
    }
    return child;
  });

  const props = cell.props || {};
  const colSpan = props.colSpan || 1;

  // Calculate cell width from grid if not explicitly set
  let cellWidth = props.width;
  if (!cellWidth && grid && typeof colIndex === 'number') {
    cellWidth = 0;
    for (let i = 0; i < colSpan && colIndex + i < grid.length; i++) {
      cellWidth += grid[colIndex + i]?.width || 0;
    }
  }

  const slateCell: TableCellElement = {
    type: "table-cell",
    children: validContent,
  };

  // Add optional properties only if present
  if (colSpan > 1) slateCell.colSpan = colSpan;

  // Get rowSpan from pre-calculated map for cells with vMerge='restart'
  if (props.vMerge === 'restart' && rowSpanMap && typeof rowIndex === 'number' && typeof colIndex === 'number') {
    const cellKey = `${rowIndex}-${colIndex}`;
    const rowSpan = rowSpanMap.get(cellKey);
    if (rowSpan && rowSpan > 1) {
      slateCell.rowSpan = rowSpan;
    }
  }

  if (cellWidth) slateCell.width = cellWidth;
  if (props.widthPercent) slateCell.widthPercent = props.widthPercent;
  if (props.vAlign && ['top', 'center', 'bottom'].includes(props.vAlign)) {
    slateCell.vAlign = props.vAlign as 'top' | 'center' | 'bottom';
  }
  if (props.backgroundColor) slateCell.backgroundColor = props.backgroundColor;
  if (props.borders) slateCell.borders = props.borders;
  if (props.padding) slateCell.padding = props.padding;

  return slateCell;
}

/**
 * Extract text nodes from children (runs, text elements)
 */
function extractTextFromChildren(children: DocumentElement[]): CustomText[] {
  const texts: CustomText[] = [];

  for (const child of children) {
    if (child.type === "run") {
      const run = child as RunElement;
      const runTexts = extractTextFromRun(run);
      texts.push(...runTexts);
    } else if (child.type === "text") {
      const textEl = child as TextElement;
      texts.push({ text: textEl.text });
    } else if (child.type === "hyperlink") {
      // Extract text from hyperlink children
      const hyperlinkTexts = extractTextFromChildren(child.children || []);
      texts.push(...hyperlinkTexts);
    }
  }

  return texts;
}

/**
 * Extract text nodes from a run element with formatting
 */
function extractTextFromRun(run: RunElement): CustomText[] {
  const texts: CustomText[] = [];
  const font = run.font;

  for (const child of run.children || []) {
    if (child.type === "text") {
      const textEl = child as TextElement;
      const customText: CustomText = {
        text: textEl.text,
      };

      // Apply formatting from run's font
      if (font) {
        if (font.weight === "bold") {
          customText.bold = true;
        }
        if (font.style === "italic") {
          customText.italic = true;
        }
        if (font.family) {
          customText.fontFamily = font.family;
        }
        if (font.size) {
          customText.fontSize = font.size;
        }
      }

      texts.push(customText);
    } else if (child.type === "break") {
      // Line break - add newline character
      texts.push({ text: "\n" });
    }
  }

  return texts;
}

/**
 * Get plain text from document
 */
export function documentToPlainText(doc: Document): string {
  return doc.elements
    .map((element) => elementToPlainText(element))
    .filter(Boolean)
    .join("\n\n");
}

function elementToPlainText(element: DocumentElement): string {
  switch (element.type) {
    case "paragraph": {
      const para = element as DocParagraph;
      return extractPlainTextFromChildren(para.children || []);
    }
    case "table": {
      const table = element as DocTable;
      return (table.children || [])
        .map((row) => elementToPlainText(row))
        .join("\n");
    }
    case "table-row": {
      const row = element as DocTableRow;
      return (row.children || [])
        .map((cell) => elementToPlainText(cell))
        .join("\t");
    }
    case "table-cell": {
      const cell = element as DocTableCell;
      return (cell.children || [])
        .map((child) => elementToPlainText(child))
        .join(" ");
    }
    default:
      return "";
  }
}

function extractPlainTextFromChildren(children: DocumentElement[]): string {
  let text = "";

  for (const child of children) {
    if (child.type === "run") {
      const run = child as RunElement;
      for (const runChild of run.children || []) {
        if (runChild.type === "text") {
          text += (runChild as TextElement).text;
        } else if (runChild.type === "break") {
          text += "\n";
        }
      }
    } else if (child.type === "text") {
      text += (child as TextElement).text;
    } else if (child.type === "hyperlink") {
      text += extractPlainTextFromChildren(child.children || []);
    }
  }

  return text;
}
