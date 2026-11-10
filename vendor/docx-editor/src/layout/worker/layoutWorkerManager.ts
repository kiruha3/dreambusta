// Manager for layout worker - runs in main thread

import type { Paragraph, PageConfig } from '../types';
import { FontMetricsGenerator } from '../textMeasurerWorker';
import type { FontMetrics } from '../textMeasurerWorker';

export class LayoutWorkerManager {
  private worker: Worker | null = null;
  private workerUrl: string;
  private fontMetricsGenerator: FontMetricsGenerator;
  private initializedFonts: Set<string> = new Set();

  constructor(workerUrl?: string) {
    // Create worker from blob URL or use provided URL
    if (workerUrl) {
      this.workerUrl = workerUrl;
    } else {
      // In production, you'd use a proper worker file
      // For development, we'll create it dynamically
      this.workerUrl = this.createWorkerBlobUrl();
    }
    
    this.fontMetricsGenerator = new FontMetricsGenerator();
    this.initializeWorker();
  }

  /**
   * Create worker from blob URL (for development)
   * In production, use a separate worker file
   */
  private createWorkerBlobUrl(): string {
    // This would be replaced with actual worker code
    // For now, return empty - user should provide worker file
    const workerCode = `
      // Worker code would go here
      // See layoutWorker.ts for actual implementation
      self.onmessage = (e) => {
        self.postMessage({ type: 'error', error: 'Worker not properly configured' });
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  private initializeWorker(): void {
    try {
      this.worker = new Worker(this.workerUrl);
      this.setupWorkerHandlers();
    } catch (error) {
      console.error('Failed to create worker:', error);
    }
  }

  private setupWorkerHandlers(): void {
    if (!this.worker) return;

    this.worker.onerror = (error) => {
      console.error('Worker error:', error);
    };

    this.worker.onmessageerror = (error) => {
      console.error('Worker message error:', error);
    };
  }

  /**
   * Initialize worker with font metrics
   */
  async initialize(pageConfig?: Partial<PageConfig>): Promise<void> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    // Generate font metrics for common fonts
    const commonFonts = this.getCommonFonts();
    const fontMetricsMap = this.fontMetricsGenerator.generateMultipleFontMetrics(commonFonts);

    // Convert Map to serializable format
    const serializableMetrics: Record<string, FontMetrics> = {};
    for (const [key, metrics] of fontMetricsMap.entries()) {
      // Convert Map to object for serialization
      const charWidths: Record<number, number> = {};
      for (const [charCode, width] of metrics.characterWidths.entries()) {
        charWidths[charCode] = width;
      }
      
      serializableMetrics[key] = {
        ...metrics,
        characterWidths: charWidths as any // Will be reconstructed in worker
      };
    }

    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const handler = (e: MessageEvent) => {
        if (e.data.type === 'init-complete') {
          this.worker?.removeEventListener('message', handler);
          resolve();
        } else if (e.data.type === 'error') {
          this.worker?.removeEventListener('message', handler);
          reject(new Error(e.data.error));
        }
      };

      this.worker.addEventListener('message', handler);
      this.worker.postMessage({
        type: 'init',
        data: {
          pageConfig,
          fontMetrics: serializableMetrics
        }
      });
    });
  }

  /**
   * Layout paragraphs in worker
   */
  async layout(paragraphs: Paragraph[]): Promise<any> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    // Ensure fonts are initialized
    await this.ensureFontsInitialized(paragraphs);

    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        if (e.data.type === 'layout-complete') {
          this.worker?.removeEventListener('message', handler);
          resolve(e.data.data);
        } else if (e.data.type === 'error') {
          this.worker?.removeEventListener('message', handler);
          reject(new Error(e.data.error));
        }
      };

      this.worker!.addEventListener('message', handler);
      this.worker!.postMessage({
        type: 'layout',
        data: { paragraphs }
      });
    });
  }

  /**
   * Ensure all fonts used in paragraphs are initialized
   */
  private async ensureFontsInitialized(paragraphs: Paragraph[]): Promise<void> {
    const fontsToInit: any[] = [];

    for (const paragraph of paragraphs) {
      const fontKey = this.getFontKey(paragraph.font);
      if (!this.initializedFonts.has(fontKey)) {
        fontsToInit.push(paragraph.font);
        this.initializedFonts.add(fontKey);
      }
    }

    if (fontsToInit.length > 0 && this.worker) {
      const metricsMap = this.fontMetricsGenerator.generateMultipleFontMetrics(fontsToInit);
      
      const serializableMetrics: Record<string, any> = {};
      for (const [key, metrics] of metricsMap.entries()) {
        const charWidths: Record<number, number> = {};
        for (const [charCode, width] of metrics.characterWidths.entries()) {
          charWidths[charCode] = width;
        }
        serializableMetrics[key] = {
          ...metrics,
          characterWidths: charWidths
        };
      }

      await new Promise<void>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.type === 'metrics-updated') {
            this.worker?.removeEventListener('message', handler);
            resolve();
          } else if (e.data.type === 'error') {
            this.worker?.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        };

        this.worker!.addEventListener('message', handler);
        this.worker!.postMessage({
          type: 'update-metrics',
          data: { fontMetrics: serializableMetrics }
        });
      });
    }
  }

  private getCommonFonts(): any[] {
    return [
      { family: 'Times New Roman', size: 12, weight: 'normal' as const, style: 'normal' as const, lineHeight: 1.5 },
      { family: 'Times New Roman', size: 12, weight: 'bold' as const, style: 'normal' as const, lineHeight: 1.5 },
      { family: 'Arial', size: 12, weight: 'normal' as const, style: 'normal' as const, lineHeight: 1.5 },
      { family: 'Arial', size: 12, weight: 'bold' as const, style: 'normal' as const, lineHeight: 1.5 },
      { family: 'Calibri', size: 12, weight: 'normal' as const, style: 'normal' as const, lineHeight: 1.5 },
    ];
  }

  private getFontKey(font: any): string {
    return `${font.family}-${font.size}-${font.weight}-${font.style}-${font.lineHeight}`;
  }

  /**
   * Terminate worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

