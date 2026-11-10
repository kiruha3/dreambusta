// Element handlers for different document element types

import { InlineFlowProcessor } from './inlineFlowProcessor';
import { ILayoutManager, PageLayoutManager } from './pageLayout';
import { TextMeasurer } from './textMeasurer';
import type {
  DocumentElement,
  FlowRange,
  FontProperties,
  ImageElement,
  LaidOutImage,
  LaidOutRegion,
  LaidOutTable,
  ParagraphElement,
  RunElement,
  SectionBreakElement,
  TableElement,
  TableCellElement,
  TableRowElement,
  TextElement,
  TextLine,
  BreakElement,
  HyperlinkElement
} from './types';
import { UnitConverter } from './unitConverter';

/**
 * Function to layout a child element (provided by FlowCalculator)
 * @param childElement - Element to layout
 * @param startY - Starting Y position for layout
 * @param pageLayout - Optional layout manager to use (for floating elements, etc.)
 *                     If not provided, uses the default pageLayout from handler context
 */
export type LayoutChildFunction = (
  childElement: DocumentElement,
  pageLayout?: ILayoutManager
) => LaidOutRegion[];

export interface ElementHandlerLayoutInterface {
  pageLayout: ILayoutManager;
  textMeasurer: TextMeasurer;
  layoutChild: LayoutChildFunction;
  getNumListsById(id: string): number;
  incrementNumListsById(id: string): void;
  decrementNumListsById(id: string): void;
}

export interface ElementHandler {
  canHandle(element: DocumentElement): boolean;
  /**
   * Check if element is floating (has wrap style)
   */
  isFloating(element: DocumentElement): boolean;
  /**
   * Layout element - handler is responsible for layout decisions including children
   * - For inline layout (paragraph): process runs/children inline
   * - For block layout (tables, etc): process children as block elements
   * @param layoutChild Function to layout child elements (for recursive layout)
   * @param getAvailableWidthProvider Optional function to get available width provider with global floating regions
   * @returns Array of regions where element was laid out (can be multiple for split elements)
   */
  layout(
    layoutInterface: ElementHandlerLayoutInterface,
    element: DocumentElement,
  ): LaidOutRegion[];
}

/**
 * Handler for paragraph elements
 */
export class ParagraphHandler implements ElementHandler {
  canHandle(element: DocumentElement): boolean {
    return element.type === 'paragraph';
  }

  isFloating(_element: DocumentElement): boolean {
    return false; // Paragraphs are not floating
  }

