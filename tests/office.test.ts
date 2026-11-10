import test from "node:test";
import assert from "node:assert/strict";
import { processFile } from "../server/processing.ts";
// @ts-ignore Test fixtures are deliberately JavaScript, also used by the browser suite.
import { makeDocx, makePptx } from "./fixtures/documents.mjs";
test("DOCX without text remains visually readable instead of failing WBook text validation", async () => {
  const m = await processFile(new File([await makeDocx("")], "empty.docx"));
  assert.ok(m.representations!.includes("docx"));
  assert.ok(!m.representations!.includes("text"));
  assert.equal(m.state, "ready");
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
