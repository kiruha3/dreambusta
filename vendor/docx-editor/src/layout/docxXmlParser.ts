// Direct DOCX XML parser - preserves all features
// DOCX files are ZIP archives containing XML files

import JSZip from 'jszip';
import type { FontProperties, PageConfig, DocumentElement, ParagraphElement, RunElement, TableElement, TableGridColumn, TableRowElement, TableCellElement, TextElement, BreakElement, Document as DocDocument, HyperlinkElement, ImageElement, HeaderFooter, StyleDefinition, NumberingDefinition } from './types';
import { UnitConverter } from './unitConverter';

// DOCX XML namespaces
const NAMESPACES = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
};

interface DocxDocumentInternal {
  elements: DocumentElement[];
  pageConfig: PageConfig;
  styles: Map<string, StyleDefinition>;
  images: Map<string, string>; // relationshipId -> base64 data URL
  headers: HeaderFooter[];
  footers: HeaderFooter[];
  numbering: Map<number, { abstractNumId: number; levels: Map<number, string> }>;
  // docDefaults после parseDocDefaults() — основа для всего inheritance.
  docDefaults: FontProperties;
}

export class DocxXmlParser {
  private zip: JSZip | null = null;
  private styles: Map<string, StyleDefinition> = new Map();
  private relationships: Map<string, string> = new Map();
  private images: Map<string, string> = new Map(); // rId -> base64 data URL
  // Numbering: numId -> { abstractNumId, levels: { ilvl -> numFmt } }
  private numberingMap: Map<number, { abstractNumId: number; levels: Map<number, string> }> = new Map();

  // Document-wide rPr defaults (<w:docDefaults><w:rPrDefault><w:rPr>) — основа для всех run'ов.
  // Стартовое значение — стандартный TNR 11pt из спецификации DOCX, перезаписывается при parseDocDefaults().
  private docDefaults: FontProperties = {
    family: 'Times New Roman',
    size: UnitConverter.pointsToPixels(11),
    weight: 'normal',
    style: 'normal',
    lineHeight: 1.15,
  };

  // Partial-overlays стилей до resolve по basedOn-цепочке.
  private styleFontOverlays: Map<string, Partial<FontProperties>> = new Map();

  // Текущий эффективный font параграфа — используется как база для run'ов
  // внутри parseParagraphChildren (push/pop через try-finally в parseParagraphElement).
  private currentParagraphFont: FontProperties | null = null;

  /**
   * Parse DOCX file from ArrayBuffer
   */
  async parse(arrayBuffer: ArrayBuffer): Promise<DocxDocumentInternal> {
    // Load ZIP archive
    this.zip = await JSZip.loadAsync(arrayBuffer);

    // Parse relationships
    await this.parseRelationships();

    // Parse styles
    await this.parseStyles();

    // Parse numbering definitions
    await this.parseNumbering();

    // Parse images
    await this.parseImages();

    // Parse page settings and header/footer references
    const { pageConfig, headerRefs, footerRefs } = await this.parsePageSettingsAndRefs();

    // Parse document content
    const elements = await this.parseDocument();

    // Parse headers and footers
    const headers = await this.parseHeaderFooters(headerRefs, 'header');
    const footers = await this.parseHeaderFooters(footerRefs, 'footer');

    return {
      elements,
      pageConfig,
      styles: this.styles,
      images: this.images,
      headers,
      footers,
      numbering: this.numberingMap,
      docDefaults: { ...this.docDefaults },
    };
  }

  /**
   * Get image by relationship ID
   */
  getImage(rId: string): string | undefined {
    return this.images.get(rId);
  }

  /**
   * Get all images
   */
  getAllImages(): Map<string, string> {
    return this.images;
  }


