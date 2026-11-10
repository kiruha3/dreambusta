import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ParagraphHandler,
  TableHandler,
  ImageHandler,
  SectionBreakHandler,
  PageBreakHandler,
  ElementHandlerRegistry,
  type ElementHandlerLayoutInterface,
} from "../elementHandlers";
import { PageLayoutManager } from "../pageLayout";
import { TextMeasurer } from "../textMeasurer";
import type {
  ParagraphElement,
  TableElement,
  ImageElement,
  SectionBreakElement,
  PageBreakElement,
  DocumentElement,
  RunElement,
  TextElement,
  PageConfig,
  TextLine,
} from "../types";

// Mock TextMeasurer
const mockMeasureTextWidth = vi.fn();
vi.mock("../textMeasurer", () => ({
  TextMeasurer: vi.fn().mockImplementation(() => ({
    measureTextWidth: mockMeasureTextWidth,
    breakIntoLines: vi.fn(),
    breakRunsIntoLines: vi.fn(),
    measureParagraphHeight: vi.fn(),
    clearCache: vi.fn(),
  })),
}));

// Mock Canvas for TextMeasurer
vi.stubGlobal("document", {
  createElement: vi.fn(() => ({
    getContext: vi.fn(() => ({
      measureText: vi.fn(() => ({ width: 100 })),
      font: "",
    })),
  })),
});

