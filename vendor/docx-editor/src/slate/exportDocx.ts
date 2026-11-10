import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ImageRun,
  BorderStyle,
  PageOrientation,
  ShadingType,
  TableLayoutType,
  Header,
  Footer,
  LevelFormat,
  HeadingLevel,
  type INumberingOptions,
} from "docx";
import { saveAs } from "file-saver";
import type { Document, DocumentElement, ParagraphElement, TableElement, TableRowElement, TableCellElement, RunElement, TextElement, ImageElement as DocImageElement, HeaderFooter } from "../layout/types";
import { UnitConverter } from "../layout/unitConverter";

/**
 * Собирает docx-Document из canonical-модели (общая часть для скачивания и
 * экспорта в байты). Выделено из saveDocumentAsDocx ради DRY — см.
 * documentToDocxBytes (запись на диск из cli-gateway без file-saver).
 */
export async function buildDocxDocument(doc: Document): Promise<DocxDocument> {
  const docxChildren = await convertElementsToDocx(doc.elements);

  // Build headers/footers from canonical model
  const headers: Record<string, any> = {};
  const footers: Record<string, any> = {};

  if (doc.headers) {
    for (const hf of doc.headers) {
      const hfChildren = await convertElementsToDocx(hf.elements);
      headers[hf.type] = new Header({ children: hfChildren });
    }
  }
  if (doc.footers) {
    for (const hf of doc.footers) {
      const hfChildren = await convertElementsToDocx(hf.elements);
      footers[hf.type] = new Footer({ children: hfChildren });
    }
  }

  const sectionConfig: any = {
    properties: {
      page: {
        size: {
          width: UnitConverter.pixelsToTwips(doc.pageConfig.width),
          height: UnitConverter.pixelsToTwips(doc.pageConfig.height),
          orientation: doc.pageConfig.width > doc.pageConfig.height ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
        },
        margin: {
          top: UnitConverter.pixelsToTwips(doc.pageConfig.margins.top),
          bottom: UnitConverter.pixelsToTwips(doc.pageConfig.margins.bottom),
          left: UnitConverter.pixelsToTwips(doc.pageConfig.margins.left),
          right: UnitConverter.pixelsToTwips(doc.pageConfig.margins.right),
        },
      },
    },
    children: docxChildren,
  };

  if (Object.keys(headers).length > 0) sectionConfig.headers = headers;
  if (Object.keys(footers).length > 0) sectionConfig.footers = footers;

  return new DocxDocument({
    numbering: buildNumbering(doc),
    sections: [sectionConfig],
  });
}

function buildNumbering(doc: Document): INumberingOptions {
  const definitions = new Map<number, Map<number, string>>();
  const collect = (elements: DocumentElement[]) => {
    for (const element of elements) {
      if (element.type === "paragraph") {
        const numPr = (element as ParagraphElement).props?.numPr;
        if (numPr && numPr.numId > 0) {
          let levels = definitions.get(numPr.numId);
          if (!levels) {
            const imported = doc.numbering?.[numPr.numId]?.levels || {};
            levels = new Map(Object.entries(imported).map(([level, format]) => [Number(level), format]));
            definitions.set(numPr.numId, levels);
          }
          const level = numPr.ilvl ?? 0;
          levels.set(level, numPr.numFmt || levels.get(level) || "decimal");
        }
      }
      if (element.children) collect(element.children);
    }
  };
  collect(doc.elements);
  for (const part of [...(doc.headers || []), ...(doc.footers || [])]) collect(part.elements);

  return { config: Array.from(definitions, ([numId, formats]) => ({
    reference: `list-${numId}`,
    // Word supports nine levels; define them even if only some are currently used.
    levels: Array.from({ length: 9 }, (_, level) => {
      const requestedFormat = formats.get(level) || formats.values().next().value || "decimal";
      const format = Object.values(LevelFormat).find(value => value === requestedFormat) || LevelFormat.DECIMAL;
      return {
        level,
        format,
        text: format === LevelFormat.BULLET ? "•" : format === LevelFormat.NONE ? "" : `%${level + 1}.`,
        start: 1,
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: (level + 1) * 360, hanging: 180 } } },
      };
    }),
  })) };
}

export async function saveDocumentAsDocx(doc: Document, filename: string = "document.docx") {
  const docxDoc = await buildDocxDocument(doc);
  const blob = await Packer.toBlob(docxDoc);
  saveAs(blob, filename);
}