  /**
   * Parse document.xml - main content
   */
  private async parseDocument(): Promise<DocumentElement[]> {
    if (!this.zip) throw new Error('ZIP not loaded');

    const documentXml = await this.zip.file('word/document.xml')?.async('string');
    if (!documentXml) {
      throw new Error('document.xml not found');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(documentXml, 'text/xml');

    // Get body element - handle namespaces
    const body = this.findElement(doc, 'body', NAMESPACES.w) || doc.querySelector('body');
    if (!body) {
      throw new Error('Document body not found');
    }

    const elements: DocumentElement[] = [];
    let elementId = 0;

    // Parse all child elements of body (paragraphs, tables, etc.)
    const bodyChildren = Array.from(body.childNodes).filter(
      node => node.nodeType === Node.ELEMENT_NODE
    ) as Element[];

    for (const child of bodyChildren) {
      const localName = child.localName || child.tagName;
      if (localName === 'sectPr') {
        continue; // Section properties - handled separately
      }
      
      const result = this.parseElement(child, elementId++);
      if (result) {
        elements.push(result);
      }
    }

    return elements;
  }

  /**
   * Universal element parser - recursively parses any DOCX element
   * Parses props and special properties, then recursively parses children
   */
  private parseElement(element: Element, id: number): DocumentElement | null {
    const localName = element.localName || element.tagName;
    
    // Handle different element types
    switch (localName) {
      case 'p': {
        return this.parseParagraphElement(element, id);
      }
      case 'tbl': {
        return this.parseTableElement(element, id);
      }
      case 'tr': {
        return this.parseTableRowElement(element, id);
      }
      case 'tc': {
        return this.parseTableCellElement(element, id);
      }
      case 'r': {
        return this.parseRunElement(element, id);
      }
      case 't': {
        return this.parseTextElement(element, id);
      }
      case 'br': {
        return this.parseBreakElement(element, id);
      }
      case 'hyperlink': {
        return this.parseHyperlinkElement(element, id);
      }
      default:
        // Unknown element - skip
        return null;
    }
  }

  /**
   * Parse paragraph element (w:p) - direct parsing with recursive children
   */
  private parseParagraphElement(pElement: Element, id: number): ParagraphElement | null {
    // Get paragraph properties (w:pPr)
    const pPr = this.findElement(pElement, 'pPr', NAMESPACES.w);

    // Get style ID
    const pStyle = pPr ? this.findElement(pPr, 'pStyle', NAMESPACES.w) : null;
    const styleId = pStyle ? pStyle.getAttribute('w:val') : null;

    // Parse all paragraph properties
    const paragraphProps = this.parseParagraphProperties(pPr as Element, styleId);

    // Parse all paragraph properties into props
    const props = this.parseElementProperties(pPr);

    // Merge parsed properties (spacing, alignment) into props
    if (paragraphProps.spacing) {
      props.spacing = paragraphProps.spacing;
    }
    if (paragraphProps.alignment) {
      props.alignment = paragraphProps.alignment;
    }

    // Numbering inherits through paragraph styles, with direct pPr taking
    // precedence per property. In particular, numId=0 explicitly cancels a list.
    const chain: StyleDefinition[] = [];
    const visited = new Set<string>();
    let cursor = styleId;
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const style = this.styles.get(cursor);
      if (!style) break;
      chain.unshift(style);
      cursor = style.basedOn || null;
    }
    let numbering: StyleDefinition['numPr'] = {};
    for (const style of chain) numbering = { ...numbering, ...style.numPr };
    numbering = { ...numbering, ...this.parseNumberingProperties(pPr) };
    delete props.numPr;
    if (numbering.numId && numbering.numId > 0) {
      const ilvl = numbering.ilvl ?? 0;
      const numFmt = this.numberingMap.get(numbering.numId)?.levels.get(ilvl) || 'bullet';
      props.numPr = { numId: numbering.numId, ilvl, numFmt };
    }

    // Эффективный шрифт параграфа = paragraph style font (если есть) + локальный pPr-overlay (paragraphProps.font).
    // Используется как база для run'ов внутри parseParagraphChildren.
    // try/finally — чтобы вложенные таблицы (parseTableCellElement → parseParagraphElement)
    // корректно восстанавливали родительский контекст.
    const previousParagraphFont = this.currentParagraphFont;
    let paragraphFont: FontProperties = this.getDefaultFont();
    if (styleId) {
      const style = this.styles.get(styleId);
      if (style?.font) paragraphFont = { ...paragraphFont, ...style.font };
    }
    if (paragraphProps.font) {
      paragraphFont = { ...paragraphFont, ...paragraphProps.font };
    }
    this.currentParagraphFont = paragraphFont;

    let children: DocumentElement[];
    try {
      // Recursively parse children (runs, breaks, etc.) + inline images from drawings
      children = this.parseParagraphChildren(pElement);
    } finally {
      this.currentParagraphFont = previousParagraphFont;
    }

    // Keep empty paragraphs (they represent blank lines in the document)
    if (children.length === 0) {
      return {
        id: `p-${id}`,
        type: 'paragraph',
        props: props,
        children: [{ id: `t-empty-${id}`, type: 'text', text: '' } as TextElement]
      };
    }

    return {
      id: `p-${id}`,
      type: 'paragraph',
      props: props,
      children: children
    };
  }

  /**
   * Parse paragraph children including inline images from w:drawing elements
   */
  private parseParagraphChildren(pElement: Element): DocumentElement[] {
    const children: DocumentElement[] = [];
    let childId = 0;

    const childNodes = Array.from(pElement.childNodes).filter(
      node => node.nodeType === Node.ELEMENT_NODE
    ) as Element[];

    for (const child of childNodes) {
      const localName = child.localName || child.tagName;

      // Skip paragraph properties
      if (localName === 'pPr') continue;

      // Handle runs - check for inline drawings inside runs
      if (localName === 'r') {
        const imageElement = this.extractImageFromRun(child, childId);
        if (imageElement) {
          children.push(imageElement);
          childId++;
          continue;
        }
      }

      const parsed = this.parseElement(child, childId++);
      if (parsed) {
        children.push(parsed);
      }
    }

    return children;
  }

  /**
   * Extract an image element from a run containing w:drawing
   * Returns null if the run doesn't contain an image
   */
  private extractImageFromRun(runElement: Element, id: number): ImageElement | null {
    // Look for w:drawing inside the run
    const drawing = this.findElement(runElement, 'drawing', NAMESPACES.w);
    if (!drawing) return null;

    // Look for inline or anchor image
    const inline = drawing.getElementsByTagNameNS(NAMESPACES.wp, 'inline')[0]
      || drawing.getElementsByTagName('wp:inline')[0];
    const anchor = drawing.getElementsByTagNameNS(NAMESPACES.wp, 'anchor')[0]
      || drawing.getElementsByTagName('wp:anchor')[0];

    const imageContainer = inline || anchor;
    if (!imageContainer) return null;

    // Extract dimensions from extent (wp:extent or a:ext)
    let width = 300;
    let height = 200;

    const extent = imageContainer.getElementsByTagNameNS(NAMESPACES.wp, 'extent')[0]
      || imageContainer.getElementsByTagName('wp:extent')[0];
    if (extent) {
      const cx = extent.getAttribute('cx');
      const cy = extent.getAttribute('cy');
      if (cx) width = Math.round(UnitConverter.emuToPixels(parseInt(cx, 10)));
      if (cy) height = Math.round(UnitConverter.emuToPixels(parseInt(cy, 10)));
    }

    // Find the blip reference (a:blip r:embed)
    const blipElements = imageContainer.getElementsByTagNameNS(NAMESPACES.a, 'blip');
    const blip = blipElements[0] || imageContainer.getElementsByTagName('a:blip')[0];
    if (!blip) return null;

    const embedId = blip.getAttribute('r:embed')
      || blip.getAttributeNS(NAMESPACES.r, 'embed');
    if (!embedId) return null;

    // Look up the image data
    const src = this.images.get(embedId);
    if (!src) return null;

    return {
      id: `img-${id}`,
      type: 'image',
      src,
      width,
      height,
    };
  }

