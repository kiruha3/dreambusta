// Example: Using layout engine with Web Worker

import { LayoutWorkerManager } from '../worker/layoutWorkerManager';
import { parseMammothHtml } from '../docxParser';
import type { Paragraph } from '../types';

/**
 * Example of using layout engine in Web Worker
 * 
 * Note: In production, you need to:
 * 1. Create a worker file (e.g., public/layoutWorker.js)
 * 2. Bundle the worker code separately
 * 3. Point to the worker file
 */
export async function layoutWithWorker(
  html: string,
  workerUrl?: string
): Promise<any> {
  // Parse HTML to paragraphs
  const paragraphs = parseMammothHtml(html);

  // Create worker manager
  const manager = new LayoutWorkerManager(workerUrl);

  try {
    // Initialize worker with default page config
    await manager.initialize({
      width: 816,  // US Letter width at 96 DPI
      height: 1056, // US Letter height
      margins: {
        top: 96,
        bottom: 96,
        left: 96,
        right: 96
      }
    });

    // Layout in worker (non-blocking!)
    const result = await manager.layout(paragraphs);

    return result;
  } finally {
    // Clean up
    manager.terminate();
  }
}

/**
 * Example: Using layout engine with Canvas (main thread)
 */
import { DocxLayoutEngine } from '../index';

export function layoutWithCanvas(html: string): any {
  // Parse HTML to paragraphs
  const paragraphs = parseMammothHtml(html);

  // Create layout engine (uses Canvas)
  const engine = new DocxLayoutEngine();

  // Layout (blocks main thread for large documents)
  const result = engine.layout(paragraphs);

  return result;
}

/**
 * Comparison:
 * 
 * Canvas (Main Thread):
 * - Simple, synchronous
 * - Blocks UI for large documents
 * - Good for small documents (< 50 pages)
 * 
 * Worker (Background Thread):
 * - More complex setup
 * - Non-blocking, UI stays responsive
 * - Good for large documents (100+ pages)
 * - Requires font metrics pre-computation
 */