/**
 * Сериализует canonical-Document в байты .docx (без file-saver/скачивания).
 * Нужно cli-gateway для записи на диск через IPC system:write-file-bytes.
 */
export async function documentToDocxBytes(doc: Document): Promise<Uint8Array> {
  const docxDoc = await buildDocxDocument(doc);
  const blob = await Packer.toBlob(docxDoc);
  return new Uint8Array(await blob.arrayBuffer());
}

async function convertElementsToDocx(elements: DocumentElement[]): Promise<any[]> {
  const children: any[] = [];

  for (const element of elements) {
    if (element.type === "paragraph") {
      children.push(convertParagraph(element as ParagraphElement));
    } else if (element.type === "table") {
      children.push(convertTable(element as TableElement));
    } else if (element.type === "image") {
      children.push(convertImage(element as DocImageElement));
    }
  }

  return children;
}

function convertParagraph(element: ParagraphElement): Paragraph {
  const children: (TextRun | ImageRun)[] = [];

  if (element.children) {
    for (const child of element.children) {
      if (child.type === "run") {
        const run = child as RunElement;
        const textElements = run.children?.filter(c => c.type === "text") as TextElement[];
        
        if (textElements && textElements.length > 0) {
          const text = textElements.map(t => t.text).join("");
          children.push(new TextRun({
            text: text,
            bold: run.font?.weight === "bold",
            italics: run.font?.style === "italic",
            font: run.font?.family,
            size: run.font?.size ? UnitConverter.pixelsToPoints(run.font.size) * 2 : undefined, // Half-points
          }));
        }
      }
    }
  }

  let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT;
  const align = element.props?.alignment as string | undefined;
  if (align === "center") alignment = AlignmentType.CENTER;
  else if (align === "right") alignment = AlignmentType.RIGHT;
  else if (align === "justify" || align === "both") alignment = AlignmentType.JUSTIFIED;
  const numPr = element.props?.numPr;
  const headings = { Heading1: HeadingLevel.HEADING_1, Heading2: HeadingLevel.HEADING_2, Heading3: HeadingLevel.HEADING_3 };
  const heading = headings[element.props?.pStyle?.val as keyof typeof headings];

  return new Paragraph({
    children: children,
    alignment: alignment,
    heading,
    numbering: numPr && numPr.numId > 0 ? {
      reference: `list-${numPr.numId}`,
      level: numPr.ilvl ?? 0,
    } : undefined,
    indent: {
        left: element.props?.ind?.left ? UnitConverter.pixelsToTwips(element.props.ind.left) : undefined,
        right: element.props?.ind?.right ? UnitConverter.pixelsToTwips(element.props.ind.right) : undefined,
        firstLine: element.props?.ind?.firstLine ? UnitConverter.pixelsToTwips(element.props.ind.firstLine) : undefined,
    },
    spacing: {
        before: element.props?.spacing?.before ? UnitConverter.pixelsToTwips(element.props.spacing.before) : undefined,
        after: element.props?.spacing?.after ? UnitConverter.pixelsToTwips(element.props.spacing.after) : undefined,
    }
  });
}

/**
 * Decode base64 data URL to Uint8Array for the docx library
 */
function base64ToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || dataUrl;
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function convertImage(element: DocImageElement): Paragraph {
  const imageData = base64ToUint8Array(element.src);

  // Detect image type from data URL mime type
  const mimeMatch = element.src.match(/data:image\/(\w+)/);
  const mime = mimeMatch ? mimeMatch[1].toLowerCase() : 'png';
  const typeMap: Record<string, "jpg" | "png" | "gif" | "bmp"> = {
    jpeg: "jpg", jpg: "jpg", png: "png", gif: "gif", bmp: "bmp",
  };
  const imageType = typeMap[mime] || "png";

  // docx library expects dimensions in pixels for transformation
  // but internally converts to EMU. Width/height from our model are already in pixels.
  const widthPx = element.width || 300;
  const heightPx = element.height || 200;

  return new Paragraph({
    children: [
      new ImageRun({
        type: imageType,
        data: imageData,
        transformation: {
          width: widthPx,
          height: heightPx,
        },
      }),
    ],
  });
}

