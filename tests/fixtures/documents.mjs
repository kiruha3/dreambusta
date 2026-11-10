import JSZip from 'jszip';
export function makePdf(text = '') {
  const content = `BT /F1 18 Tf 60 700 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((o,i) => { offsets.push(pdf.length); pdf += `${i+1} 0 obj\n${o}\nendobj\n`; }); const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10,'0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
export async function makeDocx(text = 'Документ с таблицей') {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r></w:p>${text ? '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Первая ячейка</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Вторая ячейка</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' : ''}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
export async function makePptx() {
  const zip = new JSZip(); const ns = 'http://schemas.openxmlformats.org';
  zip.file('[Content_Types].xml', `<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${ns}/presentationml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="second"/><p:sldId id="257" r:id="first"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="first" Type="${ns}/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="second" Type="${ns}/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`);
  for (const [i, text] of [[1, 'Второй по порядку'], [2, 'Первый слайд']]) zip.file(`ppt/slides/slide${i}.xml`, `<p:sld xmlns:p="${ns}/presentationml/2006/main" xmlns:a="${ns}/drawingml/2006/main"><p:cSld name="${text}"><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="6400800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="E4E4E7"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="3200"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
