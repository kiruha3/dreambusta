import type { Kind } from "./types.ts";
export interface SearchQuery {
  query: string;
  /** Internal authorization scope; never populate from public query parameters. Empty denies all. */
  allowedMaterialIds?: readonly string[];
  kind?: Kind | "";
  collection?: string;
  material?: string;
  limit?: number;
  offset?: number;
}
export interface SearchLocation {
  mode: "text" | "pdf" | "slides" | "metadata";
  paragraph?: number;
  offset?: number;
  page?: number;
  slide?: number;
  publicationPage?: string;
}
export interface SearchResult {
  id: string;
  materialId: string;
  title: string;
  kind: Kind;
  context: string;
  snippet: string;
  url: string;
  location: SearchLocation;
  textVersion: number;
}
export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  mode: "lexical" | "hybrid";
  indexing: boolean;
  message?: string;
}
export interface AnswerSource extends SearchResult {
  number: number;
}
export interface SearchAnswer {
  status: "answered" | "unavailable" | "no-sources" | "changed";
  answer: string;
  sources: AnswerSource[];
  message?: string;
}
