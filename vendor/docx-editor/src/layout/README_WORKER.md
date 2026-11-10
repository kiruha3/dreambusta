# Web Worker Support for Layout Engine

This document explains how to use the layout engine in a Web Worker for better performance.

## Problem

The original `TextMeasurer` uses Canvas API which is not available in Web Workers. This prevents offloading heavy layout calculations to a background thread.

## Solution

We use **pre-computed character width tables** that can be serialized and sent to the worker.

## Architecture

### 1. Font Metrics Generation (Main Thread)

```typescript
import { FontMetricsGenerator } from './layout/textMeasurerWorker';

const generator = new FontMetricsGenerator();
const font: FontProperties = {
  family: 'Times New Roman',
  size: 12,
  weight: 'normal',
  style: 'normal',
  lineHeight: 1.5
};

// Generate metrics for font
const metrics = generator.generateFontMetrics(font);
// metrics contains character width lookup table
```

### 2. Worker-Compatible Text Measurer

```typescript
import { TextMeasurerWorker } from './layout/textMeasurerWorker';

const measurer = new TextMeasurerWorker();
measurer.initializeFontMetrics(fontKey, metrics);

// Now can measure text without Canvas
const width = measurer.measureTextWidth('Hello', font);
```

### 3. Worker Manager (Main Thread)

```typescript
import { LayoutWorkerManager } from './layout/worker/layoutWorkerManager';

const manager = new LayoutWorkerManager('/path/to/worker.js');

// Initialize with font metrics
await manager.initialize(pageConfig);

// Layout in worker (non-blocking)
const result = await manager.layout(paragraphs);
```

## How It Works

1. **Main Thread**: Generate font metrics using Canvas API
2. **Main Thread**: Send metrics to worker
3. **Worker**: Use character width tables to measure text
4. **Worker**: Perform layout calculations
5. **Worker**: Send results back to main thread

## Character Width Tables

The system pre-measures common characters (ASCII 32-126, Latin Extended-A) and stores their widths. When measuring text:

- Look up each character's width
- Sum the widths
- Account for kerning (optional, advanced)

## Accuracy

- **High accuracy** for pre-measured characters
- **Good accuracy** for similar Unicode characters (uses average width)
- **No kerning** by default (can be added with pair tables)

## Performance

- **Initial setup**: One-time cost of measuring characters
- **Worker measurements**: Very fast (lookup table)
- **Memory**: ~1-2KB per font variant

## Usage Example

```typescript
// In main thread
import { LayoutWorkerManager } from './layout/worker/layoutWorkerManager';
import { parseMammothHtml } from './layout/docxParser';

const manager = new LayoutWorkerManager();
await manager.initialize();

// Process DOCX
const paragraphs = parseMammothHtml(html);
const result = await manager.layout(paragraphs);

// Result is ready, UI stays responsive!
```

## Limitations

1. **Kerning**: Not accounted for (can add pair tables)
2. **Ligatures**: Not handled (would need special handling)
3. **Font loading**: Must ensure fonts are loaded before generating metrics
4. **Initial cost**: One-time measurement of characters per font

## Future Improvements

- Add kerning pair tables
- Support for ligatures
- Font subsetting (only measure needed characters)
- Cache metrics in IndexedDB
- Support for variable fonts