  /**
   * Parse XML element properties into generic props object
   * Recursively handles nested child elements
   */
  private parseElementProperties(prElement: Element | null): Record<string, any> {
    const props: Record<string, any> = {};
    
    if (!prElement) {
      return props;
    }

    // Parse all child elements
    const children = Array.from(prElement.childNodes).filter(
      node => node.nodeType === Node.ELEMENT_NODE
    ) as Element[];

    for (const child of children) {
      const localName = child.localName || child.tagName;
      const key = localName.replace(/^w:/, ''); // Remove namespace prefix if present
      
      // Parse attributes
      const attrs: Record<string, string> = {};
      for (let i = 0; i < child.attributes.length; i++) {
        const attr = child.attributes[i];
        const attrName = attr.name.replace(/^w:/, '');
        attrs[attrName] = attr.value;
      }
      
      // Check if element has child elements
      const childElements = Array.from(child.childNodes).filter(
        node => node.nodeType === Node.ELEMENT_NODE
      ) as Element[];
      
      if (childElements.length > 0) {
        // Recursively parse nested children
        const nestedProps = this.parseElementProperties(child);
        // Merge attributes with nested properties
        if (Object.keys(attrs).length > 0) {
          props[key] = { ...attrs, ...nestedProps };
        } else {
          props[key] = nestedProps;
        }
      } else if (Object.keys(attrs).length > 0) {
        // Element has only attributes, no children
        props[key] = attrs;
      } else {
        // Element has neither attributes nor children - store as boolean (presence)
        props[key] = true;
      }
    }

    return props;
  }

  /**
   * Recursively parse all children of an element
   */
  private parseElementChildren(parentElement: Element): DocumentElement[] {
    const children: DocumentElement[] = [];
    let childId = 0;

    const childNodes = Array.from(parentElement.childNodes).filter(
      node => node.nodeType === Node.ELEMENT_NODE
    ) as Element[];

    for (const child of childNodes) {
      const parsed = this.parseElement(child, childId++);
      if (parsed) {
        children.push(parsed);
      }
    }

    return children;
  }

  /**
   * Parse table element (w:tbl) - direct parsing with recursive children
   */
  private parseTableElement(tblElement: Element, id: number): TableElement | null {
    // Get table properties (w:tblPr)
    const tblPr = this.findElement(tblElement, 'tblPr', NAMESPACES.w);
    
    // Parse all table properties into props
    const props = this.parseElementProperties(tblPr);

    // Parse table grid (w:tblGrid) - column widths (special property)
    const tblGrid = this.findElement(tblElement, 'tblGrid', NAMESPACES.w);
    const grid: TableGridColumn[] = [];
    if (tblGrid) {
      const gridCols = this.findAllElements(tblGrid, 'gridCol', NAMESPACES.w);
      for (const gridCol of gridCols) {
        const widthAttr = gridCol.getAttribute('w:w');
        if (widthAttr) {
          grid.push({
            width: UnitConverter.twipsToPixels(parseInt(widthAttr, 10))
          });
        } else {
          grid.push({ width: 0 }); // Default width if not specified
        }
      }
    }

    // Recursively parse children (rows) - only direct children to avoid nested table rows
    const rowElements = this.findDirectChildren(tblElement, 'tr', NAMESPACES.w);
    const children: DocumentElement[] = [];
    let rowId = 0;

    for (const rowElement of rowElements) {
      const parsedRow = this.parseElement(rowElement, rowId++);
      if (parsedRow) {
        children.push(parsedRow);
      }
    }

    if (children.length === 0) {
      return null; // Skip empty tables
    }

    return {
      id: `tbl-${id}`,
      type: 'table',
      props: props,
      grid: grid,
      children: children // Rows are stored as children
    };
  }

  /**
   * Parse table row element (w:tr) - direct parsing with recursive children
   */
  private parseTableRowElement(trElement: Element, id: number): TableRowElement | null {
    // Parse row properties if needed (w:trPr)
    // For now, just parse children (cells)
    
    // Recursively parse children (cells) - only direct children to avoid nested table cells
    const cellElements = this.findDirectChildren(trElement, 'tc', NAMESPACES.w);
    const children: DocumentElement[] = [];
    let cellId = 0;

    for (const cellElement of cellElements) {
      const parsedCell = this.parseElement(cellElement, cellId++);
      if (parsedCell) {
        children.push(parsedCell);
      }
    }

    if (children.length === 0) {
      return null; // Skip empty rows
    }

    return {
      id: `tr-${id}`,
      type: 'table-row',
      children: children
    };
  }

