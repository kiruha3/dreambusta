/**
 * Утилиты для текстовых сравнений в track changes.
 *
 * Это НЕ Slate-специфичный код — функции работают с обычными строками
 * и легко тестируются без editor-mock'ов. Вынесены отдельно из
 * `trackChanges.ts`, чтобы:
 *   1. Убрать дублирование (см. P1.4 в плане).
 *   2. Сделать алгоритм нормализации единственной точкой правды
 *      (раньше встречался 4 раза в двух местах, легко разойтись).
 *   3. Дать unit-тесты на чистую логику без Node.texts() и Transforms.
 */

/**
 * Нормализация whitespace для fuzzy text-matching.
 *
 * Делает три вещи:
 *  - убирает pipe-разделители `|` (LLM иногда добавляет их в `original_text`
 *    для разметки границ фрагментов),
 *  - схлопывает любую последовательность whitespace-символов в один пробел,
 *  - обрезает trailing/leading пробелы.
 *
 * Используется при поиске оригинального текста в документе, когда
 * exact-match (с сохранением исходных пробелов) не сработал — например,
 * Slate мог разнести текст по нескольким text-узлам с разной разбивкой
 * пробелов, или DOCX импорт нормализовал пробелы.
 */
/**
 * Сворачивает типографические варианты к каноническим ASCII-формам для
 * fuzzy-matching: умные/ёлочные кавычки (« » " " „ ‟ ″) → ", одиночные
 * (' ' ‚ ‛ ′ `) → ', тире (em/en/figure/minus/hyphen ‐‑‒–—―−) → -.
 *
 * Замена строго 1:1 — длину НЕ меняет. Это критично: positional-mapping в
 * `applyTextReplacement`/`findTextAcrossNodes` считает индексы normalized↔
 * original посимвольно (с поправкой только на whitespace-collapse). Любое
 * length-changing преобразование сломало бы маппинг.
 *
 * Баг #3: модель эмитит `original_text` с прямыми кавычками/дефисом, а DOCX-
 * договоры содержат « » и —/– → exact- и whitespace-normalized поиск мажут,
 * suggestion не применяется («Текст не найден»).
 */
export function normalizeTypography(text: string): string {
  return text
    .replace(/[«»“”„‟″]/g, '"')
    .replace(/[‘’‚‛′`]/g, "'")
    .replace(/[‐‑‒–—―−]/g, "-");
}

export function normalizeWhitespace(text: string): string {
  return normalizeTypography(text)
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Та же нормализация, но БЕЗ trim — для случаев, когда нужно сохранить
 * позиционные индексы относительно исходной строки (нельзя сдвигать
 * начало). Применяется к содержимому документа в `findTextAcrossNodes`.
 */
export function collapseWhitespace(text: string): string {
  return normalizeTypography(text).replace(/\s+/g, ' ');
}
