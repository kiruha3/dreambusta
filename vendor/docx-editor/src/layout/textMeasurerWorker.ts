// Text measurement engine for Web Workers using character width tables
// This version doesn't require Canvas API

import type { FontProperties, TextLine, TextElement, DocumentElement } from './types';

/**
 * Character width data structure
 * Maps character codes to their widths in pixels for a specific font
 */
export interface FontMetrics {
  fontKey: string;
  characterWidths: Map<number, number>; // charCode -> width
  averageWidth: number;
  spaceWidth: number;
  defaultWidth: number; // For unmapped characters
}

/**
 * Font metrics cache
 */
class FontMetricsCache {
  private metrics: Map<string, FontMetrics> = new Map();

  set(fontKey: string, metrics: FontMetrics): void {
    this.metrics.set(fontKey, metrics);
  }

  get(fontKey: string): FontMetrics | undefined {
    return this.metrics.get(fontKey);
  }

  has(fontKey: string): boolean {
    return this.metrics.has(fontKey);
  }

  clear(): void {
    this.metrics.clear();
  }
}

export class TextMeasurerWorker {
  private metricsCache: FontMetricsCache = new FontMetricsCache();
  private measurementCache: Map<string, number> = new Map();

  /**
   * Initialize font metrics from pre-computed data
   * This should be called from main thread with measured data
   */
  initializeFontMetrics(fontKey: string, metrics: FontMetrics): void {
    this.metricsCache.set(fontKey, metrics);
  }

  /**
   * Measure text width using character width tables
   */
  measureTextWidth(text: string, font: FontProperties): number {
    const cacheKey = `${text}-${this.getFontKey(font)}`;
    
    if (this.measurementCache.has(cacheKey)) {
      return this.measurementCache.get(cacheKey)!;
    }

    const fontKey = this.getFontKey(font);
    const metrics = this.metricsCache.get(fontKey);

    if (!metrics) {
      // Fallback: use average width estimation
      return this.estimateTextWidth(text, font);
    }

    // Calculate width by summing character widths
    let totalWidth = 0;
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const charWidth = metrics.characterWidths.get(charCode) || metrics.defaultWidth;
      totalWidth += charWidth;
    }

    this.measurementCache.set(cacheKey, totalWidth);
    return totalWidth;
  }

  /**
   * Break text into lines that fit within available width
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
    const source: TextElement = { id: 'worker-text', type: 'text', text };
    const element: DocumentElement = { id: 'worker-paragraph', type: 'paragraph', children: [source] };
    const createLine = (lineText: string, width: number): TextLine => ({
      text: lineText, width, height: lineHeight, x: 0, y: currentY, element,
      parts: [{
        x: 0, width, text: lineText, font, el: source,
        words: [{ x: 0, width, text: lineText, font, el: source }],
      }],
    });

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
          lines.push(createLine(lineText, currentLineWidth - this.measureTextWidth(' ', font)));
          currentY += lineHeight;
        }
        currentLine = [word];
        currentLineWidth = this.measureTextWidth(word + ' ', font);
      }
    }

    // Add remaining line
    if (currentLine.length > 0) {
      const lineText = currentLine.join(' ');
      lines.push(createLine(lineText, this.measureTextWidth(lineText, font)));
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
   * Estimate text width using average character width
   * Used as fallback when font metrics not available
   */
  private estimateTextWidth(text: string, font: FontProperties): number {
    // Rough estimation: average character width is ~60% of font size
    const avgCharWidth = font.size * 0.6;
    return text.length * avgCharWidth;
  }

  /**
   * Get font key for caching
   */
  private getFontKey(font: FontProperties): string {
    return `${font.family}-${font.size}-${font.weight}-${font.style}-${font.lineHeight}`;
  }

  /**
   * Clear measurement cache
   */
  clearCache(): void {
    this.measurementCache.clear();
  }

  /**
   * Clear font metrics
   */
  clearFontMetrics(): void {
    this.metricsCache.clear();
  }
}

/**
 * Helper to generate font metrics from Canvas measurements
 * This runs in main thread and generates data for worker
 */
export class FontMetricsGenerator {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context');
    }
    this.context = ctx;
  }

  /**
   * Generate font metrics for a font
   * Measures all printable ASCII characters and common Unicode ranges
   */
  generateFontMetrics(font: FontProperties): FontMetrics {
    const fontString = this.getFontString(font);
    this.context.font = fontString;

    const characterWidths = new Map<number, number>();
    let totalWidth = 0;
    let charCount = 0;

    // Measure printable ASCII (32-126)
    for (let i = 32; i <= 126; i++) {
      const char = String.fromCharCode(i);
      const width = this.context.measureText(char).width;
      characterWidths.set(i, width);
      totalWidth += width;
      charCount++;
    }

    // Measure common Unicode ranges (optional, for better coverage)
    // Latin Extended-A (192-255)
    for (let i = 192; i <= 255; i++) {
      try {
        const char = String.fromCharCode(i);
        const width = this.context.measureText(char).width;
        characterWidths.set(i, width);
        totalWidth += width;
        charCount++;
      } catch (e) {
        // Skip invalid characters
      }
    }

    const averageWidth = charCount > 0 ? totalWidth / charCount : font.size * 0.6;
    const spaceWidth = characterWidths.get(32) || averageWidth;
    const defaultWidth = averageWidth;

    return {
      fontKey: this.getFontKey(font),
      characterWidths,
      averageWidth,
      spaceWidth,
      defaultWidth
    };
  }

  /**
   * Generate metrics for multiple fonts at once
   */
  generateMultipleFontMetrics(fonts: FontProperties[]): Map<string, FontMetrics> {
    const metricsMap = new Map<string, FontMetrics>();
    
    for (const font of fonts) {
      const metrics = this.generateFontMetrics(font);
      metricsMap.set(metrics.fontKey, metrics);
    }
    
    return metricsMap;
  }

  private getFontString(font: FontProperties): string {
    const style = font.style === 'italic' ? 'italic' : 'normal';
    const weight = font.weight === 'bold' ? 'bold' : 'normal';
    return `${style} ${weight} ${font.size}px ${font.family}`;
  }

  private getFontKey(font: FontProperties): string {
    return `${font.family}-${font.size}-${font.weight}-${font.style}-${font.lineHeight}`;
  }
}

