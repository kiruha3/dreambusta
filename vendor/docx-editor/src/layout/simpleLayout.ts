// Simple non-paged layout manager for floating elements

import { ILayoutManager } from './pageLayout';
import type { PageConfig, LaidOutRegion, Page, LineFlowRangesProvider, DocumentElement } from './types';
import { UnitConverter } from './unitConverter';

/**
 * Simple layout manager without pages for floating elements
 * Provides basic layout interface without page management
 */
export class SimpleLayoutManager implements ILayoutManager {
  private pageConfig: PageConfig;

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
  }
  registerPendingFloatingElement(_element: DocumentElement): void {
    // No-op for simple layout - floating elements are not supported
  }
  getPendingFloatingElements(): readonly DocumentElement[] {
    // No floating elements in simple layout
    return [];
  }
  flushPendingFloatingElements(): void {
    // No-op for simple layout
  }
  registerFloatingRegion(_region: LaidOutRegion): void {
    // No-op for simple layout - floating regions are not supported
  }
  getFloatingRegions(): readonly LaidOutRegion[] {
    // No floating regions in simple layout
    return [];
  }
  getAllPages(): Page[] {
    throw new Error('Method not implemented.');
  }
  reset(): void {
    throw new Error('Method not implemented.');
  }
  resetPagesButKeepFloatingRegions(): void {
    throw new Error('Method not implemented.');
  }

  /**
   * Get available content height (unlimited for non-paged layout)
   */
  getAvailableHeight(): number {
    return Number.MAX_SAFE_INTEGER;
  }

  /**
   * Get available content width
   */
  getAvailableWidth(): number {
    return this.pageConfig.width - 
           this.pageConfig.margins.left - 
           this.pageConfig.margins.right;
  }

  /**
   * Get page config
   */
  getPageConfig(): PageConfig {
    return this.pageConfig;
  }

  /**
   * Get current page (returns dummy page for compatibility)
   */
  getCurrentPage(): Page {
    return {
      pageNumber: 1,
      flowContent: [],
      floatContent: []
    };
  }

  /**
   * Get current Y position
   */
  getCurrentY(): number {
    return 0;
  }

  fitsOnCurrentPage(_requiredHeight: number): boolean {
    return true;
  }

  /**
   * Add content (no-op for simple layout, just updates Y)
   */
  addContent(_region: LaidOutRegion, _floating: boolean): void {
  }

  /**
   * Advance to next page (no-op for simple layout)
   */
  advanceToNextPage(): Page {
    // No-op for non-paged layout
    return {
      pageNumber: 1,
      flowContent: [],
      floatContent: []
    };
  }

  /**
   * Get available width provider (returns full width, no floating elements)
   */
  getLineFlowRangesProvider(_startY: number): LineFlowRangesProvider {
    const fullWidth = this.getAvailableWidth();
    const leftMargin = this.pageConfig.margins.left;
    
    return (_y: number, _height: number) => {
      return [{
        x: leftMargin,
        width: fullWidth
      }];
    };
  }
}

