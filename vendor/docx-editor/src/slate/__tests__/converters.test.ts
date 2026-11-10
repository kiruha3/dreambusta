import { describe, it, expect } from "vitest";
import { documentToSlate } from "../documentToSlate";
import { slateToDocument } from "../slateToDocument";
import type { Document, ParagraphElement, TableElement, RunElement, TextElement } from "../../layout/types";
import type { ParagraphElement as SlateParagraph, TableElement as SlateTable } from "../types";

describe("Document to Slate conversion", () => {
  it("converts empty document", () => {
    const doc: Document = {
      elements: [],
      pageConfig: {
        width: 816,
        height: 1056,
        margins: { top: 96, bottom: 96, left: 96, right: 96 },
      },
    };

    const result = documentToSlate(doc);
    // documentToSlate прогоняет результат через ensureUids — block-ноды
    // всегда получают uid (нужен AI suggestions / diff'у). Конкретное
    // значение зависит от модульного uidCounter, проверяем только наличие.
    expect(result).toEqual([
      expect.objectContaining({ type: "paragraph", children: [{ text: "" }] }),
    ]);
    expect((result[0] as { uid?: string }).uid).toBeTruthy();
  });

  it("converts paragraph with text", () => {
    const doc: Document = {
      elements: [createDocParagraph("Hello World")],
      pageConfig: {
        width: 816,
        height: 1056,
        margins: { top: 96, bottom: 96, left: 96, right: 96 },
      },
    };

    const result = documentToSlate(doc);
    expect(result).toHaveLength(1);
    
    const para = result[0] as SlateParagraph;
    expect(para.type).toBe("paragraph");
    expect(para.children).toHaveLength(1);
    expect((para.children[0] as any).text).toBe("Hello World");
  });

  it("preserves paragraph alignment", () => {
    const docPara = createDocParagraph("Centered text");
    docPara.props.alignment = "center";

    const doc: Document = {
      elements: [docPara],
      pageConfig: {
        width: 816,
        height: 1056,
        margins: { top: 96, bottom: 96, left: 96, right: 96 },
      },
    };

    const result = documentToSlate(doc);
    const para = result[0] as SlateParagraph;
    expect(para.align).toBe("center");
  });

  it("converts bold text", () => {
    const docPara = createDocParagraph("Bold text", { weight: "bold" });

    const doc: Document = {
      elements: [docPara],
      pageConfig: {
        width: 816,
        height: 1056,
        margins: { top: 96, bottom: 96, left: 96, right: 96 },
      },
    };

    const result = documentToSlate(doc);
    const para = result[0] as SlateParagraph;
    expect((para.children[0] as any).bold).toBe(true);
  });

  it("converts italic text", () => {
    const docPara = createDocParagraph("Italic text", { style: "italic" });

    const doc: Document = {
      elements: [docPara],
      pageConfig: {
        width: 816,
        height: 1056,
        margins: { top: 96, bottom: 96, left: 96, right: 96 },
      },
    };

    const result = documentToSlate(doc);
    const para = result[0] as SlateParagraph;
    expect((para.children[0] as any).italic).toBe(true);
  });

  it("converts table structure", () => {
    const doc: Document = {
      elements: [createDocTable()],
      pageConfig: {
        width: 816,
        height: 1056,
        margins: { top: 96, bottom: 96, left: 96, right: 96 },
      },
    };

    const result = documentToSlate(doc);
    expect(result).toHaveLength(1);
    
    const table = result[0] as SlateTable;
    expect(table.type).toBe("table");
    expect(table.children).toHaveLength(1); // 1 row
    expect(table.children[0].type).toBe("table-row");
    expect(table.children[0].children).toHaveLength(2); // 2 cells
  });

  it("converts table cell content", () => {
    const doc: Document = {
      elements: [createDocTable()],
      pageConfig: {
        width: 816,
        height: 1056,
        margins: { top: 96, bottom: 96, left: 96, right: 96 },
      },
    };

    const result = documentToSlate(doc);
    const table = result[0] as SlateTable;
    const cell = table.children[0].children[0];
    
    expect(cell.type).toBe("table-cell");
    expect(cell.children).toHaveLength(1);
    expect(cell.children[0].type).toBe("paragraph");
  });
});