function convertTableCellContent(cellChild: TableCellElement): (Paragraph | Table)[] {
  const content: (Paragraph | Table)[] = [];

  if (cellChild.children) {
    for (const child of cellChild.children) {
      if (child.type === "paragraph") {
        content.push(convertParagraph(child as ParagraphElement));
      } else if (child.type === "table") {
        // Рекурсивная обработка вложенных таблиц
        content.push(convertTable(child as TableElement));
      }
    }
  }

  // Ячейка не может быть пустой в DOCX - добавляем пустой параграф
  if (content.length === 0) {
    content.push(new Paragraph({ children: [] }));
  }

  return content;
}

function convertBorderStyle(borderDef?: { style?: string; width?: number; color?: string }): { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string } {
  if (!borderDef) {
    return { style: BorderStyle.SINGLE, size: 1, color: "000000" };
  }

  let style: (typeof BorderStyle)[keyof typeof BorderStyle] = BorderStyle.SINGLE;

  if (borderDef.style === "none" || borderDef.style === "nil") {
    style = BorderStyle.NONE;
  } else if (borderDef.style === "double") {
    style = BorderStyle.DOUBLE;
  } else if (borderDef.style === "dashed") {
    style = BorderStyle.DASHED;
  } else if (borderDef.style === "dotted") {
    style = BorderStyle.DOTTED;
  } else if (borderDef.style === "thick") {
    style = BorderStyle.THICK;
  }

  return {
    style,
    size: borderDef.width ?? 1,
    color: (borderDef.color ?? "000000").replace("#", ""),
  };
}

function convertVerticalAlign(vAlign?: string): "top" | "center" | "bottom" | undefined {
  if (vAlign === "top") return "top";
  if (vAlign === "center") return "center";
  if (vAlign === "bottom") return "bottom";
  return undefined;
}

function convertTable(element: TableElement): Table {
  const rows: TableRow[] = [];
  const grid = element.grid || [];

  // Рассчитываем rowSpan для ячеек с vMerge
  // vMerge='restart' означает начало объединения, 'continue' - продолжение
  // Нужно вычислить фактический rowSpan для каждой ячейки
  const rowSpanMap = calculateRowSpans(element);

  if (element.children) {
    let rowIndex = 0;
    for (const rowChild of element.children) {
      if (rowChild.type === "table-row") {
        const cells: TableCell[] = [];
        let colIndex = 0;

        if (rowChild.children) {
          for (const cellChild of rowChild.children) {
            if (cellChild.type === "table-cell") {
              const cellElement = cellChild as TableCellElement;
              const props = cellElement.props || {};

              // Получаем colSpan
              const colSpan = props.colSpan && props.colSpan > 1 ? props.colSpan : undefined;

              // Получаем rowSpan из предварительно вычисленной карты
              const cellKey = `${rowIndex}-${colIndex}`;
              const rowSpan = rowSpanMap.get(cellKey);

              // Если это ячейка с vMerge='continue', пропускаем её (она объединена)
              if (props.vMerge === 'continue') {
                colIndex += colSpan || 1;
                continue;
              }

              // Ширина ячейки (из props или из grid)
              let cellWidth: { size: number; type: (typeof WidthType)[keyof typeof WidthType] } | undefined;
              if (props.width) {
                cellWidth = {
                  size: UnitConverter.pixelsToTwips(props.width),
                  type: WidthType.DXA,
                };
              } else if (props.widthPercent) {
                cellWidth = {
                  size: props.widthPercent * 100,
                  type: WidthType.PERCENTAGE,
                };
              } else if (grid[colIndex]?.width) {
                // Используем ширину из grid с учётом colSpan
                let totalWidth = 0;
                for (let i = 0; i < (colSpan || 1); i++) {
                  if (grid[colIndex + i]) {
                    totalWidth += grid[colIndex + i].width;
                  }
                }
                if (totalWidth > 0) {
                  cellWidth = {
                    size: UnitConverter.pixelsToTwips(totalWidth),
                    type: WidthType.DXA,
                  };
                }
              }

              // Границы ячейки
              const borders = props.borders ? {
                top: convertBorderStyle(props.borders.top),
                bottom: convertBorderStyle(props.borders.bottom),
                left: convertBorderStyle(props.borders.left),
                right: convertBorderStyle(props.borders.right),
              } : {
                top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
              };

              // Отступы внутри ячейки
              const margins = props.padding ? {
                top: props.padding.top ? UnitConverter.pixelsToTwips(props.padding.top) : undefined,
                bottom: props.padding.bottom ? UnitConverter.pixelsToTwips(props.padding.bottom) : undefined,
                left: props.padding.left ? UnitConverter.pixelsToTwips(props.padding.left) : undefined,
                right: props.padding.right ? UnitConverter.pixelsToTwips(props.padding.right) : undefined,
              } : undefined;

              // Фон ячейки
              const shading = props.backgroundColor ? {
                type: ShadingType.SOLID,
                color: props.backgroundColor.replace("#", ""),
                fill: props.backgroundColor.replace("#", ""),
              } : undefined;

              const cellContent = convertTableCellContent(cellElement);

              cells.push(new TableCell({
                children: cellContent,
                columnSpan: colSpan,
                rowSpan: rowSpan,
                width: cellWidth,
                borders: borders,
                margins: margins,
                shading: shading,
                verticalAlign: convertVerticalAlign(props.vAlign),
              }));

              colIndex += colSpan || 1;
            }
          }
        }

        // Добавляем строку только если есть ячейки (не все были vMerge='continue')
        if (cells.length > 0) {
          rows.push(new TableRow({ children: cells }));
        }
        rowIndex++;
      }
    }
  }

  // Настраиваем ширины колонок для таблицы
  const columnWidths = grid.length > 0
    ? grid.map(col => UnitConverter.pixelsToTwips(col.width))
    : undefined;

  return new Table({
    rows: rows,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    columnWidths: columnWidths,
    layout: TableLayoutType.FIXED,
  });
}

