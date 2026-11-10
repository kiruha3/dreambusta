import { Editor, Transforms } from "slate";
import type { ImageElement, ParagraphElement } from "./types";

/**
 * Insert an image at current selection
 */
export function insertImage(
  editor: Editor,
  src: string,
  width: number = 300,
  height: number = 200,
  alt: string = "Image"
): void {
  const image: ImageElement = {
    type: "image",
    src,
    width,
    height,
    alt,
    children: [{ text: "" }], // Void elements need empty text child
  };

  Transforms.insertNodes(editor, image);

  // Insert paragraph after image for cursor placement
  const paragraph: ParagraphElement = {
    type: "paragraph",
    children: [{ text: "" }],
  };
  Transforms.insertNodes(editor, paragraph);
}

/**
 * Convert File to base64 data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convert ArrayBuffer to base64 data URL
 */
export function arrayBufferToDataUrl(
  buffer: ArrayBuffer,
  mimeType: string
): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    tiff: "image/tiff",
    tif: "image/tiff",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}

/**
 * Handle image paste from clipboard
 */
export async function handleImagePaste(
  editor: Editor,
  event: React.ClipboardEvent
): Promise<boolean> {
  const { clipboardData } = event;

  // Check for image files in clipboard
  const items = clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      event.preventDefault();
      const file = item.getAsFile();
      if (file) {
        const dataUrl = await fileToDataUrl(file);
        // Try to get image dimensions
        const dimensions = await getImageDimensions(dataUrl);
        insertImage(editor, dataUrl, dimensions.width, dimensions.height, file.name);
        return true;
      }
    }
  }

  return false;
}

/**
 * Handle image drop
 */
export async function handleImageDrop(
  editor: Editor,
  event: React.DragEvent
): Promise<boolean> {
  const { dataTransfer } = event;

  // Check for image files in drop
  const files = dataTransfer.files;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type.startsWith("image/")) {
      event.preventDefault();
      const dataUrl = await fileToDataUrl(file);
      const dimensions = await getImageDimensions(dataUrl);
      insertImage(editor, dataUrl, dimensions.width, dimensions.height, file.name);
      return true;
    }
  }

  return false;
}

/**
 * Get image dimensions from data URL
 */
export function getImageDimensions(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Limit max dimensions
      let width = img.width;
      let height = img.height;
      const maxWidth = 600;
      const maxHeight = 800;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      resolve({ width: Math.round(width), height: Math.round(height) });
    };
    img.onerror = () => {
      resolve({ width: 300, height: 200 }); // Default dimensions
    };
    img.src = dataUrl;
  });
}

/**
 * Create image input handler for file upload
 */
export function createImageUploadHandler(
  editor: Editor
): (event: React.ChangeEvent<HTMLInputElement>) => Promise<void> {
  return async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const dataUrl = await fileToDataUrl(file);
      const dimensions = await getImageDimensions(dataUrl);
      insertImage(editor, dataUrl, dimensions.width, dimensions.height, file.name);
    }
    // Reset input
    event.target.value = "";
  };
}
