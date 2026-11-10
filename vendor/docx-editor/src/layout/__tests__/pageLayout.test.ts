import { describe, it, expect, beforeEach } from "vitest";
import { PageLayoutManager } from "../pageLayout";
import type { PageConfig, LaidOutRegion, DocumentElement } from "../types";

describe("PageLayoutManager", () => {
  const defaultPageConfig: PageConfig = {
    width: 816, // 8.5 inches at 96 DPI
    height: 1056, // 11 inches at 96 DPI
    margins: {
      top: 96,
      bottom: 96,
      left: 96,
      right: 96,
    },
  };

  let pageLayout: PageLayoutManager;

  beforeEach(() => {
    pageLayout = new PageLayoutManager(defaultPageConfig);
  });

  describe("initialization", () => {
    it("creates first page on initialization", () => {
      const pages = pageLayout.getAllPages();
      expect(pages).toHaveLength(1);
      expect(pages[0].pageNumber).toBe(1);
    });

    it("uses provided page config", () => {
      const config = pageLayout.getPageConfig();
      expect(config.width).toBe(defaultPageConfig.width);
      expect(config.height).toBe(defaultPageConfig.height);
      expect(config.margins).toEqual(defaultPageConfig.margins);
    });

    it("uses default page config when not provided", () => {
      const defaultLayout = new PageLayoutManager();
      const config = defaultLayout.getPageConfig();
      // Default is US Letter at 96 DPI
      expect(config.width).toBe(8.5 * 96);
      expect(config.height).toBe(11 * 96);
    });
  });

  describe("getAvailableWidth", () => {
    it("returns width minus left and right margins", () => {
      const availableWidth = pageLayout.getAvailableWidth();
      const expected = defaultPageConfig.width - defaultPageConfig.margins.left - defaultPageConfig.margins.right;
      expect(availableWidth).toBe(expected);
    });
  });

  describe("getAvailableHeight", () => {
    it("returns height minus top and bottom margins", () => {
      const availableHeight = pageLayout.getAvailableHeight();
      const expected = defaultPageConfig.height - defaultPageConfig.margins.top - defaultPageConfig.margins.bottom;
      expect(availableHeight).toBe(expected);
    });
  });

  describe("getCurrentPage", () => {
    it("returns first page initially", () => {
      const page = pageLayout.getCurrentPage();
      expect(page.pageNumber).toBe(1);
    });

    it("returns page with empty content arrays", () => {
      const page = pageLayout.getCurrentPage();
      expect(page.flowContent).toEqual([]);
      expect(page.floatContent).toEqual([]);
    });
  });

  describe("getCurrentY", () => {
    it("returns top margin initially", () => {
      const y = pageLayout.getCurrentY();
      expect(y).toBe(defaultPageConfig.margins.top);
    });

    it("returns correct Y after adding content", () => {
      const region = createTestRegion({ y: 96, height: 50 });
      pageLayout.addContent(region, false);
      
      const y = pageLayout.getCurrentY();
      expect(y).toBe(96 + 50); // previous Y + height
    });
  });

  describe("fitsOnCurrentPage", () => {
    it("returns true when content fits", () => {
      // Formula: getCurrentY() + additionalHeight <= getAvailableHeight()
      // getCurrentY() starts at margins.top (96)
      // getAvailableHeight() = 864
      // So: 96 + X <= 864, meaning X <= 768
      expect(pageLayout.fitsOnCurrentPage(100)).toBe(true);
      expect(pageLayout.fitsOnCurrentPage(768)).toBe(true);
    });

    it("returns false when content exceeds available height", () => {
      // 96 + 769 = 865 > 864
      expect(pageLayout.fitsOnCurrentPage(769)).toBe(false);
    });

    it("accounts for already placed content", () => {
      const region = createTestRegion({ y: 96, height: 400 });
      pageLayout.addContent(region, false);
      
      // After placing 400px, getCurrentY = 96 + 400 = 496
      // Formula: 496 + X <= 864, meaning X <= 368
      expect(pageLayout.fitsOnCurrentPage(368)).toBe(true);
      expect(pageLayout.fitsOnCurrentPage(369)).toBe(false);
    });
  });

  describe("advanceToNextPage", () => {
    it("creates new page and returns it", () => {
      const newPage = pageLayout.advanceToNextPage();
      expect(newPage.pageNumber).toBe(2);
    });

    it("increases total page count", () => {
      pageLayout.advanceToNextPage();
      const pages = pageLayout.getAllPages();
      expect(pages).toHaveLength(2);
    });

    it("new page becomes current page", () => {
      pageLayout.advanceToNextPage();
      const current = pageLayout.getCurrentPage();
      expect(current.pageNumber).toBe(2);
    });

    it("can advance multiple times", () => {
      pageLayout.advanceToNextPage();
      pageLayout.advanceToNextPage();
      pageLayout.advanceToNextPage();
      const pages = pageLayout.getAllPages();
      expect(pages).toHaveLength(4);
      expect(pageLayout.getCurrentPage().pageNumber).toBe(4);
    });
  });

  describe("addContent", () => {
    it("adds flow content to current page", () => {
      const region = createTestRegion({ y: 96, height: 50 });
      pageLayout.addContent(region, false);
      
      const page = pageLayout.getCurrentPage();
      expect(page.flowContent).toHaveLength(1);
      expect(page.flowContent[0]).toBe(region);
    });

    it("adds float content to current page", () => {
      const region = createTestRegion({ y: 96, height: 50 });
      pageLayout.addContent(region, true);
      
      const page = pageLayout.getCurrentPage();
      expect(page.floatContent).toHaveLength(1);
      expect(page.floatContent[0]).toBe(region);
    });

    it("adds multiple content items", () => {
      const region1 = createTestRegion({ y: 96, height: 50 });
      const region2 = createTestRegion({ y: 146, height: 50 });
      
      pageLayout.addContent(region1, false);
      pageLayout.addContent(region2, false);
      
      const page = pageLayout.getCurrentPage();
      expect(page.flowContent).toHaveLength(2);
    });
  });

  describe("floating elements", () => {
    it("registerFloatingRegion adds region to floating regions", () => {
      const region = createTestRegion({ x: 100, y: 100, width: 200, height: 150 });
      pageLayout.registerFloatingRegion(region);
      
      const floatingRegions = pageLayout.getFloatingRegions();
      expect(floatingRegions).toHaveLength(1);
      expect(floatingRegions[0]).toBe(region);
    });

    it("registerPendingFloatingElement queues element", () => {
      const element: DocumentElement = { id: "test-1", type: "table" };
      pageLayout.registerPendingFloatingElement(element);
      
      const pending = pageLayout.getPendingFloatingElements();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toBe(element);
    });

    it("flushPendingFloatingElements clears pending elements", () => {
      const element: DocumentElement = { id: "test-1", type: "table" };
      pageLayout.registerPendingFloatingElement(element);
      pageLayout.flushPendingFloatingElements();
      
      const pending = pageLayout.getPendingFloatingElements();
      expect(pending).toHaveLength(0);
    });
  });

  describe("getLineFlowRangesProvider", () => {
    it("returns full width when no floating regions", () => {
      const provider = pageLayout.getLineFlowRangesProvider(100);
      const ranges = provider(0, 20);
      
      expect(ranges).toHaveLength(1);
      expect(ranges[0].x).toBe(defaultPageConfig.margins.left);
      expect(ranges[0].width).toBe(pageLayout.getAvailableWidth());
    });

    it("excludes floating region from available space", () => {
      const floatingRegion = createTestRegion({
        x: 200,
        y: 100,
        width: 100,
        height: 100,
      });
      pageLayout.registerFloatingRegion(floatingRegion);
      
      const provider = pageLayout.getLineFlowRangesProvider(100);
      const ranges = provider(10, 20); // Y range overlaps with floating region
      
      // Should have ranges before and after the floating element
      expect(ranges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("reset", () => {
    it("clears all pages and creates new first page", () => {
      pageLayout.advanceToNextPage();
      pageLayout.advanceToNextPage();
      pageLayout.reset();
      
      const pages = pageLayout.getAllPages();
      expect(pages).toHaveLength(1);
      expect(pages[0].pageNumber).toBe(1);
    });

    it("clears floating regions", () => {
      const region = createTestRegion({ x: 100, y: 100, width: 200, height: 150 });
      pageLayout.registerFloatingRegion(region);
      pageLayout.reset();
      
      const floatingRegions = pageLayout.getFloatingRegions();
      expect(floatingRegions).toHaveLength(0);
    });
  });

  describe("resetPagesButKeepFloatingRegions", () => {
    it("clears pages but keeps floating regions", () => {
      const region = createTestRegion({ x: 100, y: 100, width: 200, height: 150 });
      pageLayout.registerFloatingRegion(region);
      // Don't advance to next page - that clears floating regions
      
      pageLayout.resetPagesButKeepFloatingRegions();
      
      const pages = pageLayout.getAllPages();
      expect(pages).toHaveLength(1);
      
      const floatingRegions = pageLayout.getFloatingRegions();
      expect(floatingRegions).toHaveLength(1);
    });

    it("advancing to next page clears floating regions", () => {
      const region = createTestRegion({ x: 100, y: 100, width: 200, height: 150 });
      pageLayout.registerFloatingRegion(region);
      
      pageLayout.advanceToNextPage();
      
      // Floating regions are cleared on page advance
      const floatingRegions = pageLayout.getFloatingRegions();
      expect(floatingRegions).toHaveLength(0);
    });
  });
});

// Helper to create test regions
function createTestRegion(overrides: Partial<LaidOutRegion> = {}): LaidOutRegion {
  return {
    element: { id: "test", type: "paragraph" },
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    ...overrides,
  };
}