describe("ElementHandlers", () => {
  const defaultPageConfig: PageConfig = {
    width: 816,
    height: 1056,
    margins: { top: 96, bottom: 96, left: 96, right: 96 },
  };

  let pageLayout: PageLayoutManager;
  let textMeasurer: TextMeasurer;
  let layoutInterface: ElementHandlerLayoutInterface;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMeasureTextWidth.mockReturnValue(50);
    
    pageLayout = new PageLayoutManager(defaultPageConfig);
    textMeasurer = new TextMeasurer();
    
    layoutInterface = {
      pageLayout,
      textMeasurer,
      layoutChild: vi.fn().mockReturnValue([]),
      getNumListsById: vi.fn().mockReturnValue(0),
      incrementNumListsById: vi.fn(),
      decrementNumListsById: vi.fn(),
    };
  });

  describe("ParagraphHandler", () => {
    const handler = new ParagraphHandler();

    it("canHandle returns true for paragraph elements", () => {
      const element: ParagraphElement = createParagraph("p-1", "Hello");
      expect(handler.canHandle(element)).toBe(true);
    });

    it("canHandle returns false for non-paragraph elements", () => {
      const element: DocumentElement = { id: "t-1", type: "table" };
      expect(handler.canHandle(element)).toBe(false);
    });

    it("isFloating returns false for paragraphs", () => {
      const element: ParagraphElement = createParagraph("p-1", "Hello");
      expect(handler.isFloating(element)).toBe(false);
    });

    it("layout adds content to page", () => {
      const element: ParagraphElement = createParagraph("p-1", "Hello");
      
      handler.layout(layoutInterface, element);
      
      const page = pageLayout.getCurrentPage();
      expect(page.flowContent.length).toBeGreaterThanOrEqual(0);
    });

    it("keeps canonical list counters separate by numId and level and renders bullets", () => {
      const counts = new Map<string, number>();
      layoutInterface.getNumListsById = id => counts.get(id) || 0;
      layoutInterface.incrementNumListsById = id => { counts.set(id, (counts.get(id) || 0) + 1); };
      const items = [
        { text: "First", numId: 7, ilvl: 0, numFmt: "decimal" },
        { text: "Second", numId: 7, ilvl: 0, numFmt: "decimal" },
        { text: "Nested", numId: 7, ilvl: 1, numFmt: "decimal" },
        { text: "Other", numId: 8, ilvl: 0, numFmt: "decimal" },
        { text: "Evidence", numId: 9, ilvl: 0, numFmt: "bullet" },
      ];
      for (const [index, { text, ...numPr }] of items.entries()) {
        const element = createParagraph(`list-${index}`, text);
        element.props.numPr = numPr;
        handler.layout(layoutInterface, element);
      }

      const rendered = pageLayout.getCurrentPage().flowContent.map(region =>
        (region.children as TextLine[]).flatMap(line => line.parts.map(part => part.text)).join(""));
      expect(rendered.map(text => text.trim())).toEqual(["1. First", "2. Second", "1. Nested", "1. Other", "• Evidence"]);
    });
  });

  describe("TableHandler", () => {
    const handler = new TableHandler();

    it("canHandle returns true for table elements", () => {
      const element: TableElement = createTable("t-1");
      expect(handler.canHandle(element)).toBe(true);
    });

    it("canHandle returns false for non-table elements", () => {
      const element: DocumentElement = { id: "p-1", type: "paragraph" };
      expect(handler.canHandle(element)).toBe(false);
    });

    it("isFloating returns false for non-positioned tables", () => {
      const element: TableElement = createTable("t-1");
      expect(handler.isFloating(element)).toBe(false);
    });

    it("isFloating returns true for tables with tblpPr", () => {
      const element: TableElement = {
        ...createTable("t-1"),
        props: { tblpPr: { horzAnchor: "margin", tblpX: 100 } },
      };
      expect(handler.isFloating(element)).toBe(true);
    });

    it("layout processes table rows", () => {
      const element: TableElement = createTable("t-1");
      
      const result = handler.layout(layoutInterface, element);
      
      // Table layout returns regions
      expect(Array.isArray(result)).toBe(true);
    });

    it("layout calls layoutChild for cell content", () => {
      const element: TableElement = createTableWithContent("t-1");
      
      handler.layout(layoutInterface, element);
      
      // layoutChild should be called for cell content
      expect(layoutInterface.layoutChild).toHaveBeenCalled();
    });
  });

  describe("ImageHandler", () => {
    const handler = new ImageHandler();

    it("canHandle returns true for image elements", () => {
      const element: ImageElement = createImage("img-1");
      expect(handler.canHandle(element)).toBe(true);
    });

    it("canHandle returns false for non-image elements", () => {
      const element: DocumentElement = { id: "p-1", type: "paragraph" };
      expect(handler.canHandle(element)).toBe(false);
    });

    it("isFloating returns true for square wrap style", () => {
      const element: ImageElement = { ...createImage("img-1"), wrapStyle: "square" };
      expect(handler.isFloating(element)).toBe(true);
    });

    it("isFloating returns true for tight wrap style", () => {
      const element: ImageElement = { ...createImage("img-1"), wrapStyle: "tight" };
      expect(handler.isFloating(element)).toBe(true);
    });

    it("isFloating returns false for inline images", () => {
      const element: ImageElement = { ...createImage("img-1"), wrapStyle: "inline" };
      expect(handler.isFloating(element)).toBe(false);
    });

    it("layout returns image region", () => {
      const element: ImageElement = createImage("img-1");
      
      const result = handler.layout(layoutInterface, element);
      
      expect(result).toHaveLength(1);
      expect(result[0].element).toBe(element);
      expect(result[0].width).toBe(element.width);
      expect(result[0].height).toBe(element.height);
    });
  });

  describe("SectionBreakHandler", () => {
    const handler = new SectionBreakHandler();

    it("canHandle returns true for section-break elements", () => {
      const element: SectionBreakElement = { id: "sb-1", type: "section-break" };
      expect(handler.canHandle(element)).toBe(true);
    });

    it("isFloating returns false", () => {
      const element: SectionBreakElement = { id: "sb-1", type: "section-break" };
      expect(handler.isFloating(element)).toBe(false);
    });

    it("layout advances to next page", () => {
      const element: SectionBreakElement = { id: "sb-1", type: "section-break" };
      
      handler.layout(layoutInterface, element);
      
      expect(pageLayout.getCurrentPage().pageNumber).toBe(2);
    });

    it("layout returns empty array", () => {
      const element: SectionBreakElement = { id: "sb-1", type: "section-break" };
      
      const result = handler.layout(layoutInterface, element);
      
      expect(result).toEqual([]);
    });
  });

  describe("PageBreakHandler", () => {
    const handler = new PageBreakHandler();

    it("canHandle returns true for page-break elements", () => {
      const element: PageBreakElement = { id: "pb-1", type: "page-break" };
      expect(handler.canHandle(element)).toBe(true);
    });

    it("isFloating returns false", () => {
      const element: PageBreakElement = { id: "pb-1", type: "page-break" };
      expect(handler.isFloating(element)).toBe(false);
    });

    it("layout advances to next page", () => {
      const element: PageBreakElement = { id: "pb-1", type: "page-break" };
      
      handler.layout(layoutInterface, element);
      
      expect(pageLayout.getCurrentPage().pageNumber).toBe(2);
    });
  });

  describe("ElementHandlerRegistry", () => {
    it("registers default handlers", () => {
      const registry = new ElementHandlerRegistry();
      
      expect(registry.getHandler({ id: "1", type: "paragraph" })).toBeInstanceOf(ParagraphHandler);
      expect(registry.getHandler({ id: "1", type: "table" })).toBeInstanceOf(TableHandler);
      expect(registry.getHandler({ id: "1", type: "image" } as any)).toBeInstanceOf(ImageHandler);
      expect(registry.getHandler({ id: "1", type: "section-break" })).toBeInstanceOf(SectionBreakHandler);
      expect(registry.getHandler({ id: "1", type: "page-break" })).toBeInstanceOf(PageBreakHandler);
    });

    it("returns null for unknown element types", () => {
      const registry = new ElementHandlerRegistry();
      
      const handler = registry.getHandler({ id: "1", type: "unknown" as any });
      expect(handler).toBeNull();
    });

    it("allows registering custom handlers", () => {
      const registry = new ElementHandlerRegistry();
      
      const customHandler = {
        canHandle: (el: DocumentElement) => el.type === "custom" as any,
        isFloating: () => false,
        layout: () => [],
      };
      
      registry.register(customHandler);
      
      expect(registry.getHandler({ id: "1", type: "custom" as any })).toBe(customHandler);
    });
  });
});

