import type { BookDocument } from "../books.ts";
export async function importPdf(
  file: File,
  fallback: string,
  report?: (message: string) => void,
): Promise<BookDocument> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined")
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "/pdf.worker.min.mjs",
      window.location.href,
    ).href;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  try {
    const paragraphs: string[] = [];
    const paragraphLocations: { page: number }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      report?.(`Извлекаем текст: страница ${i} из ${pdf.numPages}`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const start = paragraphs.length;
      let line: string[] = [];
      for (const item of content.items)
        if ("str" in item) {
          line.push(item.str);
          if (item.hasEOL) {
            paragraphs.push(line.join(" "));
            line = [];
          }
        }
      if (line.length) paragraphs.push(line.join(" "));
      for (let p = start; p < paragraphs.length; p++)
        paragraphLocations.push({ page: i });
      page.cleanup();
    }
    const metadata = await pdf.getMetadata().catch(() => null);
    const info = metadata?.info as
      { Title?: string; Author?: string } | undefined;
    return {
      title: info?.Title?.trim() || fallback,
      author: info?.Author?.trim() || "",
      paragraphs,
      paragraphLocations,
    };
  } finally {
    await pdf.destroy();
  }
}
