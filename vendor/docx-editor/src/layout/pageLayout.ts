// Page layout manager

import type { PageConfig, Page, LaidOutRegion, LineFlowRangesProvider, FlowRange, DocumentElement } from './types';
import { UnitConverter } from './unitConverter';

/**
 * Interface for layout managers (both paged and non-paged)
 */
export interface ILayoutManager {
  getPageConfig(): PageConfig;
  getCurrentPage(): Page;
  getAvailableWidth(): number;
  getAvailableHeight(): number;
  getCurrentY(): number;
  getLineFlowRangesProvider(startY: number): LineFlowRangesProvider;
  registerPendingFloatingElement(element: DocumentElement): void;
  getPendingFloatingElements(): readonly DocumentElement[];
  flushPendingFloatingElements(): void;
  registerFloatingRegion(region: LaidOutRegion): void;
  getFloatingRegions(): readonly LaidOutRegion[];
  fitsOnCurrentPage(requiredHeight: number): boolean;
  advanceToNextPage(): Page;
  addContent(content: LaidOutRegion, floating: boolean): void;
  getAllPages(): Page[];
  reset(): void;
  resetPagesButKeepFloatingRegions(): void;
}

export class PageLayoutManager implements ILayoutManager {
  private pageConfig: PageConfig;
  private currentPage: number = 1;
  private pages: Page[] = [];
  private pendingFloatingElements: DocumentElement[] = [];
  private floatingRegions: LaidOutRegion[] = [];

  constructor(pageConfig?: Partial<PageConfig>) {
    if (pageConfig) {
      this.pageConfig = pageConfig as PageConfig;
    } else {
      // Default to US Letter
      const defaultSize = UnitConverter.getDefaultPageSize();
      const defaultMargins = UnitConverter.getDefaultMargins();
      
      this.pageConfig = {
        width: defaultSize.width,
        height: defaultSize.height,
        margins: defaultMargins
      };
    }

    // Initialize first page
    this.createNewPage();
  }

  /**
   * Get available content height for current page
   */
  getAvailableHeight(): number {
    return this.pageConfig.height - 
           this.pageConfig.margins.top - 
           this.pageConfig.margins.bottom;
  }

  /**
   * Get available content width (without floating elements)
   */
  getAvailableWidth(): number {
    return this.pageConfig.width - 
           this.pageConfig.margins.left - 
           this.pageConfig.margins.right;
  }

  getLineFlowRangesProvider(startY: number): LineFlowRangesProvider {
    const fullWidth = this.getAvailableWidth();
    const leftMargin = this.pageConfig.margins.left;
    const contentLeft = leftMargin;
    const contentRight = leftMargin + fullWidth;
    const floatingRegions = this.floatingRegions;

    return (y: number, height: number): FlowRange[] => {
      // Y is relative to page content area (after margins)
      const elementPageRelativeYStart = startY + y;
      const elementPageRelativeYEnd = elementPageRelativeYStart + height;
      
      // Collect all global regions that overlap the Y range and are on this page
      const overlappingRegions: LaidOutRegion[] = [];
      for (const floatingRegion of floatingRegions) {
        
        // Convert region Y from anchor-relative to page-relative
        // Region Y is relative to anchor element's Y position on its page
        const regionTop = floatingRegion.y;
        const regionBottom = regionTop + floatingRegion.height;
        
        // Check if region overlaps with the Y range (in page-relative coordinates)
        if (regionBottom > elementPageRelativeYStart && regionTop < elementPageRelativeYEnd) {
          overlappingRegions.push(floatingRegion);
        }
      }
      
      if (overlappingRegions.length === 0) {
        // No floating elements - one range covering full width
        return [{
          x: contentLeft,
          width: fullWidth
        }];
      }
      
      // Sort regions by x position (left to right)
      const sortedRegions = [...overlappingRegions].sort((a, b) => a.x - b.x);
      
      const flowRanges: FlowRange[] = [];
      
      // Range before first floating region
      if (sortedRegions.length > 0) {
        const firstRegionLeft = sortedRegions[0].x;
        const rangeBeforeFirst = firstRegionLeft - contentLeft;
        if (rangeBeforeFirst > 0) {
          flowRanges.push({
            x: contentLeft,
            width: rangeBeforeFirst
          });
        }
      }
      
      // Ranges between floating regions
      for (let i = 0; i < sortedRegions.length - 1; i++) {
        const currentRegionRight = sortedRegions[i].x + sortedRegions[i].width;
        const nextRegionLeft = sortedRegions[i + 1].x;
        const rangeBetween = nextRegionLeft - currentRegionRight;
        if (rangeBetween > 0) {
          flowRanges.push({
            x: currentRegionRight,
            width: rangeBetween
          });
        }
      }
      
      // Range after last floating region
      if (sortedRegions.length > 0) {
        const lastRegionRight = sortedRegions[sortedRegions.length - 1].x + 
                                sortedRegions[sortedRegions.length - 1].width;
        const rangeAfterLast = contentRight - lastRegionRight;
        if (rangeAfterLast > 0) {
          flowRanges.push({
            x: lastRegionRight,
            width: rangeAfterLast
          });
        }
      }
      
      return flowRanges;
    };
  }

