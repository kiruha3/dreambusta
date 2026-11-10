import { Editor, Node, Text } from "slate";

export const FONT_FAMILIES = [
  { name: "Arial", value: "Arial" },
  { name: "Times New Roman", value: "Times New Roman" },
  { name: "Courier New", value: "Courier New" },
  { name: "Georgia", value: "Georgia" },
  { name: "Verdana", value: "Verdana" },
  { name: "Tahoma", value: "Tahoma" },
  { name: "Trebuchet MS", value: "Trebuchet MS" },
];

// Metric-совместимые fallback-семейства для шрифтов из DOCX. На Linux без msttcorefonts
// проприетарные шрифты (TNR/Arial/Calibri) недоступны — браузер падает на стандартный
// serif/sans-serif, и текст выглядит «не тем шрифтом». Liberation/Carlito/Tinos дают
// почти 1:1 совпадение метрик и кириллицу.
//
// Ключи в нижнем регистре, чтобы матчинг был case-insensitive (DOCX вольно
// относится к капитализации: "Times New Roman" / "times new roman" / "TimesNewRoman").
const FONT_FALLBACKS: Record<string, string> = {
  "times new roman": '"Liberation Serif", "Tinos", "Nimbus Roman", "DejaVu Serif", serif',
  "timesnewroman": '"Liberation Serif", "Tinos", "Nimbus Roman", "DejaVu Serif", serif',
  "times": '"Liberation Serif", "Tinos", "DejaVu Serif", serif',
  "calibri": '"Carlito", "Liberation Sans", "DejaVu Sans", sans-serif',
  "calibri light": '"Carlito", "Liberation Sans", "DejaVu Sans", sans-serif',
  "arial": '"Liberation Sans", "Nimbus Sans", "DejaVu Sans", Arimo, sans-serif',
  "arial narrow": '"Liberation Sans Narrow", "Liberation Sans", "DejaVu Sans", sans-serif',
  "helvetica": '"Liberation Sans", "Nimbus Sans", "DejaVu Sans", sans-serif',
  "courier new": '"Liberation Mono", "Cousine", "DejaVu Sans Mono", monospace',
  "courier": '"Liberation Mono", "DejaVu Sans Mono", monospace',
  "georgia": '"Liberation Serif", "DejaVu Serif", serif',
  "cambria": '"Caladea", "Liberation Serif", "DejaVu Serif", serif',
  "verdana": '"DejaVu Sans", "Liberation Sans", sans-serif',
  "tahoma": '"DejaVu Sans", "Liberation Sans", sans-serif',
  "trebuchet ms": '"DejaVu Sans", "Liberation Sans", sans-serif',
  "consolas": '"Liberation Mono", "DejaVu Sans Mono", monospace',
  "monaco": '"Liberation Mono", "DejaVu Sans Mono", monospace',
};

/**
 * Превратить имя семейства в полную CSS font-family с metric-совместимыми fallback'ами.
 * Это покрывает Linux-машины без msttcorefonts, где TNR/Arial/Calibri отсутствуют
 * и браузер ходит в serif/sans-serif с другими метриками.
 *
 * Принцип: сначала запрашиваемое семейство (вдруг оно установлено или подгружено
 * через @font-face), затем metric-clone, затем generic-family как backstop.
 */
export function resolveFontFamily(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  const trimmed = name.trim();
  if (!trimmed) return undefined;

  const fallback = FONT_FALLBACKS[trimmed.toLowerCase()];
  // Имя из DOCX часто без кавычек — добавим, если в нём есть пробел.
  const quoted = trimmed.includes(" ") ? `"${trimmed}"` : trimmed;

  if (fallback) return `${quoted}, ${fallback}`;
  // Неизвестное семейство — добавим хотя бы generic family как backstop,
  // чтобы не падать в дефолтный serif браузера для тех, у кого нет шрифта.
  return `${quoted}, sans-serif`;
}

export const FONT_SIZES = [
  8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72
];

