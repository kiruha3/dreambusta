// Text measurement engine using Canvas API

import type { FontProperties, TextLine, TextLinePart, TextRun, LineFlowRangesProvider, FlowRange, DocumentElement, TextElement } from './types';

export class TextMeasurer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private measurementCache: Map<string, number> = new Map();

  constructor() {
    // Create offscreen canvas for measurements
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context for text measurement');
    }
    this.context = ctx;
  }

  /**
   * Measure width of text
   */
  measureTextWidth(text: string, font: FontProperties): number {
    const cacheKey = `${text}-${this.getFontKey(font)}`;
    
    if (this.measurementCache.has(cacheKey)) {
      return this.measurementCache.get(cacheKey)!;
    }

    this.context.font = this.getFontString(font);
    const width = this.context.measureText(text).width;
    
    this.measurementCache.set(cacheKey, width);
    return width;
  }

  /**
   * Break text into lines that fit within available width
   * Creates a single part per line (for simple text without runs)
   */
  breakIntoLines(
    text: string,
    font: FontProperties,
    availableWidth: number
  ): TextLine[] {
    const words = text.split(' ');
    const lines: TextLine[] = [];
    let currentLine: string[] = [];
    let currentLineWidth = 0;
    const lineHeight = font.size * font.lineHeight;
    let currentY = 0;

    // Create a dummy run for simple text (no actual run reference)
    const dummyRun: TextRun = {
      id: 'dummy',
      text: text,
      font: font
    };

    for (const word of words) {
      const wordWidth = this.measureTextWidth(word + ' ', font);
      const testWidth = currentLineWidth + wordWidth;

      if (testWidth <= availableWidth && currentLine.length > 0) {
        // Word fits on current line
        currentLine.push(word);
        currentLineWidth = testWidth;
      } else {
        // Start new line
        if (currentLine.length > 0) {
          const lineText = currentLine.join(' ');
          lines.push({
            element: { id: '', type: 'paragraph' }, // Dummy element for simple text
            x: 0, // Will be set by layout
            y: currentY,
            width: currentLineWidth - this.measureTextWidth(' ', font), // Remove trailing space
            height: lineHeight,
            text: lineText,
            parts: [this.createLinePart(lineText, font,
              currentLineWidth - this.measureTextWidth(' ', font), dummyRun)]
          });
          currentY += lineHeight;
        }
        currentLine = [word];
        currentLineWidth = this.measureTextWidth(word + ' ', font);
      }
    }

    // Add remaining line
    if (currentLine.length > 0) {
      const lineText = currentLine.join(' ');
      lines.push({
        element: { id: '', type: 'paragraph' }, // Dummy element for simple text
        x: 0,
        y: currentY,
        width: this.measureTextWidth(lineText, font),
        height: lineHeight,
        text: lineText,
        parts: [this.createLinePart(lineText, font, this.measureTextWidth(lineText, font), dummyRun)]
      });
    }

    return lines;
  }

  private createLinePart(text: string, font: FontProperties, width: number, run: TextRun, x = 0): TextLinePart {
    const el: TextElement = { id: run.id, type: 'text', text: run.text };
    return {
      x, width, text, font, el,
      words: [{ x: 0, width, text, font, el }],
    };
  }

  /**
   * Break paragraph with runs into lines that fit within available width
   * Handles runs with different fonts within the same paragraph
   * Returns lines with parts, where each part is linked to its source run
   * This allows parts of a run to be split across multiple lines
   * 
   * @param availableWidth - Either fixed width (number) or function that returns width for given Y coordinate
   * @param element - Optional source element (for LaidOutRegion)
   * @param pageNumber - Optional page number (for LaidOutRegion)
   */
  breakRunsIntoLines(
    runs: TextRun[],
    defaultFont: FontProperties,
    lineWidth: number,
    lineFlowRangesProvider: LineFlowRangesProvider,
    addLine: (line: TextLine) => void,
    getLineY: () => number,
    element: DocumentElement,
  ): TextLine[] {
    const lines: TextLine[] = [];

    let assembledPartWords: string[] = [];
    let assembledPartLineRelativeX = 0;

    let assembledLineParts: TextLinePart[] = [];
    let assembledLineHeight = defaultFont.size * defaultFont.lineHeight;
    
    // Current flow ranges tracking
    let assembledLineFlowRanges: FlowRange[] = [];
    let assembledLineCurrentFlowRangeIndex = 0;
    let assembledLineCurrentFlowRangeRemainingWidth = 0;

    const initializeAssembledLineFlowRange = () => {
      assembledLineCurrentFlowRangeRemainingWidth = assembledLineFlowRanges[assembledLineCurrentFlowRangeIndex].width;
    }

    const initializeAssembledLineFlowRanges = () => {
      assembledLineFlowRanges = lineFlowRangesProvider(getLineY(), assembledLineHeight);
      assembledLineCurrentFlowRangeIndex = 0;
    }

    const initializeLinePart = (startX: number) => {
      assembledPartLineRelativeX = startX;
      assembledPartWords = [];
    }

    const finalizeLinePart = (run: TextRun, runFont: FontProperties) => {
      if (assembledPartWords.length > 0) {
        const currentFlowRange = assembledLineFlowRanges[assembledLineCurrentFlowRangeIndex];
        const partWidth = currentFlowRange.width - assembledLineCurrentFlowRangeRemainingWidth 
          - assembledPartLineRelativeX + currentFlowRange.x;
        assembledLineParts.push(this.createLinePart(
          assembledPartWords.join(' '), runFont, partWidth, run, assembledPartLineRelativeX
        ));
        return partWidth;
      } else {
        return 0;
      }
    }

    const initializeFlowLine = (font: FontProperties) => {
      assembledLineHeight = font.size * font.lineHeight;
    }

    const finalizeFlowLine = () => {
      if (assembledLineParts.length > 0) {
        addLine({
          element: element,
          x: 0,
          y: getLineY(),
          width: lineWidth,
          height: assembledLineHeight,
          text: assembledLineParts.map(part => part.text).join(''),
          parts: [...assembledLineParts],
        });
      }

      assembledLineParts = [];
      assembledLineHeight = 0;
    }

    // Process all runs
    for (let currentRunIndex = 0; currentRunIndex < runs.length; currentRunIndex++) {
      const run = runs[currentRunIndex];
      const runFont = run.font || defaultFont;
      const runWords = run.text.split(' ');
      const runSpaceTextWidth = this.measureTextWidth(' ', runFont);

      // Update line height if this run has larger font
      const runLineHeight = runFont.size * runFont.lineHeight;
      if (runLineHeight > assembledLineHeight) {
        initializeFlowLine(runFont);
      }

      // Get flow ranges for current line
      if (assembledLineFlowRanges.length === 0) {
        initializeAssembledLineFlowRanges();
        initializeAssembledLineFlowRange();
        initializeLinePart(assembledLineFlowRanges[0].x);
      }

      // Process words from current run
      for (let currentRunWordIndex = 0; currentRunWordIndex < runWords.length; currentRunWordIndex++) {
        const word = runWords[currentRunWordIndex];
        const wordWidth = this.measureTextWidth(word, runFont);
        const spaceWidth = assembledPartWords.length > 0 ? runSpaceTextWidth : 0;
        const testWidth = wordWidth + spaceWidth;

        if (testWidth > assembledLineCurrentFlowRangeRemainingWidth) {
          finalizeLinePart(run, runFont);

          while (testWidth > assembledLineCurrentFlowRangeRemainingWidth) {
            assembledLineCurrentFlowRangeIndex++;
            if (assembledLineCurrentFlowRangeIndex >= assembledLineFlowRanges.length) {
              finalizeFlowLine();
              initializeFlowLine(runFont);
              initializeAssembledLineFlowRanges();
            }
            initializeAssembledLineFlowRange();
          }
          initializeLinePart(assembledLineFlowRanges[assembledLineCurrentFlowRangeIndex].x);
        }

        assembledPartWords.push(word);
        assembledLineCurrentFlowRangeRemainingWidth -= (wordWidth + spaceWidth);
      }

      // Finalize remaining words in current part
      if (assembledPartWords.length > 0) {
        const partWidth = finalizeLinePart(run, runFont);
        initializeLinePart(assembledPartLineRelativeX + partWidth);
      }
    }

    // finalize last line
    if (assembledLineParts.length > 0) {
      finalizeFlowLine();
    }

    return lines;
  }

  /**
   * Measure paragraph height
   */
  measureParagraphHeight(
    text: string,
    font: FontProperties,
    availableWidth: number
  ): number {
    const lines = this.breakIntoLines(text, font, availableWidth);
    return lines.reduce((sum, line) => sum + line.height, 0);
  }

  /**
   * Get font string for canvas context
   */
  private getFontString(font: FontProperties): string {
    const style = font.style === 'italic' ? 'italic' : 'normal';
    const weight = font.weight === 'bold' ? 'bold' : 'normal';
    return `${style} ${weight} ${font.size}px ${font.family}`;
  }

  /**
   * Get cache key for font
   */
  private getFontKey(font: FontProperties): string {
    return `${font.family}-${font.size}-${font.weight}-${font.style}-${font.lineHeight}`;
  }

  /**
   * Check if two fonts are equal
   */
  private fontsEqual(font1: FontProperties, font2: FontProperties): boolean {
    return font1.family === font2.family &&
           font1.size === font2.size &&
           font1.weight === font2.weight &&
           font1.style === font2.style &&
           font1.lineHeight === font2.lineHeight;
  }

  /**
   * Clear measurement cache
   */
  clearCache(): void {
    this.measurementCache.clear();
  }

  /**
   * Invalidate cache for specific font
   */
  invalidateFontCache(font: FontProperties): void {
    const fontKey = this.getFontKey(font);
    const keysToDelete: string[] = [];
    
    for (const key of this.measurementCache.keys()) {
      if (key.endsWith(fontKey)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.measurementCache.delete(key));
  }
}