// Вычисляет фактический rowSpan для каждой ячейки с vMerge='restart'
function calculateRowSpans(element: TableElement): Map<string, number> {
  const rowSpanMap = new Map<string, number>();

  if (!element.children) return rowSpanMap;

  const rows = element.children.filter(
    (child): child is TableRowElement => child.type === "table-row"
  );

  // Для каждой колонки отслеживаем, где началось объединение
  const mergeStarts = new Map<number, { startRow: number; startCol: number }>();

  rows.forEach((row, rowIndex) => {
    let colIndex = 0;

    if (!row.children) return;

    for (const cell of row.children) {
      if (cell.type !== "table-cell") continue;

      const cellElement = cell as TableCellElement;
      const props = cellElement.props || {};
      const colSpan = props.colSpan || 1;

      if (props.vMerge === 'restart') {
        // Начало вертикального объединения
        for (let i = 0; i < colSpan; i++) {
          mergeStarts.set(colIndex + i, { startRow: rowIndex, startCol: colIndex });
        }
      } else if (props.vMerge === 'continue') {
        // Продолжение объединения - увеличиваем счётчик
        // (ничего не делаем здесь, подсчёт ниже)
      } else {
        // Нет объединения - сбрасываем для этих колонок
        for (let i = 0; i < colSpan; i++) {
          mergeStarts.delete(colIndex + i);
        }
      }

      colIndex += colSpan;
    }
  });

  // Второй проход - вычисляем фактические rowSpan
  mergeStarts.clear();

  rows.forEach((row, rowIndex) => {
    let colIndex = 0;

    if (!row.children) return;

    for (const cell of row.children) {
      if (cell.type !== "table-cell") continue;

      const cellElement = cell as TableCellElement;
      const props = cellElement.props || {};
      const colSpan = props.colSpan || 1;

      if (props.vMerge === 'restart') {
        mergeStarts.set(colIndex, { startRow: rowIndex, startCol: colIndex });
      } else if (props.vMerge === 'continue') {
        // Продолжаем объединение
      } else {
        // Завершаем объединение если было
        const mergeStart = mergeStarts.get(colIndex);
        if (mergeStart) {
          const rowSpanValue = rowIndex - mergeStart.startRow;
          if (rowSpanValue > 1) {
            rowSpanMap.set(`${mergeStart.startRow}-${mergeStart.startCol}`, rowSpanValue);
          }
          mergeStarts.delete(colIndex);
        }
      }

      colIndex += colSpan;
    }
  });

  // Завершаем все оставшиеся объединения (до конца таблицы)
  mergeStarts.forEach((mergeStart, colIndex) => {
    const rowSpanValue = rows.length - mergeStart.startRow;
    if (rowSpanValue > 1) {
      rowSpanMap.set(`${mergeStart.startRow}-${mergeStart.startCol}`, rowSpanValue);
    }
  });

  return rowSpanMap;
}

