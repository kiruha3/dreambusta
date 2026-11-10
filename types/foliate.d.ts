declare module 'foliate-js/mobi.js' {
  export function isMOBI(file: Blob): Promise<boolean>;
  export class MOBI {
    constructor(options: { unzlib: (bytes: Uint8Array<ArrayBuffer>) => Promise<Uint8Array> });
    open(file: Blob): Promise<{
      metadata: { title?: string; author?: string | (string | { name?: string })[]; creator?: string | (string | { name?: string })[] };
      sections: { createDocument(): Promise<Document> }[];
      destroy?(): void;
    }>;
  }
}