  /**
   * Parse table cell element (w:tc) - direct parsing with recursive children
   */
  private parseTableCellElement(tcElement: Element, id: number): TableCellElement | null {
    // Parse cell properties (w:tcPr)
    const tcPr = this.findElement(tcElement, 'tcPr', NAMESPACES.w);
    const cellProps: Record<string, any> = {};
    
    if (tcPr) {
      // Cell width (w:tcW)
      const tcW = this.findElement(tcPr, 'tcW', NAMESPACES.w);
      if (tcW) {
        const widthVal = tcW.getAttribute('w:w');
        const widthType = tcW.getAttribute('w:type');
        if (widthVal) {
          if (widthType === 'pct') {
            cellProps.widthPercent = parseInt(widthVal, 10) / 50; // pct is in 50ths of a percent
          } else {
            cellProps.width = UnitConverter.twipsToPixels(parseInt(widthVal, 10));
          }
        }
      }
      
      // Vertical alignment (w:vAlign)
      const vAlign = this.findElement(tcPr, 'vAlign', NAMESPACES.w);
      if (vAlign) {
        cellProps.vAlign = vAlign.getAttribute('w:val') || 'top';
      }
      
      // Background/shading (w:shd)
      const shd = this.findElement(tcPr, 'shd', NAMESPACES.w);
      if (shd) {
        const fill = shd.getAttribute('w:fill');
        if (fill && fill !== 'auto') {
          cellProps.backgroundColor = `#${fill}`;
        }
      }
      
      // Cell borders (w:tcBorders)
      const tcBorders = this.findElement(tcPr, 'tcBorders', NAMESPACES.w);
      if (tcBorders) {
        cellProps.borders = this.parseBorders(tcBorders);
      }
      
      // Grid span (merge cells horizontally)
      const gridSpan = this.findElement(tcPr, 'gridSpan', NAMESPACES.w);
      if (gridSpan) {
        const val = gridSpan.getAttribute('w:val');
        if (val) cellProps.colSpan = parseInt(val, 10);
      }
      
      // Vertical merge
      const vMerge = this.findElement(tcPr, 'vMerge', NAMESPACES.w);
      if (vMerge) {
        const val = vMerge.getAttribute('w:val');
        cellProps.vMerge = val === 'restart' ? 'restart' : 'continue';
      }
      
      // Cell margins/padding (w:tcMar)
      const tcMar = this.findElement(tcPr, 'tcMar', NAMESPACES.w);
      if (tcMar) {
        cellProps.padding = this.parseCellMargins(tcMar);
      }
    }
    
    // Recursively parse children
    const children = this.parseElementChildren(tcElement);

    return {
      id: `tc-${id}`,
      type: 'table-cell',
      props: cellProps,
      children: children
    };
  }
  
  /**
   * Parse cell borders
   */
  private parseBorders(bordersElement: Element): Record<string, any> {
    const borders: Record<string, any> = {};
    const sides = ['top', 'bottom', 'left', 'right'];
    
    for (const side of sides) {
      const borderEl = this.findElement(bordersElement, side, NAMESPACES.w);
      if (borderEl) {
        const val = borderEl.getAttribute('w:val');
        if (val && val !== 'nil') {
          const sz = borderEl.getAttribute('w:sz');
          const color = borderEl.getAttribute('w:color');
          borders[side] = {
            style: val,
            width: sz ? Math.max(1, parseInt(sz, 10) / 8) : 1, // sz is in eighths of a point
            color: color && color !== 'auto' ? `#${color}` : '#000000'
          };
        }
      }
    }
    
    return borders;
  }
  
  /**
   * Parse cell margins/padding
   */
  private parseCellMargins(tcMar: Element): Record<string, number> {
    const padding: Record<string, number> = {};
    const sides = ['top', 'bottom', 'left', 'right', 'start', 'end'];
    
    for (const side of sides) {
      const marginEl = this.findElement(tcMar, side, NAMESPACES.w);
      if (marginEl) {
        const w = marginEl.getAttribute('w:w');
        if (w) {
          const mappedSide = side === 'start' ? 'left' : side === 'end' ? 'right' : side;
          padding[mappedSide] = UnitConverter.twipsToPixels(parseInt(w, 10));
        }
      }
    }
    
    return padding;
  }

  /**
   * Parse run element (w:r) - contains text and formatting
   */
  private parseRunElement(rElement: Element, id: number): RunElement | null {
    // Get run properties for font
    const runPr = this.findElement(rElement, 'rPr', NAMESPACES.w);

    // Базовый шрифт: paragraph-effective (style + pPr → currentParagraphFont) с fallback на docDefaults.
    // Это правильная цепочка inheritance из спецификации DOCX:
    //   docDefaults → paragraph style chain (basedOn) → paragraph pPr → run rPr.
    const baseFont: FontProperties = this.currentParagraphFont || this.getDefaultFont();

    // Overlay от run rPr — берём только то, что явно задано (без хардкод-fallback'ов на TNR).
    const overlay: Partial<FontProperties> = runPr
      ? this.parseRunPropertiesPartial(runPr)
      : {};
    const runFont: FontProperties = { ...baseFont, ...overlay };

    // Recursively parse all children (text elements, breaks, etc.) - excluding w:rPr
    const children: DocumentElement[] = [];
    let childId = 0;
    const childNodes = Array.from(rElement.childNodes).filter(
      node => node.nodeType === Node.ELEMENT_NODE
    ) as Element[];

    for (const child of childNodes) {
      const localName = child.localName || child.tagName;
      // Skip w:rPr (properties) - already handled
      if (localName === 'rPr') {
        continue;
      }
      
      const parsed = this.parseElement(child, childId++);
      if (parsed) {
        children.push(parsed);
      }
    }

    if (children.length === 0) {
      return null; // Skip empty runs
    }

    return {
      id: `r-${id}`,
      type: 'run',
      font: runFont,
      children: children
    };
  }

  /**
   * Parse text element (w:t) - contains text content
   */
  private parseTextElement(tElement: Element, id: number): TextElement | null {
    const textContent = tElement.textContent || '';
    const spaceAttr = tElement.getAttribute('xml:space');
    const preserveSpace = spaceAttr === 'preserve';
    
    let text = textContent;
    if (!preserveSpace) {
      text = textContent.replace(/\s+/g, ' ').trim();
    }

    if (text.length === 0) {
      return null; // Skip empty text elements
    }

    return {
      id: `t-${id}`,
      type: 'text',
      text: text,
      preserveSpace: preserveSpace || undefined
    };
  }

  /**
   * Parse break element (w:br) - line break, page break, etc.
   */
  private parseBreakElement(brElement: Element, id: number): BreakElement {
    // Parse all attributes of the break element
    const props: Record<string, any> = {};
    
    for (let i = 0; i < brElement.attributes.length; i++) {
      const attr = brElement.attributes[i];
      const attrName = attr.name.replace(/^w:/, '');
      props[attrName] = attr.value;
    }

    return {
      id: `br-${id}`,
      type: 'break',
      props: props
    };
  }

