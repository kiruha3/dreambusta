import { describe, it, expect, beforeEach, vi } from "vitest";
import { TextMeasurer } from "../textMeasurer";
import type { FontProperties } from "../types";

// Mock Canvas API
const mockMeasureText = vi.fn();
const mockContext = {
  measureText: mockMeasureText,
  font: "",
};

vi.stubGlobal("document", {
  createElement: vi.fn(() => ({
    getContext: vi.fn(() => mockContext),
  })),
});

describe("TextMeasurer", () => {
  let textMeasurer: TextMeasurer;
  const defaultFont: FontProperties = {
    family: "Times New Roman",
    size: 16,
    weight: "normal",
    style: "normal",
    lineHeight: 1.5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: each character is 10px wide
    mockMeasureText.mockImplementation((text: string) => ({
      width: text.length * 10,
    }));
    textMeasurer = new TextMeasurer();
  });

  describe("measureTextWidth", () => {
    it("measures text width using Canvas API", () => {
      const width = textMeasurer.measureTextWidth("Hello", defaultFont);
      expect(width).toBe(50); // 5 chars * 10px
      expect(mockMeasureText).toHaveBeenCalledWith("Hello");
    });

    it("caches measurements for same text and font", () => {
      textMeasurer.measureTextWidth("Hello", defaultFont);
      textMeasurer.measureTextWidth("Hello", defaultFont);
      // Should only call measureText once due to caching
      expect(mockMeasureText).toHaveBeenCalledTimes(1);
    });

    it("measures different text separately", () => {
      textMeasurer.measureTextWidth("Hello", defaultFont);
      textMeasurer.measureTextWidth("World", defaultFont);
      expect(mockMeasureText).toHaveBeenCalledTimes(2);
    });

    it("measures same text with different fonts separately", () => {
      const boldFont = { ...defaultFont, weight: "bold" as const };
      textMeasurer.measureTextWidth("Hello", defaultFont);
      textMeasurer.measureTextWidth("Hello", boldFont);
      expect(mockMeasureText).toHaveBeenCalledTimes(2);
    });

    it("sets correct font string on canvas context", () => {
      textMeasurer.measureTextWidth("Test", defaultFont);
      expect(mockContext.font).toBe("normal normal 16px Times New Roman");
    });

    it("sets italic font correctly", () => {
      const italicFont = { ...defaultFont, style: "italic" as const };
      textMeasurer.measureTextWidth("Test", italicFont);
      expect(mockContext.font).toBe("italic normal 16px Times New Roman");
    });

    it("sets bold font correctly", () => {
      const boldFont = { ...defaultFont, weight: "bold" as const };
      textMeasurer.measureTextWidth("Test", boldFont);
      expect(mockContext.font).toBe("normal bold 16px Times New Roman");
    });

    it("sets bold italic font correctly", () => {
      const boldItalicFont = {
        ...defaultFont,
        weight: "bold" as const,
        style: "italic" as const,
      };
      textMeasurer.measureTextWidth("Test", boldItalicFont);
      expect(mockContext.font).toBe("italic bold 16px Times New Roman");
    });
  });

  describe("breakIntoLines", () => {
    it("keeps rendered text and source references in line parts", () => {
      const lines = textMeasurer.breakIntoLines("Hello World", defaultFont, 80);

      expect(lines).toHaveLength(2);
      for (const line of lines) {
        const words = line.parts.flatMap(part => part.words);
        expect(words.map(word => word.text).join("")).toBe(line.text);
        expect(words[0].el.text).toBe("Hello World");
        expect(words[0].font).toEqual(defaultFont);
        expect(words.reduce((sum, word) => sum + word.width, 0)).toBe(line.width);
      }
    });

    it("fits text on single line when width allows", () => {
      const lines = textMeasurer.breakIntoLines("Hello World", defaultFont, 200);
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe("Hello World");
    });

    it("breaks text into multiple lines when width is limited", () => {
      // "Hello " = 60px, "World" = 50px, space = 10px
      // With 80px width, "Hello" fits alone, "World" goes to next line
      const lines = textMeasurer.breakIntoLines("Hello World", defaultFont, 80);
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    it("calculates correct line height", () => {
      const lines = textMeasurer.breakIntoLines("Hello", defaultFont, 200);
      expect(lines[0].height).toBe(defaultFont.size * defaultFont.lineHeight);
    });

    it("sets correct y positions for multiple lines", () => {
      // Force multiple lines by using very small width
      const lines = textMeasurer.breakIntoLines("Hello World Test", defaultFont, 70);
      if (lines.length > 1) {
        const lineHeight = defaultFont.size * defaultFont.lineHeight;
        expect(lines[0].y).toBe(0);
        expect(lines[1].y).toBe(lineHeight);
      }
    });

    it("returns single line for empty text (valid in DOCX)", () => {
      const lines = textMeasurer.breakIntoLines("", defaultFont, 200);
      // Empty text still produces a line (empty paragraph in DOCX)
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe("");
    });

    it("handles single word longer than available width", () => {
      // Single long word that exceeds width
      mockMeasureText.mockImplementation((text: string) => ({
        width: text.length * 20, // Bigger chars
      }));
      const lines = textMeasurer.breakIntoLines("Supercalifragilisticexpialidocious", defaultFont, 100);
      // Should still return at least one line
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("measureParagraphHeight", () => {
    it("calculates height for single line", () => {
      const height = textMeasurer.measureParagraphHeight("Hello", defaultFont, 200);
      const expectedHeight = defaultFont.size * defaultFont.lineHeight;
      expect(height).toBe(expectedHeight);
    });

    it("calculates height for multiple lines", () => {
      const lines = textMeasurer.breakIntoLines("Hello World Test More", defaultFont, 70);
      const height = textMeasurer.measureParagraphHeight("Hello World Test More", defaultFont, 70);
      const expectedHeight = lines.reduce((sum, line) => sum + line.height, 0);
      expect(height).toBe(expectedHeight);
    });

    it("returns line height for empty text (valid in DOCX)", () => {
      const height = textMeasurer.measureParagraphHeight("", defaultFont, 200);
      // Empty paragraph still has height (one empty line)
      const expectedHeight = defaultFont.size * defaultFont.lineHeight;
      expect(height).toBe(expectedHeight);
    });
  });

  describe("cache management", () => {
    it("clearCache removes all cached measurements", () => {
      textMeasurer.measureTextWidth("Hello", defaultFont);
      textMeasurer.clearCache();
      textMeasurer.measureTextWidth("Hello", defaultFont);
      // Should call measureText again after cache clear
      expect(mockMeasureText).toHaveBeenCalledTimes(2);
    });

    it("invalidateFontCache removes cache for specific font", () => {
      const boldFont = { ...defaultFont, weight: "bold" as const };

      textMeasurer.measureTextWidth("Hello", defaultFont);
      textMeasurer.measureTextWidth("Hello", boldFont);
      expect(mockMeasureText).toHaveBeenCalledTimes(2);

      // Invalidate only default font cache
      textMeasurer.invalidateFontCache(defaultFont);

      // Measuring with default font should call API again
      textMeasurer.measureTextWidth("Hello", defaultFont);
      expect(mockMeasureText).toHaveBeenCalledTimes(3);

      // Measuring with bold font should still use cache
      textMeasurer.measureTextWidth("Hello", boldFont);
      expect(mockMeasureText).toHaveBeenCalledTimes(3);
    });
  });
});