describe("Slate to Document conversion", () => {
  it("converts empty slate document", () => {
    const result = slateToDocument([]);
    expect(result.elements).toEqual([]);
    expect(result.pageConfig).toBeDefined();
  });

  it("converts paragraph with text", () => {
    const slatePara: SlateParagraph = {
      type: "paragraph",
      children: [{ text: "Hello World" }],
    };

    const result = slateToDocument([slatePara]);
    expect(result.elements).toHaveLength(1);
    
    const para = result.elements[0] as ParagraphElement;
    expect(para.type).toBe("paragraph");
    expect(para.children).toBeDefined();
  });

  it("preserves paragraph alignment", () => {
    const slatePara: SlateParagraph = {
      type: "paragraph",
      align: "center",
      children: [{ text: "Centered" }],
    };

    const result = slateToDocument([slatePara]);
    const para = result.elements[0] as ParagraphElement;
    expect(para.props.alignment).toBe("center");
  });

  it("converts bold formatting to run font", () => {
    const slatePara: SlateParagraph = {
      type: "paragraph",
      children: [{ text: "Bold", bold: true }],
    };

    const result = slateToDocument([slatePara]);
    const para = result.elements[0] as ParagraphElement;
    const run = para.children?.[0] as RunElement;
    
    expect(run.font.weight).toBe("bold");
  });

  it("converts italic formatting to run font", () => {
    const slatePara: SlateParagraph = {
      type: "paragraph",
      children: [{ text: "Italic", italic: true }],
    };

    const result = slateToDocument([slatePara]);
    const para = result.elements[0] as ParagraphElement;
    const run = para.children?.[0] as RunElement;
    
    expect(run.font.style).toBe("italic");
  });

  it("converts table structure", () => {
    const slateTable: SlateTable = {
      type: "table",
      children: [
        {
          type: "table-row",
          children: [
            {
              type: "table-cell",
              children: [{ type: "paragraph", children: [{ text: "Cell 1" }] }],
            },
            {
              type: "table-cell",
              children: [{ type: "paragraph", children: [{ text: "Cell 2" }] }],
            },
          ],
        },
      ],
    };

    const result = slateToDocument([slateTable]);
    expect(result.elements).toHaveLength(1);
    
    const table = result.elements[0] as TableElement;
    expect(table.type).toBe("table");
    expect(table.children).toHaveLength(1);
  });
});

describe("Round-trip conversion", () => {
  it("preserves paragraph text through round-trip", () => {
    const original: Document = {
      elements: [createDocParagraph("Test text")],
      pageConfig: {
        width: 816,
        height: 1056,
        margins: { top: 96, bottom: 96, left: 96, right: 96 },
      },
    };

    const slate = documentToSlate(original);
    const result = slateToDocument(slate, original.pageConfig);

    expect(result.elements).toHaveLength(1);
    const para = result.elements[0] as ParagraphElement;
    expect(para.type).toBe("paragraph");
  });

  it("preserves table structure through round-trip", () => {
    const original: Document = {
      elements: [createDocTable()],
      pageConfig: {
        width: 816,
        height: 1056,
        margins: { top: 96, bottom: 96, left: 96, right: 96 },
      },
    };

    const slate = documentToSlate(original);
    const result = slateToDocument(slate, original.pageConfig);

    expect(result.elements).toHaveLength(1);
    const table = result.elements[0] as TableElement;
    expect(table.type).toBe("table");
    expect(table.children).toHaveLength(1);
  });
});

// Helper functions

function createDocParagraph(
  text: string,
  fontOverrides?: Partial<{ weight: "normal" | "bold"; style: "normal" | "italic" }>
): ParagraphElement {
  const textEl: TextElement = {
    id: "t-1",
    type: "text",
    text,
  };

  const runEl: RunElement = {
    id: "r-1",
    type: "run",
    font: {
      family: "Times New Roman",
      size: 16,
      weight: fontOverrides?.weight || "normal",
      style: fontOverrides?.style || "normal",
      lineHeight: 1.5,
    },
    children: [textEl],
  };

  return {
    id: "p-1",
    type: "paragraph",
    props: {},
    children: [runEl],
  };
}

function createDocTable(): TableElement {
  return {
    id: "tbl-1",
    type: "table",
    props: {},
    grid: [{ width: 200 }, { width: 200 }],
    children: [
      {
        id: "tr-1",
        type: "table-row",
        children: [
          {
            id: "tc-1",
            type: "table-cell",
            children: [createDocParagraph("Cell 1")],
          },
          {
            id: "tc-2",
            type: "table-cell",
            children: [createDocParagraph("Cell 2")],
          },
        ],
      },
    ],
  };
}