  /**
   * Parse hyperlink element (w:hyperlink) - contains hyperlink content
   */
  private parseHyperlinkElement(hyperlinkElement: Element, id: number): HyperlinkElement | null {
    // Recursively parse children (runs, breaks, etc.)
    const children = this.parseElementChildren(hyperlinkElement);
    return {
      id: `hyperlink-${id}`,
      type: 'hyperlink',
      children: children
    };
  }

  /**
   * Parse run properties (w:rPr) — overlay только из того, что явно задано в этом rPr.
   *
   * Возвращаем Partial, чтобы вызывающий код собирал полный font по цепочке
   * docDefaults → paragraph style chain → paragraph pPr → run rPr (DOCX-спецификация).
   * Никаких подмен на TNR/11pt здесь не делаем — это и был корень бага «везде TNR 14».
   */
  private parseRunPropertiesPartial(rPr: Element): Partial<FontProperties> {
    const out: Partial<FontProperties> = {};

    // w:rFonts — приоритет ascii, hAnsi (LTR-сценарии); cs/eastAsia учитываем как best-effort fallback.
    const rFonts = this.findElement(rPr, 'rFonts', NAMESPACES.w);
    if (rFonts) {
      const family = rFonts.getAttribute('w:ascii')
        || rFonts.getAttribute('w:hAnsi')
        || rFonts.getAttribute('w:cs')
        || rFonts.getAttribute('w:eastAsia');
      if (family) out.family = family;
    }

    // w:sz — половинки пунктов.
    const sz = this.findElement(rPr, 'sz', NAMESPACES.w);
    if (sz) {
      const sizeHalfPoints = parseInt(sz.getAttribute('w:val') || '0', 10);
      if (sizeHalfPoints > 0) {
        out.size = UnitConverter.halfPointsToPixels(sizeHalfPoints);
      }
    }

    // w:b / w:i с уважением к w:val="false"/"0" (toggle-off в наследовании).
    const b = this.findElement(rPr, 'b', NAMESPACES.w);
    if (b) {
      const val = b.getAttribute('w:val');
      out.weight = (val === 'false' || val === '0') ? 'normal' : 'bold';
    }

    const i = this.findElement(rPr, 'i', NAMESPACES.w);
    if (i) {
      const val = i.getAttribute('w:val');
      out.style = (val === 'false' || val === '0') ? 'normal' : 'italic';
    }

    return out;
  }

  /**
   * Parse paragraph properties (w:pPr)
   */
  private parseParagraphProperties(
    pPr: Element | null, 
    styleId: string | null
  ): {
    font?: FontProperties;
    spacing?: { before: number; after: number };
    alignment?: 'left' | 'center' | 'right' | 'justify';
  } {
    const result: any = {};

    if (!pPr) {
      // Try to get from style
      if (styleId) {
        const style = this.styles.get(styleId);
        if (style && style.spacing) {
          return {
            font: style.font,
            spacing: {
              before: style.spacing.before || 0,
              after: style.spacing.after || 0
            },
            alignment: style.alignment
          };
        }
      }
      return {
        ...result,
        spacing: { before: 0, after: 0 }
      };
    }

    // Spacing (w:spacing)
    const spacing = this.findElement(pPr, 'spacing', NAMESPACES.w);
    if (spacing) {
      const before = spacing.getAttribute('w:before');
      const after = spacing.getAttribute('w:after');
      const line = spacing.getAttribute('w:line');

      result.spacing = {
        before: before ? UnitConverter.twipsToPixels(parseInt(before, 10)) : 0,
        after: after ? UnitConverter.twipsToPixels(parseInt(after, 10)) : 0
      } as { before: number; after: number };

      if (line) {
        // Line spacing can be "auto", "exact" (twips), or "atLeast" (twips)
        const lineValue = parseInt(line, 10);
        if (!isNaN(lineValue)) {
          // This is a multiplier or exact value
          // For simplicity, treat as multiplier if < 1000, else as twips
          if (lineValue < 1000) {
            result.lineHeight = lineValue / 240; // Convert to multiplier
          } else {
            result.lineHeight = UnitConverter.twipsToPixels(lineValue);
          }
        }
      }
    }

    // Alignment (w:jc)
    const jc = this.findElement(pPr, 'jc', NAMESPACES.w);
    if (jc) {
      const align = jc.getAttribute('w:val');
      if (align === 'center' || align === 'right' || align === 'justify') {
        result.alignment = align;
      } else {
        result.alignment = 'left';
      }
    }

    // Локальный paragraph rPr (paragraph mark / run properties at paragraph level)
    // — overlay поверх style.font. По спецификации DOCX это и есть paragraph-level font override.
    const localRPr = this.findElement(pPr, 'rPr', NAMESPACES.w);
    const localFontOverlay = localRPr ? this.parseRunPropertiesPartial(localRPr) : null;

    // Merge with style if available
    if (styleId) {
      const style = this.styles.get(styleId);
      if (style) {
        if (style.font || localFontOverlay) {
          result.font = { ...(style.font || this.getDefaultFont()), ...(localFontOverlay || {}) };
        }
        if (style.spacing && result.spacing) {
          result.spacing = {
            before: result.spacing.before || style.spacing.before || 0,
            after: result.spacing.after || style.spacing.after || 0
          };
        } else if (style.spacing) {
          result.spacing = {
            before: style.spacing.before || 0,
            after: style.spacing.after || 0
          };
        } else if (!result.spacing) {
          result.spacing = { before: 0, after: 0 };
        }
        result.alignment = result.alignment || style.alignment;
      }
    } else if (localFontOverlay) {
      // Стиля нет, но локальный paragraph rPr задан — мерджим поверх docDefaults.
      result.font = { ...this.getDefaultFont(), ...localFontOverlay };
    }

    // Ensure spacing is always defined
    if (!result.spacing) {
      result.spacing = { before: 0, after: 0 };
    }

    return result;
  }