  layout(
    layoutInterface: ElementHandlerLayoutInterface,
    element: DocumentElement,
  ): LaidOutRegion[] {
    const { pageLayout, textMeasurer } = layoutInterface;
    const paragraph = element as ParagraphElement;
    const pageConfig = pageLayout.getPageConfig();

    const leftMarginPx = pageConfig.margins.left;
    const rightMarginPx = pageConfig.margins.right;
    const pageContentWidthPx = pageConfig.width - leftMarginPx - rightMarginPx;

    const lineIndentLeftPx = UnitConverter.twipsToPixels(paragraph.props.ind?.left || 0);
    const firstLineIndentPx = lineIndentLeftPx 
      + UnitConverter.twipsToPixels(paragraph.props.ind?.firstLine || 0)
      - UnitConverter.twipsToPixels(paragraph.props.ind?.hanging || 0);

    const spacingBefore = paragraph.props.spacing?.before || 0;
    const spacingAfter = paragraph.props.spacing?.after || 0;

    const addParagraphLaidOutRegion = (lines: TextLine[], linesHeight: number) => {
      pageLayout.addContent({
        element: paragraph,
        x: leftMarginPx,
        y: pageLayout.getCurrentY(),
        width: pageContentWidthPx,
        height: linesHeight + spacingBefore + spacingAfter,
        elementData: {
          element: paragraph,
          lines: lines,
          height: linesHeight + spacingBefore + spacingAfter,
          pageNumber: pageLayout.getCurrentPage().pageNumber,
          yPosition: pageLayout.getCurrentY()
        },
        children: lines,
      }, false);
    };

    // Get available width provider that accounts for floating elements
    const lineFlowRangesProvider = (y: number, height: number): FlowRange[] => {
      const lineFlowRangesProvider = pageLayout.getLineFlowRangesProvider(pageLayout.getCurrentY());
      
      const lineRangeStartPx = leftMarginPx + inlineFlowProcessor.lineStartOffset;
      const lineRangeEndPx = leftMarginPx + pageContentWidthPx;
      const lineFlowRanges = lineFlowRangesProvider(y, height);
      
      return lineFlowRanges.reduce((acc, flowRange) => {
        if (flowRange.x + flowRange.width <= lineRangeStartPx) return acc;
        if (flowRange.x >= lineRangeEndPx) return acc;
        const flowRangeStartPx = Math.max(lineRangeStartPx, flowRange.x);
        const flowRangeEndPx = Math.min(lineRangeEndPx, flowRange.x + flowRange.width);
        acc.push({
          x: flowRangeStartPx - leftMarginPx,
          width: flowRangeEndPx - flowRangeStartPx,
        });
        return acc;
      }, [] as FlowRange[]);
    }

    const inlineFlowProcessor = new InlineFlowProcessor({
      textMeasurer: textMeasurer,
      element: paragraph,
      alignment: paragraph.props.jc?.val || 'left',
      linesVerticalStartOffset: spacingBefore,
      lineStartOffset: firstLineIndentPx,
      lineEndOffset: 0,
      lineWidth: pageContentWidthPx,
      lineFlowRangesProvider: lineFlowRangesProvider,
      defaultFont: this.getDefaultFontFromParagraph(paragraph),
      onBeforeLine: (line: TextLine) => {
        const linesHeight = line.y + line.height;
        const fitsOnCurrentPage = pageLayout.fitsOnCurrentPage(linesHeight + spacingAfter);
        if (!fitsOnCurrentPage) {
          addParagraphLaidOutRegion(inlineFlowProcessor.flushLines(), linesHeight);
          pageLayout.advanceToNextPage();
        }
        inlineFlowProcessor.setLineStartOffset(lineIndentLeftPx);
      }
    });

    if (paragraph.props.numPr) {
      const numPr = paragraph.props.numPr;
      const numId = numPr.numId;
      const ilvl = numPr.ilvl;
      const listItemIndex = layoutInterface.getNumListsById(`${numId}-${ilvl}`);
      layoutInterface.incrementNumListsById(`${numId}-${ilvl}`);
      inlineFlowProcessor.layout({
        type: 'text',
        text: numPr.numFmt === 'bullet' ? '• ' : numPr.numFmt === 'none' ? '' : `${listItemIndex + 1}. `,
        id: `${paragraph.id}-numPr-${numId}-${ilvl}`
      })
    }

    const layoutRun = (runElement: RunElement) => {
      for (const runChildEl of runElement.children || []) {
        switch (runChildEl.type) {
          case 'text':
            inlineFlowProcessor.layout(runChildEl as TextElement, runElement.font);
            break;
          case 'break':
            inlineFlowProcessor.finalizeLine();
            if ((runChildEl as BreakElement).props.type === 'page') {
              const lines = inlineFlowProcessor.flushLines();
              if (lines.length > 0) {
                addParagraphLaidOutRegion(lines, lines[lines.length - 1].y + lines[lines.length - 1].height - spacingBefore);
              }
              pageLayout.advanceToNextPage();
            }
            break;
          default:
            break;
        }
      }
    }

    for (const childEl of paragraph.children || []) {
      if (childEl.type === 'run') {
        layoutRun(childEl as RunElement);
      } else if (childEl.type === 'hyperlink') {
        const hyperlinkElement = childEl as HyperlinkElement;
        for (const hyperlinkChildEl of hyperlinkElement.children || []) {
          if (hyperlinkChildEl.type === 'run') {
            layoutRun(hyperlinkChildEl as RunElement);
          }
        }
      }
    }

    inlineFlowProcessor.finalizeLine();
    const lines = inlineFlowProcessor.flushLines();
    if (lines.length > 0) {
      addParagraphLaidOutRegion(lines, lines[lines.length - 1].y + lines[lines.length - 1].height - spacingBefore);
    }
    
    return [];
  }
  
  /**
   * Get default font from paragraph (from first run or default)
   */
  private getDefaultFontFromParagraph(paragraph: ParagraphElement): FontProperties {
    // Try to get font from first run child
    if (paragraph.children && paragraph.children.length > 0) {
      const firstRun = paragraph.children.find(child => child.type === 'run') as RunElement | undefined;
      if (firstRun) {
        return firstRun.font;
      }
    }
    
    // Default font
    return {
      family: 'Times New Roman',
      size: 11,
      weight: 'normal',
      style: 'normal',
      lineHeight: 1.15
    };
  }
  
}

