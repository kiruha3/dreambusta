// Core types for DOCX layout engine

export interface PageConfig {
  width: number;      // in pixels
  height: number;     // in pixels
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export interface FontProperties {
  family: string;
  size: number;       // in pixels
  weight: 'normal' | 'bold';
  style: 'normal' | 'italic';
  lineHeight: number; // multiplier (e.g., 1.5)
}

// Document element types
export type DocumentElementType = 
  | 'paragraph' 
  | 'table' 
  | 'table-row'  // Table row element (w:tr)
  | 'table-cell' // Table cell element (w:tc)
  | 'image' 
  | 'section-break' 
  | 'page-break'
  | 'text-box'
  | 'run' // Run element (w:r) - can be child of any element
  | 'text' // Text element (w:t) - contains text content
  | 'break' // Break element (w:br) - line break, page break, etc.
  | 'hyperlink'; // Hyperlink element (w:hyperlink) - child of paragraph or other elements

// Base document element - supports recursive child elements
export interface DocumentElement {
  id: string;
  type: DocumentElementType;
  children?: DocumentElement[]; // Recursive child elements (e.g., runs, nested structures)
}

// Text run - can be a child element or standalone
export interface TextRun {
  id: string;
  text: string;
  font: FontProperties;
  // Runs can also have children (e.g., nested formatting, inline elements)
  children?: DocumentElement[];
}

// Run element (w:r) - child of paragraph or other elements
export interface RunElement extends DocumentElement {
  type: 'run';
  font: FontProperties;
  // Text is in children as TextElement
}

// Hyperlink element (w:hyperlink) - child of paragraph or other elements
export interface HyperlinkElement extends DocumentElement {
  type: 'hyperlink';
}

// Text element (w:t) - contains text content
export interface TextElement extends DocumentElement {
  type: 'text';
  text: string;
  preserveSpace?: boolean; // xml:space="preserve"
}

// Paragraph element
export interface ParagraphElement extends DocumentElement {
  type: 'paragraph';
  props: {
    numPr?: { numId: number; ilvl: number; numFmt?: string };
    spacing?: {
      before: number;   // in pixels
      after: number;    // in pixels
    };
    alignment?: 'left' | 'center' | 'right' | 'justify';
    // All other paragraph properties from XML
    [key: string]: any;
  };
  // Runs and other children are in children property
}

// Table element
export interface TableElement extends DocumentElement {
  type: 'table';
  props: {
    // All table properties from XML (w:tblPr and its children)
    [key: string]: any;
  };
  grid: TableGridColumn[]; // Column widths from w:tblGrid
  // Rows are in children property as TableRowElement
}

export interface TableGridColumn {
  width: number; // in pixels
}

// Table row element (stored in TableElement.children)
export interface TableRowElement extends DocumentElement {
  type: 'table-row';
  // Cells are in children property as TableCellElement
}

// Table cell element (stored in TableRowElement.children)
export interface TableCellElement extends DocumentElement {
  type: 'table-cell';
  // Cell properties (width, borders, background, etc.)
  props?: {
    width?: number;
    widthPercent?: number;
    vAlign?: string;
    backgroundColor?: string;
    borders?: Record<string, { style: string; width: number; color: string }>;
    padding?: Record<string, number>;
    colSpan?: number;
    vMerge?: 'restart' | 'continue';
  };
  // Content (paragraphs, nested tables, etc.) is in children property
}

// Image element
export interface ImageElement extends DocumentElement {
  type: 'image';
  src: string;
  width: number;
  height: number;
  wrapStyle?: 'inline' | 'square' | 'tight' | 'behind' | 'in-front';
}

// Section break element
export interface SectionBreakElement extends DocumentElement {
  type: 'section-break';
  pageConfig?: Partial<PageConfig>;
}

// Page break element
export interface PageBreakElement extends DocumentElement {
  type: 'page-break';
}

// Break element (w:br) - can be line break, page break, etc.
export interface BreakElement extends DocumentElement {
  type: 'break';
  props: {
    // All break properties from XML (w:type, etc.)
    [key: string]: any;
  };
}

// Header/Footer definition
export interface HeaderFooter {
  type: 'default' | 'first' | 'even';
  elements: DocumentElement[];
}

// Style definition for roundtrip preservation
export interface StyleDefinition {
  id: string;
  name?: string;
  type: 'paragraph' | 'character' | 'table' | 'numbering';
  // basedOn — id родительского стиля; учитывается при resolve-цепочке (docDefaults → basedOn* → style → run rPr)
  basedOn?: string;
  // Полностью разрешённый font стиля (после inheritance). Никогда не остаётся null,
  // если стиль участвовал в resolve — иначе берётся docDefaults парсера.
  font?: FontProperties;
  spacing?: { before?: number; after?: number; line?: number };
  alignment?: 'left' | 'center' | 'right' | 'justify';
  // Partial numbering overlay: numId/ilvl can be inherited independently.
  numPr?: { numId?: number; ilvl?: number };
}

// Numbering definition for roundtrip preservation
export interface NumberingDefinition {
  abstractNumId: number;
  levels: Record<number, string>; // ilvl -> numFmt
}

// Document structure — canonical model for parse/edit/export roundtrip
export interface Document {
  elements: DocumentElement[];
  pageConfig: PageConfig;
  headers?: HeaderFooter[];
  footers?: HeaderFooter[];
  styles?: Record<string, StyleDefinition>;
  numbering?: Record<number, NumberingDefinition>;
  // Эффективные docDefaults (<w:docDefaults><w:rPrDefault><w:rPr>) — используются
  // как fallback для тулбара в пустом документе, чтобы не показывать захардкоженный
  // TNR/14 при реальном docDefaults вроде Calibri/11.
  docDefaults?: FontProperties;
}

// Legacy type alias for backward compatibility
export interface Paragraph {
  id: string;
  text: string;
  font: FontProperties;
  spacing?: { before: number; after: number };
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

// Layout types
export interface TextLinePartWord {
  x: number;
  width: number;
  text: string;
  font: FontProperties;
  el: TextElement;
}

export interface TextLinePart {
  x: number;
  width: number;
  text: string;
  font: FontProperties;
  el?: TextElement; // Reference to original run from which this part was created
  words: TextLinePartWord[];
}

// Base region type - represents a region where an element was laid out
export interface LaidOutRegion {
  element: DocumentElement;  // Reference to source element
  x: number;                 // X position of the region
  y: number;                 // Y position of the region
  width: number;             // Width of the region
  height: number;            // Height of the region
  // Optional element-specific data (for backward compatibility and element-specific info)
  elementData?: LaidOutElementType;
  // Child regions (for nested elements like table cells, etc.)
  children?: LaidOutRegion[];
}

// Text line - extends LaidOutRegion with text-specific data
export interface TextLine extends LaidOutRegion {
  text: string;              // Full text of the line (for convenience)
  parts: TextLinePart[];     // Parts of the line, each linked to its source run
}

// Laid out element (base) - for backward compatibility and element-specific data
export interface LaidOutElement {
  element: DocumentElement;
  height: number;
  pageNumber: number;
  yPosition: number;
}

// Laid out paragraph
export interface LaidOutParagraph extends LaidOutElement {
  element: ParagraphElement;
  lines: TextLine[];  // Each line is a LaidOutRegion
}

// Laid out table (placeholder)
export interface LaidOutTable extends LaidOutElement {
  element: TableElement;
  // Table-specific layout info
}

// Laid out image (placeholder)
export interface LaidOutImage extends LaidOutElement {
  element: ImageElement;
  x: number;
  // Image-specific layout info
}

// Union type for all laid out elements
export type LaidOutElementType = 
  | LaidOutParagraph 
  | LaidOutTable 
  | LaidOutImage;

export interface Page {
  pageNumber: number;
  floatContent: LaidOutRegion[]; // Changed to LaidOutRegion for unified rendering
  flowContent: LaidOutRegion[]; // Content
  floatingRegions?: FloatingRegion[]; // Floating elements on this page
}

export interface LaidOutDocument {
  pages: Page[];
  pageConfig: PageConfig;
}

export interface LayoutMetrics {
  width: number;
  height: number;
  lines?: TextLine[];
}

// Floating element region - represents area occupied by floating element
// Text flows around floating elements horizontally
export interface FloatingRegion {
  x: number;                    // Left position of floating element (in local space)
  y: number;                    // Top position of floating element (in local space)
  width: number;                // Width of floating element
  height: number;               // Height of floating element
  element: DocumentElement;     // Reference to floating element
  anchorElement: DocumentElement; // Reference to closest non-floating element for page identification
  anchorElementY: number;       // Y position of anchor element (for page calculation)
}

// Base floating region returned by handlers (without anchor info)
export interface BaseFloatingRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Flow range - available space for text between floating elements
export interface FlowRange {
  x: number;      // Start X position of the range
  width: number;  // Width of the range
}

// Function to get available flow ranges for Y range
// Returns ranges (spaces) where text can flow (for example between floating elements)
// Text flows into these ranges: flow space -> float element -> flow space -> float element -> flow space
export type LineFlowRangesProvider = (y: number, height: number) => FlowRange[];