  /**
   * Parse word/numbering.xml - list definitions
   */
  private async parseNumbering(): Promise<void> {
    if (!this.zip) return;

    const numberingXml = await this.zip.file('word/numbering.xml')?.async('string');
    if (!numberingXml) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(numberingXml, 'text/xml');

    // Parse abstract numbering definitions (abstractNum)
    const abstractNums = new Map<number, Map<number, string>>(); // abstractNumId -> { ilvl -> numFmt }
    const abstractNumElements = this.findAllElements(doc, 'abstractNum', NAMESPACES.w);

    for (const abstractNum of abstractNumElements) {
      const abstractNumId = parseInt(abstractNum.getAttribute('w:abstractNumId') || '0', 10);
      const levels = new Map<number, string>();

      const lvlElements = this.findAllElements(abstractNum, 'lvl', NAMESPACES.w);
      for (const lvl of lvlElements) {
        const ilvl = parseInt(lvl.getAttribute('w:ilvl') || '0', 10);
        const numFmtEl = this.findElement(lvl, 'numFmt', NAMESPACES.w);
        const numFmt = numFmtEl?.getAttribute('w:val') || 'decimal';
        levels.set(ilvl, numFmt);
      }

      abstractNums.set(abstractNumId, levels);
    }

    // Parse concrete numbering definitions (num) - maps numId -> abstractNumId
    const numElements = this.findAllElements(doc, 'num', NAMESPACES.w);
    for (const num of numElements) {
      const numId = parseInt(num.getAttribute('w:numId') || '0', 10);
      const abstractNumIdRef = this.findElement(num, 'abstractNumIdRef', NAMESPACES.w)
        || this.findElement(num, 'abstractNumId', NAMESPACES.w);
      const abstractNumId = abstractNumIdRef
        ? parseInt(abstractNumIdRef.getAttribute('w:val') || '0', 10)
        : 0;

      const levels = abstractNums.get(abstractNumId) || new Map();
      this.numberingMap.set(numId, { abstractNumId, levels });
    }
  }

  /**
   * Parse styles.xml: docDefaults + style chain (с учётом basedOn).
   */
  private async parseStyles(): Promise<void> {
    if (!this.zip) return;

    const stylesXml = await this.zip.file('word/styles.xml')?.async('string');
    if (!stylesXml) {
      console.warn('styles.xml not found, using defaults');
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(stylesXml, 'text/xml');

    // 1) docDefaults — основа для всех run'ов и стилей.
    this.parseDocDefaults(doc);

    // 2) Сами стили: собираем basedOn + partial-overlay по rPr, спейсинг/выравнивание.
    const styleElements = this.findAllElements(doc, 'style', NAMESPACES.w);

    for (const styleEl of styleElements) {
      const styleId = styleEl.getAttribute('w:styleId');
      const styleType = styleEl.getAttribute('w:type');
      const nameEl = this.findElement(styleEl, 'name', NAMESPACES.w);
      const styleName = nameEl?.getAttribute('w:val');

      if (!styleId || !styleType) continue;

      const basedOnEl = this.findElement(styleEl, 'basedOn', NAMESPACES.w);
      const basedOnId = basedOnEl?.getAttribute('w:val') || undefined;

      const style: StyleDefinition = {
        id: styleId,
        name: styleName || undefined,
        type: styleType as any,
        basedOn: basedOnId,
      };

      // Сохраняем именно partial-overlay (только то, что явно задано в стиле).
      // Полный font соберём в resolveStylesInheritance() через цепочку basedOn поверх docDefaults.
      const rPr = this.findElement(styleEl, 'rPr', NAMESPACES.w);
      if (rPr) {
        this.styleFontOverlays.set(styleId, this.parseRunPropertiesPartial(rPr));
      }

      const pPr = this.findElement(styleEl, 'pPr', NAMESPACES.w);
      if (pPr) {
        const props = this.parseParagraphProperties(pPr, null);
        style.spacing = props.spacing;
        style.alignment = props.alignment;
        style.numPr = this.parseNumberingProperties(pPr);
      }

      this.styles.set(styleId, style);
    }

    // 3) Резолвим font по basedOn-цепочке для каждого стиля.
    this.resolveStylesInheritance();
  }

  private parseNumberingProperties(pPr: Element | null): StyleDefinition['numPr'] {
    if (!pPr) return undefined;
    const numPr = this.findElement(pPr, 'numPr', NAMESPACES.w);
    if (!numPr) return undefined;
    const result: NonNullable<StyleDefinition['numPr']> = {};
    for (const key of ['numId', 'ilvl'] as const) {
      const element = this.findElement(numPr, key, NAMESPACES.w);
      const value = Number.parseInt(element?.getAttribute('w:val') || '', 10);
      if (Number.isFinite(value) && value >= 0) result[key] = value;
    }
    return result;
  }

  /**
   * Прочитать <w:docDefaults><w:rPrDefault><w:rPr> и применить overlay поверх стартового this.docDefaults.
   * Это обязательный шаг: без него ВСЕ run'ы без явного rPr получают захардкоженный TNR 11pt,
   * что в большинстве реальных DOCX (Calibri 11 / системные шрифты) даёт визуальный mismatch.
   */
  private parseDocDefaults(stylesDoc: globalThis.Document): void {
    const docDefaultsEl = this.findElement(stylesDoc, 'docDefaults', NAMESPACES.w);
    if (!docDefaultsEl) return;

    const rPrDefault = this.findElement(docDefaultsEl, 'rPrDefault', NAMESPACES.w);
    if (!rPrDefault) return;

    const rPr = this.findElement(rPrDefault, 'rPr', NAMESPACES.w);
    if (!rPr) return;

    const overlay = this.parseRunPropertiesPartial(rPr);
    this.docDefaults = { ...this.docDefaults, ...overlay };
  }

  /**
   * Резолв style.font через цепочку basedOn: docDefaults → root → ... → style.
   * Cycle-safe: visited set предотвращает зацикливание на некорректных DOCX.
   */
  private resolveStylesInheritance(): void {
    for (const [styleId, style] of this.styles) {
      const chain: string[] = [];
      const visited = new Set<string>();
      let cursor: string | undefined = styleId;
      while (cursor && !visited.has(cursor) && this.styles.has(cursor)) {
        visited.add(cursor);
        chain.push(cursor);
        cursor = this.styles.get(cursor)!.basedOn;
      }

      // Применяем overlay'и от корня (basedOn-родитель) к листу (текущий стиль).
      let font: FontProperties = { ...this.docDefaults };
      for (let i = chain.length - 1; i >= 0; i--) {
        const overlay = this.styleFontOverlays.get(chain[i]);
        if (overlay) font = { ...font, ...overlay };
      }
      style.font = font;
    }
  }

  /**
   * Parse page settings from word/settings.xml
   */
  /**
   * Parse page settings and extract header/footer references from sectPr
   */
  private async parsePageSettingsAndRefs(): Promise<{
    pageConfig: PageConfig;
    headerRefs: { type: string; rId: string }[];
    footerRefs: { type: string; rId: string }[];
  }> {
    const headerRefs: { type: string; rId: string }[] = [];
    const footerRefs: { type: string; rId: string }[] = [];

    if (!this.zip) {
      return { pageConfig: this.getDefaultPageConfig(), headerRefs, footerRefs };
    }

    const documentXml = await this.zip.file('word/document.xml')?.async('string');
    if (documentXml) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(documentXml, 'text/xml');

      const body = this.findElement(doc, 'body', NAMESPACES.w) || doc.querySelector('body');
      if (body) {
        const sectPr = this.findElement(body, 'sectPr', NAMESPACES.w);
        if (sectPr) {
          const pageConfig = this.parseSectionProperties(sectPr);

          // Extract header references
          const headerRefEls = this.findAllElements(sectPr, 'headerReference', NAMESPACES.w);
          for (const el of headerRefEls) {
            const type = el.getAttribute('w:type') || 'default';
            const rId = el.getAttribute('r:id') || el.getAttributeNS(NAMESPACES.r, 'id') || '';
            if (rId) headerRefs.push({ type, rId });
          }

          // Extract footer references
          const footerRefEls = this.findAllElements(sectPr, 'footerReference', NAMESPACES.w);
          for (const el of footerRefEls) {
            const type = el.getAttribute('w:type') || 'default';
            const rId = el.getAttribute('r:id') || el.getAttributeNS(NAMESPACES.r, 'id') || '';
            if (rId) footerRefs.push({ type, rId });
          }

          return { pageConfig, headerRefs, footerRefs };
        }
      }
    }

    return { pageConfig: this.getDefaultPageConfig(), headerRefs, footerRefs };
  }

