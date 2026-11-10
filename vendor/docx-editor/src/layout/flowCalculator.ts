// Flow calculator - handles content flow and page breaks for document elements

import { ElementHandlerLayoutInterface, ElementHandlerRegistry, type LayoutChildFunction } from './elementHandlers';
import { PageLayoutManager, type ILayoutManager } from './pageLayout';
import { TextMeasurer } from './textMeasurer';
import type { Document, DocumentElement, FloatingRegion, FlowRange, LaidOutRegion, LineFlowRangesProvider, Page, PageConfig } from './types';

// export class FlowCalculatorLayoutInterface implements ElementHandlerLayoutInterface {
//   readonly flowCalculator: FlowCalculator;

//   constructor(flowCalculator: FlowCalculator) {
//     this.flowCalculator = flowCalculator;
//   }

//   readonly pageLayout: ILayoutManager;
//   textMeasurer: TextMeasurer;
//   layoutChild: LayoutChildFunction;
//   getNumListsById(id: string): number {
//     throw new Error('Method not implemented.');
//   }
//   incrementNumListsById(id: string): void {
//     throw new Error('Method not implemented.');
//   }
//   decrementNumListsById(id: string): void {
//     throw new Error('Method not implemented.');
//   }
  
// }

export class FlowCalculator {
  private textMeasurer: TextMeasurer;
  private pageLayout: PageLayoutManager;
  private handlerRegistry: ElementHandlerRegistry;
  // Global floating regions with anchor elements for page identification
  private globalFloatingRegions: FloatingRegion[] = [];
  private numListsByIdsMap: Map<string, number> = new Map();
  private layoutInterface: ElementHandlerLayoutInterface;

  constructor(pageConfig?: Partial<PageConfig>) {
    this.textMeasurer = new TextMeasurer();
    this.pageLayout = new PageLayoutManager(pageConfig);
    this.handlerRegistry = new ElementHandlerRegistry();
    this.layoutInterface = {
      pageLayout: this.pageLayout,
      textMeasurer: this.textMeasurer,
      layoutChild: (childElement: DocumentElement, branchLayoutManager?: ILayoutManager) => {
        return [];
      },
      getNumListsById: (id: string) => this.numListsByIdsMap.get(id) || 0,
      incrementNumListsById: (id: string) => this.numListsByIdsMap.set(id, (this.numListsByIdsMap.get(id) || 0) + 1),
      decrementNumListsById: (id: string) => this.numListsByIdsMap.set(id, (this.numListsByIdsMap.get(id) || 0) - 1),
    };
  }

  /**
   * Layout document with all element types
   * Uses two-pass layout: first pass collects floating regions on canvas, second pass layouts all elements
   */
  layoutDocument(document: Document): {
    pages: Page[];
    pageConfig: PageConfig;
  } {
    // Use document's page config if provided
    if (document.pageConfig) {
      this.pageLayout = new PageLayoutManager(document.pageConfig);
    }
    
    this.globalFloatingRegions = [];
    this.numListsByIdsMap.clear();

    // First pass: collect all floating regions on canvas (not tied to pages)
    // this.collectFloatingRegions(document.elements);

    // Second pass: layout all elements with floating regions known
    for (const element of document.elements) {
      this.layoutElement(element);
    }

    return {
      pages: this.pageLayout.getAllPages(),
      pageConfig: this.pageLayout.getPageConfig()
    };
  }

  /**
   * Layout paragraphs (backward compatibility)
   */
  layoutParagraphs(paragraphs: any[]): {
    pages: Page[];
    pageConfig: PageConfig;
  } {
    // Convert paragraphs to document elements for backward compatibility
    const elements: DocumentElement[] = paragraphs.map((p, index) => ({
      id: p.id || `p-${index}`,
      type: 'paragraph' as const,
      text: p.text,
      font: p.font,
      spacing: p.spacing,
      alignment: p.alignment
    }));

    return this.layoutDocument({
      elements,
      pageConfig: this.pageLayout.getPageConfig()
    });
  }

  private branchLayoutInterface(layoutInterface: ElementHandlerLayoutInterface, layoutManager: ILayoutManager): ElementHandlerLayoutInterface {
    let branchLayoutInterface: ElementHandlerLayoutInterface = layoutInterface;
    return branchLayoutInterface ={
      ...this.layoutInterface,
      pageLayout: layoutManager,
      layoutChild: (childElement: DocumentElement, nextBranchLayoutManager?: ILayoutManager): LaidOutRegion[] => {
        return this.layoutElementInternal(
          nextBranchLayoutManager ? this.branchLayoutInterface(branchLayoutInterface, nextBranchLayoutManager) : branchLayoutInterface,
          childElement
        );
      }
    };
  }

  /**
   * Layout a single document element (may span multiple pages)
   * Element handler is responsible for layout decisions, including children
   * - Paragraph: inline layout for runs/children
   * - Other elements: block layout for children
   */
  private layoutElement(element: DocumentElement): void {
    this.layoutElementInternal(this.branchLayoutInterface(this.layoutInterface, this.pageLayout), element);
  }

  /**
   * Internal layout method that returns laid out regions
   * 
   * @param layoutInterface - Layout interface to use
   * @param element - Element to layout
   * @returns Laid out regions
   */
  private layoutElementInternal(layoutInterface: ElementHandlerLayoutInterface, element: DocumentElement): LaidOutRegion[] {
    const { pageLayout } = layoutInterface;
    const handler = this.handlerRegistry.getHandler(element);
    
    if (!handler) {
      console.warn(`No handler found for element type: ${element.type}`);
      return [];
    }

    if (handler.isFloating(element)) {
      // Register pending floating elements in the layout manager being used
      pageLayout.registerPendingFloatingElement(element);
      return [];
    }

    // Process pending floating elements in the context of current layout manager
    const pendingFloatingElements = pageLayout.getPendingFloatingElements();
    for (const pendingFloatingElement of pendingFloatingElements) {
      if (pendingFloatingElement.id === element.id) {
        continue;
      }

      const pendingFloatingElementHandler = this.handlerRegistry.getHandler(pendingFloatingElement);
      if (!pendingFloatingElementHandler) {
        continue;
      }

      pendingFloatingElementHandler.layout(
        layoutInterface,
        pendingFloatingElement,
      ).forEach(region => {
        pageLayout.registerFloatingRegion(region);
        pageLayout.addContent(region, true);
      });
    }
    pageLayout.flushPendingFloatingElements();

    return handler.layout(
      layoutInterface,
      element, 
    );
  }

  /**
   * Get text measurer (for external use)
   */
  getTextMeasurer(): TextMeasurer {
    return this.textMeasurer;
  }
}

