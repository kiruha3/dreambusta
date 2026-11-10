// Unit converter for DOCX measurements
// DOCX uses twips (1/20th of a point, 1/1440th of an inch)

export class UnitConverter {
  private static readonly TWIPS_PER_INCH = 1440;
  private static readonly TWIPS_PER_POINT = 20;
  private static readonly DEFAULT_DPI = 96; // Standard screen DPI

  /**
   * Convert twips to pixels
   * @param twips - Value in twips
   * @param dpi - Dots per inch (default: 96)
   */
  static twipsToPixels(twips: number, dpi: number = this.DEFAULT_DPI): number {
    const inches = twips / this.TWIPS_PER_INCH;
    return inches * dpi;
  }

  /**
   * Convert twips to points
   */
  static twipsToPoints(twips: number): number {
    return twips / this.TWIPS_PER_POINT;
  }

  /**
   * Convert points to pixels
   */
  static pointsToPixels(points: number, dpi: number = this.DEFAULT_DPI): number {
    const inches = points / 72; // 72 points per inch
    return inches * dpi;
  }

  /**
   * Convert half-points to pixels
   * DOCX w:sz stores font size in half-points (1 point = 2 half-points)
   * @param halfPoints - Value in half-points
   * @param dpi - Dots per inch (default: 96)
   */
  static halfPointsToPixels(halfPoints: number, dpi: number = this.DEFAULT_DPI): number {
    const points = halfPoints / 2; // Convert half-points to points
    const pixels = this.pointsToPixels(points, dpi);
    // Round to 1 decimal place for cleaner font sizes
    return Math.round(pixels * 10) / 10;
  }

  /**
   * Convert EMU (English Metric Units) to pixels
   * Used for some DOCX measurements
   */
  static emuToPixels(emu: number, dpi: number = this.DEFAULT_DPI): number {
    const inches = emu / 914400; // 1 inch = 914400 EMU
    return inches * dpi;
  }

  /**
   * Convert pixels to twips (for DOCX export)
   */
  static pixelsToTwips(pixels: number, dpi: number = this.DEFAULT_DPI): number {
    const inches = pixels / dpi;
    return Math.round(inches * this.TWIPS_PER_INCH);
  }

  /**
   * Convert pixels to points (for DOCX export)
   */
  static pixelsToPoints(pixels: number, dpi: number = this.DEFAULT_DPI): number {
    const inches = pixels / dpi;
    return inches * 72;
  }

  /**
   * Convert pixels to half-points (for DOCX font sizes)
   */
  static pixelsToHalfPoints(pixels: number, dpi: number = this.DEFAULT_DPI): number {
    return Math.round(this.pixelsToPoints(pixels, dpi) * 2);
  }

  /**
   * Get default page dimensions in pixels (US Letter: 8.5" x 11")
   */
  static getDefaultPageSize(dpi: number = this.DEFAULT_DPI): { width: number; height: number } {
    return {
      width: 8.5 * dpi,
      height: 11 * dpi
    };
  }

  /**
   * Get default margins in pixels (1 inch all around)
   */
  static getDefaultMargins(dpi: number = this.DEFAULT_DPI): {
    top: number;
    bottom: number;
    left: number;
    right: number;
  } {
    const oneInch = dpi;
    return {
      top: oneInch,
      bottom: oneInch,
      left: oneInch,
      right: oneInch
    };
  }
}