  /**
   * Parse header/footer XML files referenced from sectPr
   */
  private async parseHeaderFooters(
    refs: { type: string; rId: string }[],
    kind: 'header' | 'footer',
  ): Promise<HeaderFooter[]> {
    if (!this.zip || refs.length === 0) return [];

    const results: HeaderFooter[] = [];

    for (const ref of refs) {
      const target = this.relationships.get(ref.rId);
      if (!target) continue;

      const filePath = target.startsWith('word/') ? target : `word/${target}`;
      const xml = await this.zip.file(filePath)?.async('string');
      if (!xml) continue;

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        // Header/footer XML has root <w:hdr> or <w:ftr> with same child structure as body
        const root = kind === 'header'
          ? (this.findElement(doc, 'hdr', NAMESPACES.w) || doc.documentElement)
          : (this.findElement(doc, 'ftr', NAMESPACES.w) || doc.documentElement);

        const elements: DocumentElement[] = [];
        let elementId = 0;
        const childNodes = Array.from(root.childNodes).filter(
          node => node.nodeType === Node.ELEMENT_NODE
        ) as Element[];

        for (const child of childNodes) {
          const localName = child.localName || child.tagName;
          if (localName === 'sectPr') continue;
          const result = this.parseElement(child, elementId++);
          if (result) elements.push(result);
        }

        const hfType = (ref.type === 'first' ? 'first' : ref.type === 'even' ? 'even' : 'default') as HeaderFooter['type'];
        results.push({ type: hfType, elements });
      } catch (e) {
        console.warn(`Failed to parse ${kind} ${filePath}:`, e);
      }
    }

