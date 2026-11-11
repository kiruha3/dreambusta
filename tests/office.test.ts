import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { processFile } from "../server/processing.ts";
// @ts-ignore Test fixtures are deliberately JavaScript, also used by the browser suite.
import {
  makeDocx,
  makePptx,
  makeStyledPptx,
  makeTablePptx,
  makeVectorPptx,
} from "./fixtures/documents.mjs";
test("DOCX without text remains visually readable instead of failing WBook text validation", async () => {
  const m = await processFile(new File([await makeDocx("")], "empty.docx"));
  assert.ok(m.representations!.includes("docx"));
  assert.ok(!m.representations!.includes("text"));
  assert.equal(m.state, "ready");
});

test("PPTX native tables preserve cell text, grid geometry, merges, borders and fills", async () => {
  const m = await processFile(new File([await makeTablePptx()], "table.pptx"));
  const table = (m.scene as any).slides[0].objects.find(
    (o: any) => o.kind === "table",
  );
  assert.ok(
    table,
    "a native DrawingML table must not become an unsupported placeholder",
  );
  assert.deepEqual(table.columns, [100, 160, 100]);
  assert.deepEqual(table.rows, [40, 40, 40]);
  assert.equal(table.cells.length, 7);
  const header = table.cells.find((c: any) => c.row === 0 && c.column === 0);
  assert.equal(header.columnSpan, 2);
  assert.equal(header.text.content, "Реквизиты");
  assert.deepEqual(header.fill, {
    r: 226 / 255,
    g: 232 / 255,
    b: 240 / 255,
    a: 1,
  });
  assert.equal(header.borders.left.width, 1);
  assert.equal(header.text.insets.left, 4);
  assert.equal(
    table.cells.find((c: any) => c.row === 1 && c.column === 0).rowSpan,
    2,
  );
  assert.ok(m.paragraphs!.some((p) => p.includes("Заказчик")));
  assert.ok(m.paragraphs!.some((p) => p.includes("Контракт")));
  assert.deepEqual(m.paragraphs!.slice(2, 5), [
    "Реквизиты · Тип",
    "Заказчик · Название · Текст",
    "Контракт · Номер",
  ]);
});
test("PPTX tables accept zero-height rows used by exported Office decks", async () => {
  const zip = await JSZip.loadAsync(await makeTablePptx());
  const xml = await zip.file("ppt/slides/slide2.xml")!.async("string");
  zip.file(
    "ppt/slides/slide2.xml",
    xml.replace('<a:tr h="381000">', '<a:tr h="0">'),
  );
  const m = await processFile(
    new File(
      [await zip.generateAsync({ type: "nodebuffer" })],
      "zero-row.pptx",
    ),
  );
  const table = (m.scene as any).slides[0].objects.find(
    (o: any) => o.kind === "table",
  );
  assert.equal(table.rows[0], 0);
  assert.ok(m.paragraphs!.some((p) => p.includes("Реквизиты")));
});
test("PPTX tables reject merged cells extending beyond the bounded grid", async () => {
  const zip = await JSZip.loadAsync(await makeTablePptx());
  const xml = await zip.file("ppt/slides/slide2.xml")!.async("string");
  zip.file(
    "ppt/slides/slide2.xml",
    xml.replace('gridSpan="2"', 'gridSpan="9999999"'),
  );
  await assert.rejects(
    processFile(
      new File(
        [await zip.generateAsync({ type: "nodebuffer" })],
        "bad-table.pptx",
      ),
    ),
    /объединение ячеек/,
  );
});
test("PPTX text and scene follow presentation relationships rather than slide filenames", async () => {
  const m = await processFile(new File([await makePptx()], "slides.pptx"));
  assert.equal(m.kind, "presentation");
  assert.ok(m.representations!.includes("slides"));
  assert.ok(m.representations!.includes("text"));
  assert.ok(
    m.paragraphs!.indexOf("Первый слайд") <
      m.paragraphs!.indexOf("Второй по порядку"),
  );
  assert.equal((m.scene as any).slides.length, 2);
  assert.equal((m.scene as any).width, 960);
});
test("PPTX empty line properties do not invent black text frames and rounded cards retain their shape", async () => {
  const m = await processFile(
    new File([await makeStyledPptx()], "styled.pptx"),
  );
  const objects = (m.scene as any).slides[0].objects;
  assert.equal(
    objects[0].stroke ?? null,
    null,
    "an empty ln has no paint to draw",
  );
  assert.equal(
    objects[1].kind,
    "shape",
    "a shadow must not discard a supported rounded card",
  );
  assert.equal(objects[1].shape, "rectangle");
  assert.equal(objects[1].cornerRadius, 7.68);
  assert.deepEqual(objects[1].fill, { r: 1, g: 1, b: 1, a: 1 });
});

test("PPTX vector icons preserve Bezier paths, local coordinates and transparent radial fills", async () => {
  const m = await processFile(new File([await makeVectorPptx()], "vectors.pptx"));
  const objects = (m.scene as any).slides[0].objects;
  const icon = objects.find((o: any) => o.name === "Vector icon");
  assert.equal(icon.kind, "shape", "native vector paths must not become placeholders");
  assert.equal(icon.paths[0].d, "M 0 0 L 96 0 C 96 24 48 48 0 48 Z");
  assert.equal(icon.paths[1].d, "M 9.6 4.8 Q 48 24 86.4 4.8");
  assert.equal(icon.paths[1].fill, false);
  assert.equal(icon.paths[1].stroke, false);
  assert.equal(icon.fill.a, 0.5);
  const glow = objects.find((o: any) => o.name === "Gradient glow");
  assert.equal(glow.shape, "ellipse");
  assert.equal(glow.gradient.kind, "radial");
  assert.deepEqual(glow.gradient.stops.map((s: any) => [s.offset, s.color.a]), [[0, 0.06], [1, 0]]);
  assert.ok(!m.warnings!.some(w => w.includes("сложные объекты пока")));
});