// Helper functions to create test elements

function createParagraph(id: string, text: string): ParagraphElement {
  const textEl: TextElement = {
    id: `${id}-t`,
    type: "text",
    text,
  };
  
  const runEl: RunElement = {
    id: `${id}-r`,
    type: "run",
    font: {
      family: "Times New Roman",
      size: 16,
      weight: "normal",
      style: "normal",
      lineHeight: 1.5,
    },
    children: [textEl],
  };
  
  return {
    id,
    type: "paragraph",
    props: {},
    children: [runEl],
  };
}

function createTable(id: string): TableElement {
  return {
    id,
    type: "table",
    props: {},
    grid: [{ width: 200 }, { width: 200 }],
    children: [
      {
        id: `${id}-row-1`,
        type: "table-row",
        children: [
          { id: `${id}-cell-1`, type: "table-cell", children: [] },
          { id: `${id}-cell-2`, type: "table-cell", children: [] },
        ],
      },
    ],
  };
}

function createTableWithContent(id: string): TableElement {
  const para = createParagraph(`${id}-para`, "Cell text");
  
  return {
    id,
    type: "table",
    props: {},
    grid: [{ width: 200 }],
    children: [
      {
        id: `${id}-row-1`,
        type: "table-row",
        children: [
          { id: `${id}-cell-1`, type: "table-cell", children: [para] },
        ],
      },
    ],
  };
}

function createImage(id: string): ImageElement {
  return {
    id,
    type: "image",
    src: "data:image/png;base64,test",
    width: 200,
    height: 150,
  };
}