    return results;
  }

  /**
   * Parse section properties for page settings
   */
  private parseSectionProperties(sectPr: Element): PageConfig {
    const config = this.getDefaultPageConfig();

    const pgSz = this.findElement(sectPr, 'pgSz', NAMESPACES.w);
    if (pgSz) {
      const width = pgSz.getAttribute('w:w');
      const height = pgSz.getAttribute('w:h');
      if (width) config.width = UnitConverter.twipsToPixels(parseInt(width, 10));
      if (height) config.height = UnitConverter.twipsToPixels(parseInt(height, 10));
    }

    const pgMar = this.findElement(sectPr, 'pgMar', NAMESPACES.w);
    if (pgMar) {
      const top = pgMar.getAttribute('w:top');
      const bottom = pgMar.getAttribute('w:bottom');
      const left = pgMar.getAttribute('w:left');
      const right = pgMar.getAttribute('w:right');
      if (top) config.margins.top = UnitConverter.twipsToPixels(parseInt(top, 10));
      if (bottom) config.margins.bottom = UnitConverter.twipsToPixels(parseInt(bottom, 10));
      if (left) config.margins.left = UnitConverter.twipsToPixels(parseInt(left, 10));
      if (right) config.margins.right = UnitConverter.twipsToPixels(parseInt(right, 10));
    }

    return config;
  }

  /**
   * Parse relationships (for images, etc.)
   */
  private async parseRelationships(): Promise<void> {
    if (!this.zip) return;

    const relsXml = await this.zip.file('word/_rels/document.xml.rels')?.async('string');
    if (!relsXml) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(relsXml, 'text/xml');

    const relationships = doc.querySelectorAll('Relationship');
    for (const rel of Array.from(relationships)) {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target) {
        this.relationships.set(id, target);
      }
    }
  }

  /**
   * Parse images from word/media/
   */
  private async parseImages(): Promise<void> {
    if (!this.zip) return;

    // Find all image relationships and load them
    for (const [rId, target] of this.relationships.entries()) {
      // Check if it's a media file (image)
      if (target.startsWith('media/') || target.includes('/media/')) {
        const imagePath = target.startsWith('word/') ? target : `word/${target}`;
        const imageFile = this.zip.file(imagePath);
        
        if (imageFile) {
          try {
            const imageData = await imageFile.async('arraybuffer');
            const mimeType = this.getMimeTypeFromPath(target);
            const base64 = this.arrayBufferToBase64(imageData);
            const dataUrl = `data:${mimeType};base64,${base64}`;
            this.images.set(rId, dataUrl);
          } catch (e) {
            console.warn(`Failed to load image: ${target}`, e);
          }
        }
      }
    }
  }

  /**
   * Convert ArrayBuffer to base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Get MIME type from file path
   */
  private getMimeTypeFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      tiff: 'image/tiff',
      tif: 'image/tiff',
      emf: 'image/x-emf',
      wmf: 'image/x-wmf',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * Get default page configuration
   */
  private getDefaultPageConfig(): PageConfig {
    const size = UnitConverter.getDefaultPageSize();
    const margins = UnitConverter.getDefaultMargins();
    
    return {
      width: size.width,
      height: size.height,
      margins
    };
  }

  /**
   * Get default font
   */
  /**
   * Эффективные docDefaults документа (после parseDocDefaults).
   * До успешного парсинга styles.xml возвращает стартовое значение из конструктора (TNR 11pt).
   */
  private getDefaultFont(): FontProperties {
    return { ...this.docDefaults };
  }

  /**
   * Find element by local name and namespace
   * Handles XML namespaces properly
   */
  private findElement(parent: Element | globalThis.Document, localName: string, namespace: string): Element | null {
    // Try namespace-aware lookup
    if (parent instanceof globalThis.Document || 'getElementsByTagNameNS' in parent) {
      const elements = (parent as globalThis.Document).getElementsByTagNameNS(namespace, localName);
      if (elements.length > 0) {
        return elements[0];
      }
    }
    
    // Fallback: try without namespace (some parsers don't preserve namespaces)
    if (parent instanceof globalThis.Document || 'getElementsByTagName' in parent) {
      const allElements = (parent as globalThis.Document).getElementsByTagName(localName);
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        // Check if element's namespace matches
        if (el.namespaceURI === namespace || !el.namespaceURI) {
          return el;
        }
      }
    }
    
    return null;
  }

  /**
   * Find all elements by local name and namespace
   */
  private findAllElements(parent: Element | globalThis.Document, localName: string, namespace: string): Element[] {
    const results: Element[] = [];
    
    // Try namespace-aware lookup
    if (parent instanceof globalThis.Document || 'getElementsByTagNameNS' in parent) {
      const elements = (parent as globalThis.Document).getElementsByTagNameNS(namespace, localName);
      for (let i = 0; i < elements.length; i++) {
        results.push(elements[i]);
      }
    }
    
    // Fallback: try without namespace
    if (results.length === 0) {
      if (parent instanceof globalThis.Document || 'getElementsByTagName' in parent) {
        const allElements = (parent as globalThis.Document).getElementsByTagName(localName);
        for (let i = 0; i < allElements.length; i++) {
          const el = allElements[i];
          if (el.namespaceURI === namespace || !el.namespaceURI) {
            results.push(el);
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Find only direct children elements with specified local name and namespace
   * Does not search recursively - only immediate children
   */
  private findDirectChildren(parent: Element, localName: string, namespace: string): Element[] {
    const results: Element[] = [];
    
    // Iterate through direct children only
    for (let i = 0; i < parent.childNodes.length; i++) {
      const node = parent.childNodes[i];
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        // Check if local name and namespace match
        // Use localName if available, otherwise fallback to tagName (without namespace prefix)
        const elementLocalName = element.localName || element.tagName.split(':').pop() || element.tagName;
        const elementNamespace = element.namespaceURI || '';
        
        if (elementLocalName === localName && elementNamespace === namespace) {
          results.push(element);
        }
      }
    }
    
    return results;
  }
}

/**
 * Convenience function to parse DOCX directly
 */
export async function parseDocxXml(arrayBuffer: ArrayBuffer): Promise<DocDocument> {
  const parser = new DocxXmlParser();
  const docxDoc = await parser.parse(arrayBuffer);

  // Convert internal styles map to plain object for Document model
  const styles: Record<string, any> = {};
  for (const [id, style] of docxDoc.styles.entries()) {
    styles[id] = style;
  }

  // Convert numbering map (convert Map levels to Record for serialization)
  const numbering: Record<number, NumberingDefinition> = {};
  for (const [numId, def] of docxDoc.numbering.entries()) {
    const levels: Record<number, string> = {};
    if (def.levels instanceof Map) {
      for (const [ilvl, fmt] of def.levels.entries()) {
        levels[ilvl] = fmt;
      }
    }
    numbering[numId] = { abstractNumId: def.abstractNumId, levels };
  }

  return {
    elements: docxDoc.elements,
    pageConfig: docxDoc.pageConfig,
    headers: docxDoc.headers.length > 0 ? docxDoc.headers : undefined,
    footers: docxDoc.footers.length > 0 ? docxDoc.footers : undefined,
    styles: Object.keys(styles).length > 0 ? styles : undefined,
    numbering: Object.keys(numbering).length > 0 ? numbering : undefined,
    docDefaults: docxDoc.docDefaults,
  };
}