/**
 * Handler for table elements (placeholder)
 * Tables use block layout for children (cells contain block elements)
 */
export class TableHandler implements ElementHandler {
  canHandle(element: DocumentElement): boolean {
    return element.type === 'table';
  }

  isFloating(element: DocumentElement): boolean {
    const table = element as TableElement;
    return !!table.props.tblpPr;
  }

  layout(
    layoutInterface: ElementHandlerLayoutInterface,
    element: DocumentElement,
  ): LaidOutRegion[] {
    const { pageLayout, textMeasurer, layoutChild } = layoutInterface;
    const tableEl = element as TableElement;
    const tableWidth = tableEl.grid.reduce((sum, column) => sum + column.width, 0);
    const rows = tableEl.children?.filter(child => child.type === 'table-row') || [];
    const leftMargin = pageLayout.getPageConfig().margins.left;

    const isFloating = this.isFloating(element);
    if (isFloating) {
      const tblpPr = tableEl.props.tblpPr!;
      
      let x = 0;
      switch (tblpPr.horzAnchor) {
        case 'margin':
          x = pageLayout.getPageConfig().margins.left
            + UnitConverter.twipsToPixels(tblpPr.tblpX || 0);
          break;
        case 'text':
          x = pageLayout.getPageConfig().margins.left
          + UnitConverter.twipsToPixels(tblpPr.tblpX || 0);
          break;
        default:
          x = UnitConverter.twipsToPixels(tblpPr.tblpX || 0);
      }

      let y = 0;
      switch (tblpPr.vertAnchor) {
        case 'margin':
          y = pageLayout.getPageConfig().margins.top
            + UnitConverter.twipsToPixels(tblpPr.tblpY || 0);
          break;
        case 'text':
          y = pageLayout.getCurrentY()
            + UnitConverter.twipsToPixels(tblpPr.tblpY || 0);
          break;
        default:
          y = UnitConverter.twipsToPixels(tblpPr.tblpY || 0);
      }
      
      // For floating tables, use PageLayoutManager with very large page size
      // This allows us to use getCurrentY() instead of manual tracking
      const floatingTableLayout = new PageLayoutManager({
        width: pageLayout.getPageConfig().width,
        height: Number.MAX_SAFE_INTEGER,
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      });

      // Layout table using the same code but with very large page size layout manager
      // layoutChild will receive floatingTableLayout as third parameter in layoutCellContent
      const tableRegions = this.layoutTableInternal(
        tableEl,
        rows,
        tableWidth,
        0, // leftMargin = 0 for floating tables (coordinates are absolute)
        textMeasurer,
        floatingTableLayout,
        layoutChild
      );

      // Get total height from regions
      let tableHeight = 0;
      if (tableRegions.length > 0) {
        const lastRegion = tableRegions[tableRegions.length - 1];
        tableHeight = lastRegion.y + lastRegion.height;
      }

      // Create single region for floating table
      const laidOutTable: LaidOutTable = {
        element: tableEl,
        height: tableHeight,
        pageNumber: pageLayout.getCurrentPage().pageNumber,
        yPosition: y
      };
      
      // Merge all regions into one (floating tables don't split across pages)
      const allRowRegions: LaidOutRegion[] = [];
      for (const tableRegion of tableRegions) {
        if (tableRegion.children) {
          allRowRegions.push(...tableRegion.children);
        }
      }

      const region: LaidOutRegion = {
        element: tableEl,
        x: x,
        y: y,
        width: tableWidth,
        height: tableHeight,
        elementData: laidOutTable,
        children: allRowRegions
      };

      pageLayout.registerFloatingRegion(region);
      pageLayout.addContent(region, true);
      return [];
    } else {
      // Non-floating table: layout row by row with page breaks
      return this.layoutTableInternal(tableEl, rows, tableWidth, leftMargin, textMeasurer, pageLayout, layoutChild);
    }
  }

  /**
   * Internal table layout method - can be used for both floating and non-floating tables
   */
  private layoutTableInternal(
    tableEl: TableElement,
    rows: DocumentElement[],
    tableWidth: number,
    leftMargin: number,
    measurer: TextMeasurer,
    pageLayout: ILayoutManager,
    layoutChild: LayoutChildFunction,
  ): LaidOutRegion[] {
    const regions: LaidOutRegion[] = [];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] as TableRowElement;
      const cells = row.children?.filter(child => child.type === 'table-cell') || [];

