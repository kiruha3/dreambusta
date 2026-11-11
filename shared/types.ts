export type Kind = "book" | "document" | "presentation" | "video" | "audio";
export interface BookChapter {
  title: string;
  paragraph: number;
}
export interface ParagraphLocation {
  page?: number;
  slide?: number;
}
export type Representation =
  "article" | "text" | "pdf" | "docx" | "slides" | "video" | "audio";
export interface ShareImportOptions {
  scope: "article" | "branch" | "menu";
  selectedUrls?: string[];
}
export interface PublicationNode {
  sourceUrl: string;
  parentSourceUrl?: string;
  title: string;
  icon?: PublicationIcon | null;
}
export interface PublicationIcon {
  type: "emoji" | "image";
  value: string;
}
export interface Source {
  type: "file" | "share" | "link";
  url?: string;
  provider?: string;
  savedAt?: string;
  checkedAt?: string;
  status?: "saved" | "unavailable" | "error" | "removed";
  message?: string;
  importOptions?: ShareImportOptions;
}
export interface FileRef {
  path: string;
  name: string;
  mime: string;
  size: number;
  sha256?: string;
}
export interface PublicationPage {
  sourceUrl: string;
  parentSourceUrl?: string;
  slug: string;
  title: string;
  html: string;
  paragraphs: string[];
  wordCount: number;
  icon?: PublicationIcon | null;
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
  pages?: PublicationPage[];
  paragraphLocations?: ParagraphLocation[];
  chapters?: BookChapter[];
  navigation?: PublicationNode[];
  pageAddresses?: Record<string, string>;
  sourcePageId?: string;
  icon?: PublicationIcon | null;
  files: Record<string, FileRef>;
  warnings: string[];
  textVersion: number;
  revision: number;
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
