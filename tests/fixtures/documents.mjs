import JSZip from "jszip";
import { readFileSync } from "node:fs";

export function makeJpxPdf() {
  const image = Buffer.from(readFileSync(new URL('./jpx-image.b64', import.meta.url), 'utf8').trim(), 'base64');
  const content = Buffer.from('q 300 0 0 200 0 0 cm /Im0 Do Q');
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 160 /Height 100 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /JPXDecode /Length ${image.length} >>\nstream\n`), image, Buffer.from('\nendstream')]),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`),content,Buffer.from('\nendstream')]),
  ];
  const chunks=[Buffer.from('%PDF-1.7\n')]; const offsets=[0]; let size=chunks[0].length;
  objects.forEach((o,i)=>{offsets.push(size);const b=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),o,Buffer.from('\nendobj\n')]);chunks.push(b);size+=b.length;});
  chunks.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`));
  return Buffer.concat(chunks);
}
export function makePdf(text = "", pageCount = 1) {
  const content = `BT /F1 18 Tf 60 700 Td (${text}) Tj ET`;
  const kids = Array.from(
    { length: pageCount },
    (_, i) => `${3 + i * 2} 0 R`,
  ).join(" ");
  const font = 3 + pageCount * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
  ];
  for (let i = 0; i < pageCount; i++)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
export async function makeDocx(text = "Документ с таблицей") {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r></w:p>${text ? '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Первая ячейка</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Вторая ячейка</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' : ""}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}
export async function makePptx() {
  const zip = new JSZip();
  const ns = "http://schemas.openxmlformats.org";
  zip.file(
    "[Content_Types].xml",
    `<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
  );
  zip.file(
    "ppt/presentation.xml",
    `<p:presentation xmlns:p="${ns}/presentationml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="second"/><p:sldId id="257" r:id="first"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="first" Type="${ns}/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="second" Type="${ns}/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`,
  );
  for (const [i, text] of [
    [1, "Второй по порядку"],
    [2, "Первый слайд"],
  ])
    zip.file(
      `ppt/slides/slide${i}.xml`,
      `<p:sld xmlns:p="${ns}/presentationml/2006/main" xmlns:a="${ns}/drawingml/2006/main"><p:cSld name="${text}"><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="6400800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="E4E4E7"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="3200"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    );
  return zip.generateAsync({ type: "nodebuffer" });
}

// Empty <ln/> and uninstalled fonts occur in exported customer decks.
export async function makeStyledPptx() {
  const zip = await JSZip.loadAsync(await makePptx());
  const original = await zip.file("ppt/slides/slide2.xml").async("string");
  const text = original
    .replace(/<a:solidFill>.*?<\/a:solidFill>/s, "<a:noFill/><a:ln/>")
    .replace(
      /<a:p>.*?<\/a:p>/s,
      `<a:p><a:r><a:rPr sz="3200"><a:latin typeface="UnavailableSlideFont"/><a:solidFill><a:srgbClr val="0EA5E9"/></a:solidFill></a:rPr><a:t>▶</a:t></a:r><a:r><a:rPr sz="2400" b="1"><a:latin typeface="UnavailableSlideFont"/><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t> Основной текст</a:t></a:r></a:p>`,
    );
  const frame = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Rounded frame"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="2743200"/><a:ext cx="3200400" cy="914400"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 8000"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln/><a:effectLst><a:outerShdw blurRad="304800" dist="127000" dir="5400000"><a:srgbClr val="0F172A"><a:alpha val="10000"/></a:srgbClr></a:outerShdw></a:effectLst></p:spPr></p:sp>`;
  zip.file(
    "ppt/slides/slide2.xml",
    text.replace("</p:spTree>", frame + "</p:spTree>"),
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function makeDensePptx() {
  const zip = await JSZip.loadAsync(await makePptx());
  const ns = "http://schemas.openxmlformats.org";
  const count = 20;
  zip.file(
    "ppt/presentation.xml",
    `<p:presentation xmlns:p="${ns}/presentationml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><p:sldIdLst>${Array.from({ length: count }, (_, i) => `<p:sldId id="${256 + i}" r:id="s${i + 1}"/>`).join("")}</p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<Relationships xmlns="${ns}/package/2006/relationships">${Array.from({ length: count }, (_, i) => `<Relationship Id="s${i + 1}" Type="${ns}/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>`,
  );
  const original = await zip.file("ppt/slides/slide1.xml").async("string");
  for (let i = 1; i <= count; i++) {
    const paragraphs = Array.from(
      { length: 12 },
      (_, n) =>
        `<a:p><a:r><a:rPr sz="1200"/><a:t>${n === 0 ? `Плотный слайд ${i}` : `Строка ${n}: сроки, задачи и подробные результаты работы команды.`}</a:t></a:r></a:p>`,
    ).join("");
    zip.file(
      `ppt/slides/slide${i}.xml`,
      original
        .replace('cy="914400"', 'cy="4114800"')
        .replace(/<a:p>.*<\/a:p>/s, paragraphs),
    );
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function makeTablePptx() {
  const zip = await JSZip.loadAsync(await makePptx());
  const xml = await zip.file("ppt/slides/slide2.xml").async("string");
  const ns = "http://schemas.openxmlformats.org";
  const cell = (text, attrs = "", header = false) =>
    `<a:tc ${attrs}><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1400" b="${header ? 1 : 0}"><a:latin typeface="Arial"/><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r></a:p></a:txBody><a:tcPr marL="38100" marR="38100" marT="38100" marB="38100" anchor="ctr">${["L", "R", "T", "B"].map((side) => `<a:ln${side} w="9525"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln${side}>`).join("")}${header ? '<a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill>' : ""}</a:tcPr></a:tc>`;
  const rows = [
    cell("Реквизиты", 'gridSpan="2"', true) +
      cell("", 'hMerge="1"') +
      cell("Тип", "", true),
    cell("Заказчик", 'rowSpan="2"') + cell("Название") + cell("Текст"),
    cell("", 'vMerge="1"') + cell("Контракт") + cell("Номер"),
  ]
    .map((cells) => `<a:tr h="381000">${cells}</a:tr>`)
    .join("");
  const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Таблица"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="914400" y="1828800"/><a:ext cx="3429000" cy="1143000"/></p:xfrm><a:graphic><a:graphicData uri="${ns}/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="952500"/><a:gridCol w="1524000"/><a:gridCol w="952500"/></a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  zip.file(
    "ppt/slides/slide2.xml",
    xml.replace("</p:spTree>", table + "</p:spTree>"),
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function makeVectorPptx() {
  const zip = await JSZip.loadAsync(await makePptx());
  const xml = await zip.file("ppt/slides/slide2.xml").async("string");
  const freeform = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Vector icon"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="2743200"/><a:ext cx="914400" cy="457200"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="0"/></a:lnTo><a:cubicBezTo><a:pt x="100" y="50"/><a:pt x="50" y="100"/><a:pt x="0" y="100"/></a:cubicBezTo><a:close/></a:path><a:path w="100" h="100" fill="none" stroke="0"><a:moveTo><a:pt x="10" y="10"/></a:moveTo><a:quadBezTo><a:pt x="50" y="50"/><a:pt x="90" y="10"/></a:quadBezTo></a:path></a:pathLst></a:custGeom><a:solidFill><a:srgbClr val="94A3B8"><a:alpha val="50000"/></a:srgbClr></a:solidFill><a:ln/></p:spPr></p:sp>`;
  const glow = `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Gradient glow"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="3657600" y="2743200"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="ellipse"/><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="0EA5E9"><a:alpha val="6000"/></a:srgbClr></a:gs><a:gs pos="100000"><a:srgbClr val="0EA5E9"><a:alpha val="0"/></a:srgbClr></a:gs></a:gsLst><a:path path="circle"/></a:gradFill><a:ln/></p:spPr></p:sp>`;
  zip.file("ppt/slides/slide2.xml", xml.replace("</p:spTree>", freeform + glow + "</p:spTree>"));
  return zip.generateAsync({ type: "nodebuffer" });
}