export const COLORS = [
  { name: "Black", value: "#000000" },
  { name: "Gray", value: "#808080" },
  { name: "Red", value: "#FF0000" },
  { name: "Orange", value: "#FFA500" },
  { name: "Yellow", value: "#FFFF00" },
  { name: "Green", value: "#008000" },
  { name: "Blue", value: "#0000FF" },
  { name: "Purple", value: "#800080" },
  { name: "White", value: "#FFFFFF" },
];

// Cache for document default styles
interface DocumentDefaults {
  fontFamily: string;
  fontSize: number;
}

const documentDefaultsCache = new WeakMap<Editor, DocumentDefaults>();

// Editor с опциональным docDefaults, прокинутым извне (из загрузчика DOCX).
// При наличии этого поля у editor — оно перебивает и FALLBACK_DEFAULTS, и
// сэмплинг доминирующего шрифта по нодам (это и есть истинные defaults документа).
type EditorWithDocDefaults = Editor & {
  docDefaults?: { fontFamily?: string; fontSize?: number };
};

// Last-resort fallback для совсем пустого editor'а без прокинутых docDefaults.
// Не «лжём» про TNR: используем системный шрифт, чтобы тулбар не показывал
// несуществующий шрифт. Реальный fallback должен приходить из editor.docDefaults
// (см. setEditorDocDefaults) или из доминирующего fontFamily в нодах.
// fontSize в пикселях, чтобы соответствовать остальному коду: 11pt = 14.667px.
const FALLBACK_DEFAULTS: DocumentDefaults = {
  fontFamily: "system-ui",
  fontSize: 11 * (96 / 72),
};

// Maximum number of text nodes to sample for determining defaults
// This provides a good approximation without iterating over huge documents
const MAX_NODES_TO_SAMPLE = 100;

/**
 * Прописать docDefaults документа на editor — вызывается из загрузчика DOCX
 * после documentToSlate(). Это самый надёжный путь: парсер уже знает
 * <w:docDefaults> и реальный font документа, не нужно гадать по сэмплам.
 */
export function setEditorDocDefaults(
  editor: Editor,
  defaults: { fontFamily?: string; fontSize?: number } | null | undefined,
): void {
  const e = editor as EditorWithDocDefaults;
  if (!defaults || (!defaults.fontFamily && !defaults.fontSize)) {
    delete e.docDefaults;
  } else {
    e.docDefaults = { ...defaults };
  }
  // Cache был построен до того, как пришли реальные defaults — сбрасываем.
  documentDefaultsCache.delete(editor);
}

// Analyze document to find dominant font and size
// Optimized: samples limited nodes and uses early termination
function getDocumentDefaults(editor: Editor): DocumentDefaults {
  // Check cache first - this is the fast path
  const cached = documentDefaultsCache.get(editor);
  if (cached) return cached;

  // 1) Сначала — явные docDefaults документа (если прокинуты из загрузчика).
  //    Это перебивает и empty-document fallback, и сэмпл, потому что это
  //    единственный источник правды о шрифте «нового» текста в документе.
  //    Храним fontSize в пикселях (как и весь text-node-слой);
  //    округление к int в пунктах делает уже getActiveFontSize.
  const editorDefaults = (editor as EditorWithDocDefaults).docDefaults;
  if (editorDefaults && (editorDefaults.fontFamily || editorDefaults.fontSize)) {
    const merged: DocumentDefaults = {
      fontFamily: editorDefaults.fontFamily || FALLBACK_DEFAULTS.fontFamily,
      fontSize: editorDefaults.fontSize || FALLBACK_DEFAULTS.fontSize,
    };
    documentDefaultsCache.set(editor, merged);
    return merged;
  }

  // Check if editor has content
  if (!editor.children || editor.children.length === 0) {
    documentDefaultsCache.set(editor, FALLBACK_DEFAULTS);
    return FALLBACK_DEFAULTS;
  }

  const fontFamilyCounts = new Map<string, number>();
  const fontSizeCounts = new Map<number, number>();
  let nodesProcessed = 0;
  let totalTextLength = 0;

  // Iterate through text nodes with early termination
  for (const [node] of Node.texts(editor)) {
    // Limit number of nodes to process for performance
    if (nodesProcessed >= MAX_NODES_TO_SAMPLE) break;
    nodesProcessed++;

    const textNode = node as Text & { fontFamily?: string; fontSize?: number; text: string };
    const textLength = textNode.text.length;
    totalTextLength += textLength;
    
    if (textNode.fontFamily) {
      const current = fontFamilyCounts.get(textNode.fontFamily) || 0;
      fontFamilyCounts.set(textNode.fontFamily, current + textLength);
    }
    
    if (textNode.fontSize) {
      // Round to nearest integer for counting
      const roundedSize = Math.round(textNode.fontSize);
      const current = fontSizeCounts.get(roundedSize) || 0;
      fontSizeCounts.set(roundedSize, current + textLength);
    }
  }

  // If no styled text found, use fallback defaults
  if (fontFamilyCounts.size === 0 && fontSizeCounts.size === 0) {
    documentDefaultsCache.set(editor, FALLBACK_DEFAULTS);
    return FALLBACK_DEFAULTS;
  }

  // Find most common font family
  let dominantFont = FALLBACK_DEFAULTS.fontFamily;
  let maxFontCount = 0;
  for (const [font, count] of fontFamilyCounts) {
    if (count > maxFontCount) {
      maxFontCount = count;
      dominantFont = font;
    }
  }

  // Find most common font size
  let dominantSize = FALLBACK_DEFAULTS.fontSize;
  let maxSizeCount = 0;
  for (const [size, count] of fontSizeCounts) {
    if (count > maxSizeCount) {
      maxSizeCount = count;
      dominantSize = size;
    }
  }

  const defaults = { fontFamily: dominantFont, fontSize: dominantSize };
  documentDefaultsCache.set(editor, defaults);
  return defaults;
}

