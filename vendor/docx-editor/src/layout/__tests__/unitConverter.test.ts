import { describe, it, expect } from "vitest";
import { UnitConverter } from "../unitConverter";

describe("UnitConverter", () => {
  const DEFAULT_DPI = 96;

  describe("twipsToPixels", () => {
    it("converts 1440 twips (1 inch) to 96 pixels at 96 DPI", () => {
      expect(UnitConverter.twipsToPixels(1440)).toBe(96);
    });

    it("converts 0 twips to 0 pixels", () => {
      expect(UnitConverter.twipsToPixels(0)).toBe(0);
    });

    it("converts 720 twips (0.5 inch) to 48 pixels", () => {
      expect(UnitConverter.twipsToPixels(720)).toBe(48);
    });

    it("handles custom DPI", () => {
      expect(UnitConverter.twipsToPixels(1440, 72)).toBe(72);
    });

    it("converts negative values correctly", () => {
      expect(UnitConverter.twipsToPixels(-1440)).toBe(-96);
    });
  });

  describe("twipsToPoints", () => {
    it("converts 20 twips to 1 point", () => {
      expect(UnitConverter.twipsToPoints(20)).toBe(1);
    });

    it("converts 240 twips to 12 points", () => {
      expect(UnitConverter.twipsToPoints(240)).toBe(12);
    });

    it("converts 0 twips to 0 points", () => {
      expect(UnitConverter.twipsToPoints(0)).toBe(0);
    });
  });

  describe("pointsToPixels", () => {
    it("converts 72 points (1 inch) to 96 pixels at 96 DPI", () => {
      expect(UnitConverter.pointsToPixels(72)).toBe(96);
    });

    it("converts 12 points to 16 pixels", () => {
      expect(UnitConverter.pointsToPixels(12)).toBe(16);
    });

    it("converts 0 points to 0 pixels", () => {
      expect(UnitConverter.pointsToPixels(0)).toBe(0);
    });

    it("handles custom DPI", () => {
      expect(UnitConverter.pointsToPixels(72, 72)).toBe(72);
    });
  });

  describe("halfPointsToPixels", () => {
    it("converts 24 half-points (12pt) to 16 pixels", () => {
      expect(UnitConverter.halfPointsToPixels(24)).toBe(16);
    });

    it("converts 22 half-points (11pt) to ~14.67 pixels", () => {
      const result = UnitConverter.halfPointsToPixels(22);
      expect(result).toBeCloseTo(14.67, 1);
    });

    it("converts 0 half-points to 0 pixels", () => {
      expect(UnitConverter.halfPointsToPixels(0)).toBe(0);
    });

    it("handles common font sizes", () => {
      // 10pt = 20 half-points
      expect(UnitConverter.halfPointsToPixels(20)).toBeCloseTo(13.33, 1);
      // 14pt = 28 half-points
      expect(UnitConverter.halfPointsToPixels(28)).toBeCloseTo(18.67, 1);
    });
  });

  describe("emuToPixels", () => {
    it("converts 914400 EMU (1 inch) to 96 pixels", () => {
      expect(UnitConverter.emuToPixels(914400)).toBe(96);
    });

    it("converts 0 EMU to 0 pixels", () => {
      expect(UnitConverter.emuToPixels(0)).toBe(0);
    });

    it("converts 457200 EMU (0.5 inch) to 48 pixels", () => {
      expect(UnitConverter.emuToPixels(457200)).toBe(48);
    });
  });

  describe("getDefaultPageSize", () => {
    it("returns US Letter size (8.5 x 11 inches) at 96 DPI", () => {
      const size = UnitConverter.getDefaultPageSize();
      expect(size.width).toBe(8.5 * DEFAULT_DPI); // 816
      expect(size.height).toBe(11 * DEFAULT_DPI); // 1056
    });

    it("respects custom DPI", () => {
      const size = UnitConverter.getDefaultPageSize(72);
      expect(size.width).toBe(8.5 * 72); // 612
      expect(size.height).toBe(11 * 72); // 792
    });
  });

  describe("getDefaultMargins", () => {
    it("returns 1 inch margins at 96 DPI", () => {
      const margins = UnitConverter.getDefaultMargins();
      expect(margins.top).toBe(DEFAULT_DPI);
      expect(margins.bottom).toBe(DEFAULT_DPI);
      expect(margins.left).toBe(DEFAULT_DPI);
      expect(margins.right).toBe(DEFAULT_DPI);
    });

    it("respects custom DPI", () => {
      const margins = UnitConverter.getDefaultMargins(72);
      expect(margins.top).toBe(72);
      expect(margins.bottom).toBe(72);
      expect(margins.left).toBe(72);
      expect(margins.right).toBe(72);
    });
  });
});