      // Calculate row height by processing all cells
      let rowHeight = 0;
      const cellRegions: LaidOutRegion[] = [];
      const cellLayoutResults: { height: number; children: LaidOutRegion[] }[] = [];
      // X position of cells inside the row, relative to table left
      let currentCellLocalX = 0;

      // First pass: layout all cells and find maximum height
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
        const cell = cells[cellIndex] as TableCellElement;
        const cellWidth = tableEl.grid[cellIndex]?.width || 0;
        const cellContentWidth = cellWidth;

        // Layout cell content using real layout if layoutChild is available
        const cellLayoutResult = this.layoutCellContent(
          cell,
          cellContentWidth,
          measurer,
          pageLayout,
          layoutChild
        );

        const cellHeight = cellLayoutResult.height;
        rowHeight = Math.max(rowHeight, cellHeight);
        cellLayoutResults.push(cellLayoutResult);

        currentCellLocalX += cellWidth;
      }

      // Second pass: create cell regions with uniform height (equal to row height)
      currentCellLocalX = 0;
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
        const cell = cells[cellIndex] as TableCellElement;
        const cellWidth = tableEl.grid[cellIndex]?.width || 0;
        const cellLayoutResult = cellLayoutResults[cellIndex];

        // Store cell region with coordinates relative to row top-left
        // All cells have the same height (rowHeight) for proper alignment
        cellRegions.push({
          element: cell,
          x: currentCellLocalX,
          y: 0,
          width: cellWidth,
          height: rowHeight, // All cells have same height as row
          children: cellLayoutResult.children || []
        });

        currentCellLocalX += cellWidth;
      }

      // Check if row fits on current page
      const requiredHeight = rowHeight;
      const fitsOnPage = pageLayout.fitsOnCurrentPage(requiredHeight);

      if (!fitsOnPage) {
        // Row doesn't fit - move to next page
        // Note: If row is taller than a single page, it will still be placed
        // (could be improved in future to split very tall rows/cells)
        pageLayout.advanceToNextPage();
      }

      const currentPage = pageLayout.getCurrentPage();
      const lastTableRegion = regions[regions.length - 1];
      const isSameTableOnSamePage =
        !!lastTableRegion &&
        lastTableRegion.element.id === tableEl.id &&
        lastTableRegion.elementData &&
        (lastTableRegion.elementData as LaidOutTable).pageNumber === currentPage.pageNumber;

      // Local Y of row inside table region (top of table region is 0)
      const rowLocalY = isSameTableOnSamePage
        ? lastTableRegion.height
        : 0;

      // Place row - use pageLayout.getCurrentY() which works for both cases
      const rowY = pageLayout.getCurrentY();
      
      // Create row region with coordinates relative to table region
      const rowRegion: LaidOutRegion = {
        element: row,
        x: 0,
        y: rowLocalY,
        width: tableWidth,
        height: rowHeight,
        children: cellRegions
      };

      // Create table region for this row (or merge with previous if on same page)
      if (isSameTableOnSamePage) {
        // Extend existing table region on same page by increasing its height
        lastTableRegion.height = lastTableRegion.height + rowHeight;
        if (!lastTableRegion.children) {
          lastTableRegion.children = [];
        }
        lastTableRegion.children.push(rowRegion);
      } else {
        // Create new table region for this page
        const laidOutTable: LaidOutTable = {
          element: tableEl,
          height: rowHeight,
          pageNumber: currentPage.pageNumber,
          yPosition: rowY
        };

        const tableRegion: LaidOutRegion = {
          element: tableEl,
          x: leftMargin,
          y: rowY,
          width: tableWidth,
          height: rowHeight,
          elementData: laidOutTable,
          children: [rowRegion]
        };

        regions.push(tableRegion);
        // Always add content to update getCurrentY() correctly
        // For floating tables, this updates the internal Y tracking
        pageLayout.addContent(tableRegion, false);
      }
    }

    return regions;
  }

  /**
   * Layout cell content and return its height and children regions
   * Creates a separate layout manager for each cell to track Y independently
   */
  private layoutCellContent(
    cell: TableCellElement,
    cellWidth: number,
    _measurer: TextMeasurer,
    _parentPageLayout: ILayoutManager,
    layoutChild: LayoutChildFunction,
  ): { height: number; children: LaidOutRegion[] } {
    if (!cell.children || cell.children.length === 0) {
      return { height: 20, children: [] }; // Minimum cell height
    }

    // Create a separate layout manager for this cell
    // This allows each cell to track Y position independently
    const cellLayout = new PageLayoutManager({
      width: cellWidth,
      height: Number.MAX_SAFE_INTEGER,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    // Layout all children - handlers will add content to cellLayout automatically
    for (const child of cell.children) {
      // Layout child element using cell's own layout manager
      // Handlers will add content to cellLayout through addContent
      layoutChild(child, cellLayout);
    }

    // Get regions from cellLayout after all children are laid out
    const allPages = cellLayout.getAllPages();
    const children: LaidOutRegion[] = [];
    
    // Collect all flowContent regions from cellLayout
    for (const page of allPages) {
      for (const region of page.flowContent) {
        // Convert regions to cell-local coordinates (x=0, y relative to cell start)
        const cellLocalRegion: LaidOutRegion = {
          ...region,
          x: 0, // Content starts at left edge of cell (padding will be applied in renderer)
          y: region.y, // Already relative to cell start (cellLayout starts at Y=0)
        };
        children.push(cellLocalRegion);
      }
    }

    // Get total height from cellLayout's current Y position
    const totalHeight = Math.max(cellLayout.getCurrentY(), 20);
    
    return { height: totalHeight, children };
  }

}

/**
 * Handler for image elements (placeholder)
 */
export class ImageHandler implements ElementHandler {
  canHandle(element: DocumentElement): boolean {
    return element.type === 'image';
  }

  isFloating(element: DocumentElement): boolean {
    const image = element as ImageElement;
    return !!(image.wrapStyle && 
      (image.wrapStyle === 'square' || image.wrapStyle === 'tight'));
  }

  layout(
    layoutInterface: ElementHandlerLayoutInterface,
    element: DocumentElement,
  ): LaidOutRegion[] {
    const { pageLayout } = layoutInterface;
    const image = element as ImageElement;
    const pageConfig = pageLayout.getPageConfig();
    
    // Position: floating images use left margin (region was already collected in first pass)
    const x = pageConfig.margins.left;
    
    const laidOutImage: LaidOutImage = {
      element: image,
      height: image.height,
      pageNumber: pageLayout.getCurrentPage().pageNumber,
      yPosition: pageLayout.getCurrentY(),
      x: x
    };

    return [{
      element: image,
      x: x,
      y: pageLayout.getCurrentY(),
      width: image.width,
      height: image.height,
      elementData: laidOutImage
    }];
  }
}

/**
 * Handler for section breaks
 */
export class SectionBreakHandler implements ElementHandler {
  canHandle(element: DocumentElement): boolean {
    return element.type === 'section-break';
  }

  isFloating(_element: DocumentElement): boolean {
    return false; // Section breaks are not floating
  }

  layout(
    layoutInterface: ElementHandlerLayoutInterface,
    element: DocumentElement,
  ): LaidOutRegion[] {
    const { pageLayout } = layoutInterface;
    const sectionBreak = element as SectionBreakElement;
    
    // Update page config if provided
    if (sectionBreak.pageConfig) {
      // TODO: Apply new page config
    }
    
    // Force page break
    pageLayout.advanceToNextPage();
    
    return []; // Section breaks don't create laid out elements
  }
}

/**
 * Handler for page breaks
 */
export class PageBreakHandler implements ElementHandler {
  canHandle(element: DocumentElement): boolean {
    return element.type === 'page-break';
  }

  isFloating(_element: DocumentElement): boolean {
    return false; // Page breaks are not floating
  }

  layout(
    layoutInterface: ElementHandlerLayoutInterface,
    _element: DocumentElement,
  ): LaidOutRegion[] {
    const { pageLayout } = layoutInterface;
    // Force page break
    pageLayout.advanceToNextPage();
    return []; // Page breaks don't create laid out elements
  }
}

/**
 * Registry of element handlers
 */
export class ElementHandlerRegistry {
  private handlers: ElementHandler[] = [];

  constructor() {
    // Register default handlers
    this.register(new ParagraphHandler());
    this.register(new TableHandler());
    this.register(new ImageHandler());
    this.register(new SectionBreakHandler());
    this.register(new PageBreakHandler());
  }

  register(handler: ElementHandler): void {
    this.handlers.push(handler);
  }

  getHandler(element: DocumentElement): ElementHandler | null {
    return this.handlers.find(h => h.canHandle(element)) || null;
  }
}