  registerPendingFloatingElement(element: DocumentElement): void {
    this.pendingFloatingElements.push(element);
  }

  getPendingFloatingElements(): readonly DocumentElement[] {
    return this.pendingFloatingElements;
  }

  flushPendingFloatingElements(): void {
    this.pendingFloatingElements = [];
  }

  registerFloatingRegion(region: LaidOutRegion): void {
    this.floatingRegions.push(region);
  }

  flushFloatingRegions(): void {
    this.floatingRegions = [];
  }

  /**
   * Get all floating regions for a page
   */
  getFloatingRegions(): readonly LaidOutRegion[] {
    return this.floatingRegions;
  }

  /**
   * Get current page
   */
  getCurrentPage(): Page {
    return this.pages[this.currentPage - 1];
  }

  /**
   * Check if content fits on current page
   */
  fitsOnCurrentPage(additionalHeight: number): boolean {
    return this.getCurrentY() + additionalHeight <= 
           this.getAvailableHeight();
  }

  /**
   * Advance to next page
   */
  advanceToNextPage(): Page {
    this.currentPage++;
    
    // Create new page if needed
    if (this.currentPage > this.pages.length) {
      this.createNewPage();
      this.flushPendingFloatingElements();
      this.flushFloatingRegions();
    }
    
    return this.getCurrentPage();
  }

  /**
   * Create a new page
   */
  private createNewPage(): Page {
    const page: Page = {
      pageNumber: this.pages.length + 1,
      floatContent: [],
      flowContent: [],
    };

    this.pages.push(page);
    return page;
  }

  /**
   * Add content to current page
   */
  addContent(content: LaidOutRegion, floating: boolean): void {
    const currentPage = this.getCurrentPage();
    if (floating) {
      currentPage.floatContent.push(content);
    } else {
      currentPage.flowContent.push(content);
    }
  }

  getCurrentY(): number {
    const { flowContent } = this.getCurrentPage();
    if (!flowContent.length) {
      return this.pageConfig.margins.top;
    }

    const lastRegion = flowContent[flowContent.length - 1];
    return lastRegion.y + lastRegion.height;
  }

  /**
   * Get all pages
   */
  getAllPages(): Page[] {
    return this.pages;
  }

  /**
   * Get page configuration
   */
  getPageConfig(): PageConfig {
    return this.pageConfig;
  }

  /**
   * Reset layout (start over)
   */
  reset(): void {
    this.currentPage = 1;
    this.pages = [];
    this.floatingRegions = [];
    this.createNewPage();
  }

  /**
   * Reset pages but keep floating regions
   * Used for two-pass layout: first pass collects regions, second pass layouts content
   */
  resetPagesButKeepFloatingRegions(): void {
    this.currentPage = 1;
    this.pages = [];
    // Keep floatingRegions - don't clear them
    this.createNewPage();
  }
}

