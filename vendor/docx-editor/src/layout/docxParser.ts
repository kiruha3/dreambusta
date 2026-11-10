// Parser to convert mammoth HTML output to layout engine format

import type { Paragraph, FontProperties } from './types';
import { UnitConverter } from './unitConverter';

/**
 * Parse HTML from mammoth into paragraphs
 * This is a basic implementation - can be extended
 */
export function parseMammothHtml(html: string): Paragraph[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const paragraphs: Paragraph[] = [];
  let paragraphId = 0;

  // Get all paragraph elements
  const pElements = doc.querySelectorAll('p');

  pElements.forEach((p) => {
    const text = p.textContent || '';
    
    if (text.trim().length === 0) {
      return; // Skip empty paragraphs
    }

    // Extract font properties from computed styles or defaults
    const font: FontProperties = {
      family: getComputedFontFamily(p) || 'Times New Roman',
      size: getComputedFontSize(p) || UnitConverter.pointsToPixels(12),
      weight: getComputedFontWeight(p) || 'normal',
      style: getComputedFontStyle(p) || 'normal',
      lineHeight: getComputedLineHeight(p) || 1.5
    };

    // Extract spacing (basic - can be improved)
    const spacing = {
      before: 0,
      after: 0
    };

    paragraphs.push({
      id: `p-${paragraphId++}`,
      text: text,
      font,
      spacing,
      alignment: getComputedAlignment(p) || 'left'
    });
  });

  return paragraphs;
}

/**
 * Helper functions to extract styles
 */
function getComputedFontFamily(element: HTMLElement): string | null {
  // Try to get from style attribute or computed style
  const style = element.getAttribute('style');
  if (style) {
    const match = style.match(/font-family:\s*([^;]+)/);
    if (match) return match[1].trim().replace(/['"]/g, '');
  }
  return null;
}

function getComputedFontSize(element: HTMLElement): number | null {
  const style = element.getAttribute('style');
  if (style) {
    const match = style.match(/font-size:\s*([^;]+)/);
    if (match) {
      const sizeStr = match[1].trim();
      // Handle px, pt, em, etc.
      if (sizeStr.endsWith('px')) {
        return parseFloat(sizeStr);
      } else if (sizeStr.endsWith('pt')) {
        return UnitConverter.pointsToPixels(parseFloat(sizeStr));
      }
    }
  }
  return null;
}

function getComputedFontWeight(element: HTMLElement): 'normal' | 'bold' {
  const style = element.getAttribute('style');
  if (style) {
    if (style.includes('font-weight: bold') || style.includes('font-weight:bold')) {
      return 'bold';
    }
  }
  // Check for <strong> or <b> tags
  if (element.querySelector('strong, b')) {
    return 'bold';
  }
  return 'normal';
}

function getComputedFontStyle(element: HTMLElement): 'normal' | 'italic' {
  const style = element.getAttribute('style');
  if (style) {
    if (style.includes('font-style: italic') || style.includes('font-style:italic')) {
      return 'italic';
    }
  }
  // Check for <em> or <i> tags
  if (element.querySelector('em, i')) {
    return 'italic';
  }
  return 'normal';
}

function getComputedLineHeight(element: HTMLElement): number | null {
  const style = element.getAttribute('style');
  if (style) {
    const match = style.match(/line-height:\s*([^;]+)/);
    if (match) {
      const lh = match[1].trim();
      // Handle numeric values (multipliers) or px values
      const num = parseFloat(lh);
      if (!isNaN(num)) {
        return num;
      }
    }
  }
  return null;
}

function getComputedAlignment(element: HTMLElement): 'left' | 'center' | 'right' | 'justify' | null {
  const style = element.getAttribute('style');
  if (style) {
    if (style.includes('text-align: center') || style.includes('text-align:center')) {
      return 'center';
    }
    if (style.includes('text-align: right') || style.includes('text-align:right')) {
      return 'right';
    }
    if (style.includes('text-align: justify') || style.includes('text-align:justify')) {
      return 'justify';
    }
  }
  return 'left';
}

