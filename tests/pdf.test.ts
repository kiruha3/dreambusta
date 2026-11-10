import test from 'node:test';
import assert from 'node:assert/strict';
import { importBook } from '../lib/import.ts';

function makePdf(text: string): Uint8Array<ArrayBuffer> {
  const content = `BT /F1 18 Tf 60 700 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((o,i) => { offsets.push(pdf.length); pdf += `${i+1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10,'0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
test('PDF extracts an actual page text layer', async () => {
  const doc = await importBook(new File([makePdf('Hello from a real PDF')], 'page.pdf'));
  assert.match(doc.paragraphs.join(' '), /Hello from a real PDF/);
});
test('PDF without page text is rejected without attempting OCR', async () => {
  await assert.rejects(importBook(new File([makePdf('')], 'scan.pdf')), /не найден текст/u);
});
