// Web Worker for layout calculations

import type { DocumentElement, PageConfig } from '../types';
import { TextMeasurerWorker, type FontMetrics } from '../textMeasurerWorker';

// Worker message types
interface WorkerMessage {
  type: 'init' | 'layout' | 'update-metrics';
  data?: any;
}

interface InitMessage extends WorkerMessage {
  type: 'init';
  data: {
    pageConfig?: Partial<PageConfig>;
    fontMetrics: Map<string, FontMetrics>;
  };
}

interface LayoutMessage extends WorkerMessage {
  type: 'layout';
  data: {
    elements: DocumentElement[];
  };
}

interface UpdateMetricsMessage extends WorkerMessage {
  type: 'update-metrics';
  data: {
    fontMetrics: Map<string, FontMetrics>;
  };
}

// Create worker-compatible flow calculator
class WorkerFlowCalculator {
  private textMeasurer: TextMeasurerWorker;
  private pageConfig: PageConfig | null = null;

  constructor() {
    this.textMeasurer = new TextMeasurerWorker();
  }

  initialize(pageConfig: Partial<PageConfig>, fontMetrics: Map<string, FontMetrics>): void {
    // Initialize font metrics
    for (const [fontKey, metrics] of fontMetrics.entries()) {
      this.textMeasurer.initializeFontMetrics(fontKey, metrics);
    }

    // Set page config (simplified - would need to import PageLayoutManager)
    // For now, we'll use a basic implementation
    this.pageConfig = {
      width: pageConfig.width || 816, // Default US Letter width at 96 DPI
      height: pageConfig.height || 1056, // Default US Letter height
      margins: pageConfig.margins || {
        top: 96,
        bottom: 96,
        left: 96,
        right: 96
      }
    };
  }

  layout(elements: DocumentElement[]): any {
    // This is a simplified version - full implementation would use PageLayoutManager
    // For worker, we'll return the basic structure
    return {
      elements: elements.map(e => ({
        id: e.id,
        type: e.type
      })),
      pageConfig: this.pageConfig
    };
  }
}

// Worker message handler
const calculator = new WorkerFlowCalculator();

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const message = e.data;

  try {
    switch (message.type) {
      case 'init':
        const initData = (message as InitMessage).data;
        calculator.initialize(initData.pageConfig || {}, initData.fontMetrics);
        self.postMessage({ type: 'init-complete' });
        break;

      case 'layout':
        const layoutData = (message as LayoutMessage).data;
        const result = calculator.layout(layoutData.elements);
        self.postMessage({ 
          type: 'layout-complete', 
          data: result 
        });
        break;

      case 'update-metrics':
        const updateData = (message as UpdateMetricsMessage).data;
        for (const [fontKey, metrics] of updateData.fontMetrics.entries()) {
          calculator['textMeasurer'].initializeFontMetrics(fontKey, metrics);
        }
        self.postMessage({ type: 'metrics-updated' });
        break;

      default:
        self.postMessage({ 
          type: 'error', 
          error: `Unknown message type: ${message.type}` 
        });
    }
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

