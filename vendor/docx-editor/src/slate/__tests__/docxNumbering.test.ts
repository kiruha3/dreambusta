import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { Packer } from "docx";
import { createEditor, Node, Transforms, type Descendant } from "slate";
import { parseDocxXml } from "../../layout/docxXmlParser";
import { documentToSlate } from "../documentToSlate";
import { slateToDocument } from "../slateToDocument";
import { buildDocxDocument } from "../exportDocx";
import { indentListItem, toggleList } from "../listUtils";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// A real OOXML ZIP: list membership lives in styles.xml, not document.xml.
async function styleNumberedDocx(paragraphProperties: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<w:document xmlns:w="${W}"><w:body><w:p><w:pPr>${paragraphProperties}</w:pPr><w:r><w:t>Contract clause</w:t></w:r></w:p></w:body></w:document>`);
  zip.file("word/styles.xml", `<w:styles xmlns:w="${W}">
    <w:style w:type="paragraph" w:styleId="Nested"><w:basedOn w:val="ListNumber"/><w:pPr><w:numPr><w:ilvl w:val="1"/></w:numPr></w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="Inherited"><w:basedOn w:val="ListNumber"/></w:style>
    <w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:pPr><w:numPr><w:numId w:val="7"/></w:numPr></w:pPr></w:style>
  </w:styles>`);
  zip.file("word/numbering.xml", `<w:numbering xmlns:w="${W}">
    <w:abstractNum w:abstractNumId="4"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2."/></w:lvl></w:abstractNum>
    <w:num w:numId="7"><w:abstractNumId w:val="4"/></w:num>
    <w:abstractNum w:abstractNumId="5"><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>
    <w:num w:numId="8"><w:abstractNumId w:val="5"/></w:num>
  </w:numbering>`);
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("DOCX style numbering", () => {
  it.each([
    ["standard Word style", '<w:pStyle w:val="ListNumber"/>', 7, 0, "decimal"],
    ["basedOn style", '<w:pStyle w:val="Inherited"/>', 7, 0, "decimal"],
    ["child style level", '<w:pStyle w:val="Nested"/>', 7, 1, "lowerLetter"],
    ["paragraph level override", '<w:pStyle w:val="ListNumber"/><w:numPr><w:ilvl w:val="1"/></w:numPr>', 7, 1, "lowerLetter"],
    ["paragraph numbering override", '<w:pStyle w:val="Nested"/><w:numPr><w:numId w:val="8"/></w:numPr>', 8, 1, "bullet"],
  ])("imports %s from a real DOCX archive", async (_name, properties, numId, ilvl, numFmt) => {
    const doc = await parseDocxXml(await styleNumberedDocx(String(properties)));

    expect(doc.elements[0]).toMatchObject({ props: { numPr: { numId, ilvl, numFmt } } });
    const slate = documentToSlate(doc);
    expect(slate[0]).toMatchObject({
      type: numFmt === "bullet" ? "bulleted-list" : "numbered-list",
      children: [{ type: "list-item", listType: numFmt === "bullet" ? "bullet" : "numbered", level: ilvl }],
    });
    expect(Node.string(slate[0])).toBe("Contract clause");
  });

  it("honours an explicit numId=0 that cancels inherited numbering", async () => {
    const doc = await parseDocxXml(await styleNumberedDocx('<w:pStyle w:val="ListNumber"/><w:numPr><w:numId w:val="0"/></w:numPr>'));

    expect(documentToSlate(doc)[0]).toMatchObject({ type: "paragraph" });
  });
});

async function exportAndRead(content: Descendant[]) {
  const bytes = await Packer.toBuffer(await buildDocxDocument(slateToDocument(content)));
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const numberingXml = await zip.file("word/numbering.xml")!.async("string");
  // Buffer's backing ArrayBuffer belongs to Node's realm; give the browser parser
  // a local ArrayBuffer, as a real File.arrayBuffer() would.
  const localBytes = new Uint8Array(bytes.length);
  localBytes.set(bytes);
  const doc = await parseDocxXml(localBytes.buffer);
  return { documentXml, numberingXml, doc, slate: documentToSlate(doc) };
}

describe("DOCX list export", () => {
  it("preserves heading paragraphs around list clauses through DOCX export", async () => {
    const { documentXml, slate } = await exportAndRead([
      { type: "heading-one", children: [{ text: "Contract subject" }] },
      { type: "heading-two", children: [{ text: "Obligations" }] },
      { type: "heading-three", children: [{ text: "Evidence" }] },
    ]);

    expect(documentXml).toContain("Contract subject");
    expect(slate).toMatchObject([
      { type: "heading-one", children: [{ text: "Contract subject" }] },
      { type: "heading-two", children: [{ text: "Obligations" }] },
      { type: "heading-three", children: [{ text: "Evidence" }] },
    ]);
  });

  it("exports lists created with toolbar commands as actual Word numbering", async () => {
    const editor = createEditor();
    editor.children = [
      { type: "paragraph", children: [{ text: "First clause", bold: true }] },
      { type: "paragraph", children: [{ text: "Nested clause" }] },
      { type: "paragraph", children: [{ text: "Evidence" }] },
    ];
    for (const [index, listType] of [[0, "numbered"], [1, "numbered"], [2, "bullet"]] as const) {
      Transforms.select(editor, { path: [index, 0], offset: 0 });
      toggleList(editor, listType);
      for (let level = 0; level < index; level++) indentListItem(editor);
    }

    const { documentXml, numberingXml, doc, slate } = await exportAndRead(editor.children);

    expect(documentXml.match(/<w:numPr>/g)).toHaveLength(3);
    expect(numberingXml).toContain('w:val="decimal"');
    expect(numberingXml).toContain('w:val="bullet"');
    expect(doc.elements).toMatchObject([
      { props: { numPr: { ilvl: 0, numFmt: "decimal" } } },
      { props: { numPr: { ilvl: 1, numFmt: "decimal" } } },
      { props: { numPr: { ilvl: 2, numFmt: "bullet" } } },
    ]);
    expect(slate).toMatchObject([
      { type: "numbered-list", children: [
        { type: "list-item", level: 0, children: [{ text: "First clause", bold: true }] },
        { type: "list-item", level: 1, children: [{ text: "Nested clause" }] },
      ] },
      { type: "bulleted-list", children: [{ type: "list-item", level: 2, children: [{ text: "Evidence" }] }] },
    ]);
  });

  it("keeps imported list containers and their numbering format through export", async () => {
    const imported = documentToSlate(await parseDocxXml(await styleNumberedDocx('<w:pStyle w:val="Nested"/>')));

    const { documentXml, doc } = await exportAndRead(imported);

    expect(documentXml).toContain("Contract clause");
    expect(doc.elements).toMatchObject([{ props: { numPr: { ilvl: 1, numFmt: "lowerLetter" } } }]);
  });

  it("exports list containers inside table cells", async () => {
    const { doc } = await exportAndRead([{
      type: "table", children: [{ type: "table-row", children: [{ type: "table-cell", children: [{
        type: "bulleted-list", children: [{ type: "list-item", listType: "bullet", level: 0, children: [{ text: "Attachment" }] }],
      }] }] }],
    }]);

    expect(doc.elements[0]).toMatchObject({ children: [{ children: [{ children: [{ props: { numPr: { ilvl: 0, numFmt: "bullet" } } } ] }] }] });
  });
});
