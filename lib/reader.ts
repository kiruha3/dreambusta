export type Token = { text: string; paragraph: number; index: number };
export function tokenize(paragraphs: string[]): Token[] {
  const result: Token[] = [];
  paragraphs.forEach((p, paragraph) => {
    for (const text of p.match(/\S+/gu) ?? []) result.push({ text, paragraph, index: result.length });
  });
  return result;
}
export function splitFocus(word: string) {
  const chars = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word), item => item.segment);
  const letters = chars.flatMap((c, i) => /[\p{L}\p{N}]/u.test(c) ? [i] : []);
  const position = letters.length ? letters[Math.min(letters.length - 1, letters.length <= 1 ? 0 : letters.length <= 5 ? 1 : letters.length <= 9 ? 2 : letters.length <= 13 ? 3 : 4)] : 0;
  return { before: chars.slice(0, position).join(''), focus: chars[position] ?? '', after: chars.slice(position + 1).join('') };
}
export function speedForDrag(initialSpeed: number, dy: number) {
  return Math.round(Math.min(1200, Math.max(60, initialSpeed - dy * 25 / 24)));
}
export function wordDelay(word: string, wpm: number, endParagraph: boolean) {
  const punctuation = /[.!?…][»”"')\]]*$/u.test(word) ? 1.75 : /[,;:][»”"')\]]*$/u.test(word) ? 1.3 : 1;
  return (60000 / Math.max(60, wpm)) * Math.max(punctuation, endParagraph ? 1.9 : 1);
}
export function remainingWordTime(interval: number, startedAt: number, now: number) {
  return Math.max(0, interval - Math.max(0, now - startedAt));
}
export function fitFocusFont(availableWidth: number, beforeWidth: number, focusWidth: number, afterWidth: number, measuredFont: number, maxFont: number) {
  const extent = Math.max(beforeWidth, afterWidth) + focusWidth / 2;
  return extent > 0 ? Math.max(1, Math.min(maxFont, measuredFont * Math.max(1, availableWidth) / (2 * extent))) : maxFont;
}
export function restoreProgress(raw: string | null, wordCount: number): { index: number; speed: number } {
  try {
    const p = JSON.parse(raw ?? '{}');
    const index = Number.isFinite(p?.index) ? Math.floor(p.index) : 0;
    const speed = Number.isFinite(p?.speed) ? p.speed : 300;
    return { index: Math.max(0, Math.min(Math.max(0, wordCount - 1), index)), speed: Math.max(60, Math.min(1200, speed)) };
  } catch { return { index: 0, speed: 300 }; }
}
