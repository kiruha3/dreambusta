export type Kind = "book" | "document" | "presentation" | "video" | "audio";
export type Representation =
  "article" | "text" | "pdf" | "docx" | "slides" | "video" | "audio";
export interface Source {
  type: "file" | "share" | "link";
  url?: string;
  provider?: string;
  savedAt?: string;
  checkedAt?: string;
  status?: "saved" | "unavailable" | "error" | "removed";
  message?: string;
}
export interface FileRef {
  path: string;
  name: string;
  mime: string;
  size: number;
}
export interface Material {
  id: string;
  slug: string;
  title: string;
  author: string;
  description: string;
  kind: Kind;
  visible: boolean;
  downloadable: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  source: Source;
  representations: Representation[];
  paragraphs: string[];
  html: string;
  files: Record<string, FileRef>;
  warnings: string[];
  textVersion: number;
  state: "ready" | "processing" | "error";
  error?: string;
  mediaUrl?: string;
  cover?: string;
  wordCount: number;
}
export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string;
  visible: boolean;
  materialIds: string[];
}
export interface Session {
  setupRequired: boolean;
  editor: boolean;
  csrf?: string;
  email?: string;
  closed: boolean;
}
