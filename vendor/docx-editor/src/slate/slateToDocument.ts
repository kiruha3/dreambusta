import { Descendant, Text } from "slate";
import type {
  Document,
  DocumentElement,
  ParagraphElement as DocParagraph,
  TableElement as DocTable,
  TableRowElement as DocTableRow,
  TableCellElement as DocTableCell,
  RunElement,
  TextElement,
  FontProperties,
  PageConfig,
} from "../layout/types";
import type {
  CustomElement,
  CustomText,
  ParagraphElement,
  TableElement,
  TableRowElement,
  TableCellElement,
  ListItemElement,
} from "./types";
import { UnitConverter } from "../layout/unitConverter";

let elementIdCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}-${elementIdCounter++}`;
}

/**
 * Convert Slate Descendant array to Document model
 */
export function slateToDocument(
  descendants: Descendant[],
  pageConfig?: PageConfig
): Document {
  elementIdCounter = 0;

  // Keep imported numbering identities, and allocate non-conflicting identities
  // for lists created with toolbar commands (which have no Word numId yet).
  let maxNumId = 0;
  const collectNumIds = (nodes: Descendant[]) => {
    for (const node of nodes) {
      if (Text.isText(node)) continue;
      if (node.type === "list-item" && node.numId) maxNumId = Math.max(maxNumId, node.numId);
      collectNumIds(node.children);
    }
  };
  collectNumIds(descendants);
  const numbering: NumberingContext = { nextNumId: maxNumId + 1, generatedIds: new Map() };
  const elements = slateElementsToDocument(descendants, numbering);

  return {
    elements,
    pageConfig: pageConfig || getDefaultPageConfig(),
  };
}

interface NumberingContext {
  nextNumId: number;
  generatedIds: Map<string, number>;
}

function slateElementsToDocument(nodes: Descendant[], numbering: NumberingContext): DocumentElement[] {
  return nodes.flatMap(node => {
    if (!Text.isText(node) && (node.type === "numbered-list" || node.type === "bulleted-list")) {
      return slateElementsToDocument(node.children, numbering);
    }
    const element = slateElementToDocument(node, numbering);
    return element ? [element] : [];
  });
}

/**
 * Convert a single Slate element to DocumentElement
 */
function slateElementToDocument(node: Descendant, numbering: NumberingContext): DocumentElement | null {
  if (Text.isText(node)) {
    return null; // Text nodes are handled by parent
  }

  const element = node as CustomElement;

  switch (element.type) {
    case "paragraph":
      return paragraphToDocument(element);
    case "heading-one":
    case "heading-two":
    case "heading-three": {
      const paragraph = paragraphToDocument({ ...element, type: "paragraph" });
      const level = { "heading-one": 1, "heading-two": 2, "heading-three": 3 }[element.type];
      paragraph.props.pStyle = { val: `Heading${level}` };
      return paragraph;
    }
    case "table":
      return tableToDocument(element, numbering);
    case "table-row":
      return tableRowToDocument(element, numbering);
    case "table-cell":
      return tableCellToDocument(element, numbering);
    case "image":
      return imageToDocument(element);
    case "list-item":
      return listItemToDocument(element, numbering);
    default:
      return null;
  }
}

/**
 * Convert Slate paragraph to Document paragraph
 */
function paragraphToDocument(paragraph: ParagraphElement): DocParagraph {
  const children: DocumentElement[] = [];

  // Group consecutive text nodes with same formatting into runs
  let currentRun: { font: FontProperties; texts: TextElement[] } | null = null;

  for (const child of paragraph.children) {
    if (Text.isText(child)) {
      const textNode = child as CustomText;
      const font = textToFont(textNode);

      if (currentRun && fontsEqual(currentRun.font, font)) {
        // Same formatting - add to current run
        currentRun.texts.push({
          id: generateId("t"),
          type: "text",
          text: textNode.text,
        });
      } else {
        // Different formatting - finalize current run and start new one
        if (currentRun) {
          children.push(createRunElement(currentRun.font, currentRun.texts));
        }
        currentRun = {
          font,
          texts: [
            {
              id: generateId("t"),
              type: "text",
              text: textNode.text,
            },
          ],
        };
      }
    }
  }

  // Finalize last run
  if (currentRun) {
    children.push(createRunElement(currentRun.font, currentRun.texts));
  }

  return {
    id: generateId("p"),
    type: "paragraph",
    props: {
      alignment: paragraph.align,
      spacing: paragraph.spacing ? {
        before: paragraph.spacing.before || 0,
        after: paragraph.spacing.after || 0,
      } : undefined,
      ind: {
        left: paragraph.indentLeft || paragraph.indent,
        right: paragraph.indentRight,
        firstLine: paragraph.indentFirstLine,
      },
    },
    children,
  };
}

/**
 * Convert Slate table to Document table
 */
function tableToDocument(table: TableElement, numbering: NumberingContext): DocTable {
  const rows = table.children
    .filter((child): child is TableRowElement => child.type === "table-row")
    .map(row => tableRowToDocument(row, numbering));

  return {
    id: generateId("tbl"),
    type: "table",
    props: {},
    grid: (table.colWidths || []).map((width) => ({ width })),
    children: rows,
  };
}

/**
 * Convert Slate table row to Document table row
 */
function tableRowToDocument(row: TableRowElement, numbering: NumberingContext): DocTableRow {
  const cells = row.children
    .filter((child): child is TableCellElement => child.type === "table-cell")
    .map(cell => tableCellToDocument(cell, numbering));

  return {
    id: generateId("tr"),
    type: "table-row",
    children: cells,
  };
}

/**
 * Convert Slate table cell to Document table cell
 */
function tableCellToDocument(cell: TableCellElement, numbering: NumberingContext): DocTableCell {
  const content = slateElementsToDocument(cell.children, numbering);

  return {
    id: generateId("tc"),
    type: "table-cell",
    children: content,
  };
}

/**
 * Convert Slate image to Document image
 */
function imageToDocument(image: any): DocumentElement {
  return {
    id: generateId("img"),
    type: "image",
    src: image.src,
    width: image.width,
    height: image.height,
  } as any;
}

/**
 * Convert Slate list item to Document paragraph with numbering
 */
function listItemToDocument(listItem: ListItemElement, numbering: NumberingContext): DocParagraph {
  const children: DocumentElement[] = [];

  for (const child of listItem.children) {
    if (Text.isText(child)) {
      const textNode = child as CustomText;
      const runEl: RunElement = {
        id: generateId("r"),
        type: "run",
        font: textToFont(textNode),
        children: [
          {
            id: generateId("t"),
            type: "text",
            text: textNode.text,
          } as TextElement,
        ],
      };
      children.push(runEl);
    }
  }

  const isBullet = listItem.listType === "bullet";
  const originalFormatMatches = listItem.numFmt && isBullet === ["bullet", "none"].includes(listItem.numFmt);
  const numFmt = originalFormatMatches ? listItem.numFmt! : isBullet ? "bullet" : "decimal";
  let numId = originalFormatMatches ? listItem.numId : undefined;
  if (!numId || numId <= 0) {
    const key = `${listItem.listType}:${numFmt}`;
    numId = numbering.generatedIds.get(key);
    if (!numId) {
      numId = numbering.nextNumId++;
      numbering.generatedIds.set(key, numId);
    }
  }

  return {
    id: generateId("p"),
    type: "paragraph",
    props: {
      numPr: {
        numId,
        ilvl: listItem.level || 0,
        numFmt,
      },
    },
    children,
  };
}

/**
 * Create run element from font and text elements
 */
function createRunElement(font: FontProperties, texts: TextElement[]): RunElement {
  return {
    id: generateId("r"),
    type: "run",
    font,
    children: texts,
  };
}

/**
 * Convert CustomText formatting to FontProperties
 */
function textToFont(text: CustomText): FontProperties {
  return {
    family: text.fontFamily || "Times New Roman",
    size: text.fontSize || UnitConverter.pointsToPixels(11),
    weight: text.bold ? "bold" : "normal",
    style: text.italic ? "italic" : "normal",
    lineHeight: 1.15,
  };
}

/**
 * Check if two fonts are equal
 */
function fontsEqual(font1: FontProperties, font2: FontProperties): boolean {
  return (
    font1.family === font2.family &&
    font1.size === font2.size &&
    font1.weight === font2.weight &&
    font1.style === font2.style
  );
}

/**
 * Get default page config
 */
function getDefaultPageConfig(): PageConfig {
  const size = UnitConverter.getDefaultPageSize();
  const margins = UnitConverter.getDefaultMargins();

  return {
    width: size.width,
    height: size.height,
    margins,
  };
}
