import { describe, it, expect, beforeEach, vi } from "vitest";
import { DocxXmlParser, parseDocxXml } from "../docxXmlParser";

// Sample DOCX XML content
const SAMPLE_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="24"/>
        </w:rPr>
        <w:t>Hello World</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Second paragraph</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const SAMPLE_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr>
      <w:spacing w:after="160"/>
    </w:pPr>
  </w:style>
</w:styles>`;

const SAMPLE_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const TABLE_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="5000" w:type="pct"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="2880"/>
        <w:gridCol w:w="2880"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:p>
            <w:r>
              <w:t>Cell 1</w:t>
            </w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:p>
            <w:r>
              <w:t>Cell 2</w:t>
            </w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

// Mock JSZip
const createMockZip = (files: Record<string, string>) => {
  return {
    file: (path: string) => {
      const content = files[path];
      if (content) {
        return {
          async: () => Promise.resolve(content),
        };
      }
      return null;
    },
  };
};

// Mock JSZip.loadAsync
vi.mock("jszip", () => ({
  default: {
    loadAsync: vi.fn(),
  },
}));

import JSZip from "jszip";

describe("DocxXmlParser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parse", () => {
    it("parses document with paragraphs", async () => {
      const mockZip = createMockZip({
        "word/document.xml": SAMPLE_DOCUMENT_XML,
        "word/styles.xml": SAMPLE_STYLES_XML,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      expect(result.elements).toHaveLength(2);
      expect(result.elements[0].type).toBe("paragraph");
      expect(result.elements[1].type).toBe("paragraph");
    });

    it("extracts page config from sectPr", async () => {
      const mockZip = createMockZip({
        "word/document.xml": SAMPLE_DOCUMENT_XML,
        "word/styles.xml": SAMPLE_STYLES_XML,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      // 12240 twips = 8.5 inches = 816 pixels at 96 DPI
      expect(result.pageConfig.width).toBeCloseTo(816, 0);
      // 15840 twips = 11 inches = 1056 pixels at 96 DPI
      expect(result.pageConfig.height).toBeCloseTo(1056, 0);
      // 1440 twips = 1 inch = 96 pixels at 96 DPI
      expect(result.pageConfig.margins.top).toBeCloseTo(96, 0);
      expect(result.pageConfig.margins.left).toBeCloseTo(96, 0);
    });

    it("parses paragraph alignment", async () => {
      const mockZip = createMockZip({
        "word/document.xml": SAMPLE_DOCUMENT_XML,
        "word/styles.xml": SAMPLE_STYLES_XML,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      const firstParagraph = result.elements[0] as any;
      expect(firstParagraph.props.jc?.val).toBe("center");
    });

    it("parses text runs with formatting", async () => {
      const mockZip = createMockZip({
        "word/document.xml": SAMPLE_DOCUMENT_XML,
        "word/styles.xml": SAMPLE_STYLES_XML,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      const firstParagraph = result.elements[0] as any;
      expect(firstParagraph.children).toBeDefined();
      expect(firstParagraph.children.length).toBeGreaterThan(0);

      const firstRun = firstParagraph.children[0];
      expect(firstRun.type).toBe("run");
      expect(firstRun.font.weight).toBe("bold");
    });

    it("parses text content", async () => {
      const mockZip = createMockZip({
        "word/document.xml": SAMPLE_DOCUMENT_XML,
        "word/styles.xml": SAMPLE_STYLES_XML,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      const firstParagraph = result.elements[0] as any;
      const firstRun = firstParagraph.children[0];
      const textElement = firstRun.children?.find((c: any) => c.type === "text");
      
      expect(textElement).toBeDefined();
      expect(textElement.text).toBe("Hello World");
    });

    it("parses tables", async () => {
      const mockZip = createMockZip({
        "word/document.xml": TABLE_DOCUMENT_XML,
        "word/styles.xml": SAMPLE_STYLES_XML,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].type).toBe("table");
    });

    it("parses table grid columns", async () => {
      const mockZip = createMockZip({
        "word/document.xml": TABLE_DOCUMENT_XML,
        "word/styles.xml": SAMPLE_STYLES_XML,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      const table = result.elements[0] as any;
      expect(table.grid).toHaveLength(2);
      // 2880 twips = 2 inches = 192 pixels
      expect(table.grid[0].width).toBeCloseTo(192, 0);
      expect(table.grid[1].width).toBeCloseTo(192, 0);
    });

    it("parses table rows and cells", async () => {
      const mockZip = createMockZip({
        "word/document.xml": TABLE_DOCUMENT_XML,
        "word/styles.xml": SAMPLE_STYLES_XML,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      const table = result.elements[0] as any;
      expect(table.children).toHaveLength(1); // One row
      
      const row = table.children[0];
      expect(row.type).toBe("table-row");
      expect(row.children).toHaveLength(2); // Two cells
      
      const cell1 = row.children[0];
      expect(cell1.type).toBe("table-cell");
    });

    it("parses cell content (paragraphs)", async () => {
      const mockZip = createMockZip({
        "word/document.xml": TABLE_DOCUMENT_XML,
        "word/styles.xml": SAMPLE_STYLES_XML,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      const table = result.elements[0] as any;
      const cell1 = table.children[0].children[0];
      
      expect(cell1.children).toHaveLength(1);
      expect(cell1.children[0].type).toBe("paragraph");
    });
  });

  describe("parseDocxXml convenience function", () => {
    it("returns Document with elements and pageConfig", async () => {
      const mockZip = createMockZip({
        "word/document.xml": SAMPLE_DOCUMENT_XML,
        "word/styles.xml": SAMPLE_STYLES_XML,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const result = await parseDocxXml(new ArrayBuffer(0));

      expect(result.elements).toBeDefined();
      expect(result.pageConfig).toBeDefined();
      expect(result.elements.length).toBeGreaterThan(0);
    });
  });

  describe("error handling", () => {
    it("throws error when document.xml is missing", async () => {
      const mockZip = createMockZip({
        "word/styles.xml": SAMPLE_STYLES_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      await expect(parser.parse(new ArrayBuffer(0))).rejects.toThrow();
    });
  });

  describe("font inheritance (docDefaults → style chain → pPr → rPr)", () => {
    const NO_RPR_DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Plain</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;

    it("использует <w:docDefaults> вместо хардкода TNR 11pt", async () => {
      const stylesWithDocDefaults = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`;
      const mockZip = createMockZip({
        "word/document.xml": NO_RPR_DOC_XML,
        "word/styles.xml": stylesWithDocDefaults,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      const para = result.elements[0] as any;
      const run = para.children[0];
      expect(run.font.family).toBe("Calibri");
      // 11pt at 96dpi = 14.6666...px
      expect(run.font.size).toBeCloseTo(14.67, 1);
      // docDefaults на выходе — тоже Calibri 11pt
      expect(result.docDefaults.family).toBe("Calibri");
    });

    it("paragraph style font наследуется в run без rPr", async () => {
      const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:sz w:val="28"/>
    </w:rPr>
  </w:style>
</w:styles>`;
      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Normal"/></w:pPr>
      <w:r><w:t>Styled</w:t></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;

      const mockZip = createMockZip({
        "word/document.xml": docXml,
        "word/styles.xml": styles,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      const run = (result.elements[0] as any).children[0];
      expect(run.font.family).toBe("Arial");
      // 14pt
      expect(run.font.size).toBeCloseTo(18.67, 1);
    });

    it("basedOn — дочерний стиль наследует font от родителя", async () => {
      const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Quote">
    <w:name w:val="Quote"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:i/></w:rPr>
  </w:style>
</w:styles>`;
      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Quote"/></w:pPr>
      <w:r><w:t>Quoted</w:t></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;

      const mockZip = createMockZip({
        "word/document.xml": docXml,
        "word/styles.xml": styles,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      const run = (result.elements[0] as any).children[0];
      // family из Normal, size из docDefaults (Quote не переопределяет), italic из Quote
      expect(run.font.family).toBe("Georgia");
      expect(run.font.size).toBeCloseTo(14.67, 1);
      expect(run.font.style).toBe("italic");
    });

    it("частичный rPr на run не сбрасывает базовый шрифт", async () => {
      const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`;
      // run с одним только <w:b/> — раньше парсер возвращал null,
      // run получал хардкод TNR 11pt; теперь должен сохранить Calibri/11 с bold.
      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;

      const mockZip = createMockZip({
        "word/document.xml": docXml,
        "word/styles.xml": styles,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      const run = (result.elements[0] as any).children[0];
      expect(run.font.family).toBe("Calibri");
      expect(run.font.size).toBeCloseTo(14.67, 1);
      expect(run.font.weight).toBe("bold");
    });

    it("paragraph rPr overlay перебивает style font", async () => {
      const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>`;
      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana"/></w:rPr>
      </w:pPr>
      <w:r><w:t>Inline</w:t></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;

      const mockZip = createMockZip({
        "word/document.xml": docXml,
        "word/styles.xml": styles,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      const result = await parser.parse(new ArrayBuffer(0));

      const run = (result.elements[0] as any).children[0];
      expect(run.font.family).toBe("Verdana"); // paragraph rPr override
      expect(run.font.size).toBeCloseTo(14.67, 1); // size наследуется от style
    });

    it("cycle-safe: basedOn-цикл не виснет", async () => {
      const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="A">
    <w:name w:val="A"/>
    <w:basedOn w:val="B"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="B">
    <w:name w:val="B"/>
    <w:basedOn w:val="A"/>
  </w:style>
</w:styles>`;

      const mockZip = createMockZip({
        "word/document.xml": NO_RPR_DOC_XML,
        "word/styles.xml": styles,
        "word/_rels/document.xml.rels": SAMPLE_RELS_XML,
      });
      vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as any);

      const parser = new DocxXmlParser();
      // Не должно зависнуть; должно успешно разрешиться.
      const result = await parser.parse(new ArrayBuffer(0));
      expect(result.elements).toBeDefined();
    });
  });
});
