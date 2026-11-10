// Main export for layout engine

export * from './types';
export * from './unitConverter';
export * from './textMeasurer';
export * from './textMeasurerWorker';
export * from './pageLayout';
export * from './flowCalculator';
export * from './elementHandlers';
export * from './worker/layoutWorkerManager';
export * from './docxXmlParser';

// Main layout engine class
import { FlowCalculator } from './flowCalculator';
import type { Document, Paragraph, PageConfig } from './types';

export class DocxLayoutEngine {
  private flowCalculator: FlowCalculator | null = null;
  private useWorker: boolean = false;
  private workerManager: any = null;

  constructor(pageConfig?: Partial<PageConfig>, useWorker: boolean = false) {
    this.useWorker = useWorker;
    
    if (useWorker) {
      // Worker-based layout (async)
      // Note: Worker manager must be initialized separately
      // import { LayoutWorkerManager } from './layout';
      // const manager = new LayoutWorkerManager();
      // await manager.initialize(pageConfig);
    } else {
      // Canvas-based layout (sync)
      this.flowCalculator = new FlowCalculator(pageConfig);
    }
  }

  /**
   * Layout document with all element types
   */
  layoutDocument(document: Document): any {
    if (this.useWorker && this.workerManager) {
      return this.workerManager.layout(document.elements);
    } else if (this.useWorker) {
      throw new Error('Worker manager not initialized. Call setWorkerManager() first.');
    } else {
      return this.getFlowCalculator().layoutDocument(document);
    }
  }

  /**
   * Layout document from paragraphs (backward compatibility)
   * Returns sync result if using Canvas, or Promise if using Worker
   */
  layout(paragraphs: Paragraph[]): any {
    if (this.useWorker && this.workerManager) {
      return this.workerManager.layout(paragraphs);
    } else if (this.useWorker) {
      throw new Error('Worker manager not initialized. Call setWorkerManager() first.');
    } else {
      return this.getFlowCalculator().layoutParagraphs(paragraphs);
    }
  }

  /**
   * Set worker manager for async layout
   */
  setWorkerManager(workerManager: any): void {
    this.workerManager = workerManager;
  }

  /**
   * Get text measurer for external measurements
   */
  getTextMeasurer() {
    if (this.useWorker) {
      throw new Error('Text measurer not available in worker mode');
    }
    return this.getFlowCalculator().getTextMeasurer();
  }

  private getFlowCalculator(): FlowCalculator {
    if (!this.flowCalculator) {
      throw new Error('Canvas layout is not available in worker mode');
    }
    return this.flowCalculator;
  }
}