// Clear cache when document changes significantly
export function clearDocumentDefaultsCache(editor: Editor) {
  documentDefaultsCache.delete(editor);
}

export function setFontFamily(editor: Editor, fontFamily: string) {
  Editor.addMark(editor, "fontFamily", fontFamily);
}

// Внутреннее представление fontSize в text-нодах и marks — пиксели (так удобно для
// CSS-рендера в leaves: style.fontSize = "${px}px"). Но тулбар (FONT_SIZES = [8..72])
// и юзер мыслят пунктами, как в Word. Конвертация инкапсулирована здесь:
//   setFontSize(pt) → addMark(px); getActiveFontSize() → Math.round(px → pt).
// Без этой пары юзер видит «14» как 14px ≈ 10.5pt, а реальный текст 11pt ≈ 14.67px —
// получается тулбар «лжёт», и выбор «14» уменьшает шрифт.
const PIXELS_PER_POINT = 96 / 72;

export function setFontSize(editor: Editor, fontSizePt: number) {
  Editor.addMark(editor, "fontSize", fontSizePt * PIXELS_PER_POINT);
}

export function setColor(editor: Editor, color: string) {
  Editor.addMark(editor, "color", color);
}

export function setBackgroundColor(editor: Editor, backgroundColor: string) {
  Editor.addMark(editor, "backgroundColor", backgroundColor);
}

export function getActiveFontFamily(editor: Editor): string {
  const marks = Editor.marks(editor);
  if (marks?.fontFamily) return marks.fontFamily;
  
  // Fall back to document's dominant font
  return getDocumentDefaults(editor).fontFamily;
}

export function getActiveFontSize(editor: Editor): number {
  // UI работает в пунктах. text-node fontSize хранится в пикселях,
  // конвертируем px → pt и округляем для отображения в тулбаре.
  const marks = Editor.marks(editor);
  if (marks?.fontSize) {
    return Math.round(marks.fontSize / PIXELS_PER_POINT);
  }
  return Math.round(getDocumentDefaults(editor).fontSize / PIXELS_PER_POINT);
}

export function getActiveColor(editor: Editor): string {
  const marks = Editor.marks(editor);
  return marks?.color || "#000000";
}

// Get defaults for new text input
export function getDefaultMarks(editor: Editor): Record<string, unknown> {
  const defaults = getDocumentDefaults(editor);
  return {
    fontFamily: defaults.fontFamily,
    fontSize: defaults.fontSize,
  };
}

