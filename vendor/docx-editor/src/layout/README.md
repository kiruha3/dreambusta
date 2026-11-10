# DOCX Layout Engine

A first approximation layout engine for rendering DOCX documents with proper page breaks and pagination.

## Features

- ✅ Page layout with configurable dimensions and margins
- ✅ Text measurement using Canvas API
- ✅ Automatic text wrapping and line breaking
- ✅ Page break detection and splitting
- ✅ Unit conversion (twips, points, EMU to pixels)
- ✅ Integration with mammoth for DOCX parsing

## Architecture

### Core Components

1. **UnitConverter** (`unitConverter.ts`)
   - Converts DOCX units (twips, EMU) to pixels
   - Handles default page sizes and margins

2. **TextMeasurer** (`textMeasurer.ts`)
   - Measures text width using Canvas API
   - Breaks text into lines based on available width
   - Caches measurements for performance

3. **PageLayoutManager** (`pageLayout.ts`)
   - Manages page dimensions and margins
   - Tracks current page and position
   - Handles page creation and advancement

4. **FlowCalculator** (`flowCalculator.ts`)
   - Calculates content flow
   - Detects page breaks
   - Splits paragraphs across pages when needed

5. **DocxLayoutEngine** (`index.ts`)
   - Main entry point
   - Orchestrates layout process

### Usage

```typescript
import { DocxLayoutEngine } from './layout';
import { parseMammothHtml } from './layout/docxParser';

// Parse DOCX HTML from mammoth
const paragraphs = parseMammothHtml(htmlString);

// Create layout engine
const layoutEngine = new DocxLayoutEngine();

// Layout document
const result = layoutEngine.layout(paragraphs);

// Result contains:
// - pages: Array of Page objects with laid out content
// - pageConfig: Page configuration (dimensions, margins)
```

## Limitations (First Approximation)

This is a basic implementation. Future improvements could include:

- [ ] Tables support
- [ ] Images with text wrapping
- [ ] Complex formatting (nested styles, etc.)
- [ ] Headers and footers
- [ ] Section breaks
- [ ] Incremental layout updates
- [ ] Virtual pagination for large documents
- [ ] Better style parsing from mammoth HTML

## File Structure

```
src/layout/
├── types.ts           # TypeScript interfaces
├── unitConverter.ts   # Unit conversion utilities
├── textMeasurer.ts    # Text measurement engine
├── pageLayout.ts      # Page layout manager
├── flowCalculator.ts  # Content flow and page breaks
├── docxParser.ts      # Parse mammoth HTML to paragraphs
└── index.ts           # Main export
```

