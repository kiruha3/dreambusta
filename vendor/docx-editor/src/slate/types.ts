import { BaseEditor } from "slate";
import { ReactEditor } from "slate-react";

// Custom Slate element types
export type CustomElement =
  | ParagraphElement
  | HeadingOneElement
  | HeadingTwoElement
  | HeadingThreeElement
  | TableElement
  | TableRowElement
  | TableCellElement
  | ImageElement
  | ListItemElement
  | BulletedListElement
  | NumberedListElement
  | BlockQuoteElement
  | CodeBlockElement
  | DividerElement
  | LinkElement;

// Track Changes types
export interface TrackedChange {
  changeId: string;
  changeType: "insert" | "delete";
  timestamp: number;
  author?: string;
}

// Comment types
export type CommentStatus = "open" | "resolved" | "rejected";

export interface CommentAuthor {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
}

export interface CommentReply {
  id: string;
  content: string;
  author: CommentAuthor;
  createdAt: string;
}

// CommentMark stores all comment data directly in the Slate mark
// This way comments are saved when document is saved
export interface CommentMark {
  commentId: string;
  content: string; // The comment text
  author: CommentAuthor;
  createdAt: string;
  status: CommentStatus;
  resolvedBy?: CommentAuthor;
  resolvedAt?: string;
  replies?: CommentReply[];
}

// Legacy Comment interface for external API (if needed)
export interface Comment {
  id: string;
  content: string;
  author: CommentAuthor;
  createdAt: string;
  anchorText: string;
  status: CommentStatus;
  resolvedBy?: CommentAuthor;
  resolvedAt?: string;
  replies?: CommentReply[];
}

// Editor mode type
export type EditorMode = "normal" | "redline" | "jinja";

// Base interface for block elements with uid
export interface BlockElementBase {
  /** Unique identifier for AI suggestions and track changes */
  uid?: string;
}

// Custom text with formatting marks
export interface CustomText {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  // Track changes mark
  trackedChange?: TrackedChange;
  // Comment mark
  comment?: CommentMark;
  // Jinja decoration (set by decorator, not stored)
  isJinjaVariable?: boolean;
  jinjaType?: "variable" | "tag" | "comment";
}

// Paragraph element
export interface ParagraphElement extends BlockElementBase {
  type: "paragraph";
  align?: "left" | "center" | "right" | "justify";
  indent?: number; // Legacy, keeping for backward compatibility
  indentLeft?: number;
  indentRight?: number;
  indentFirstLine?: number;
  spacing?: { before?: number; after?: number };
  children: (CustomText | InlineElement)[];
}

// Heading elements
export interface HeadingOneElement extends BlockElementBase {
  type: "heading-one";
  align?: "left" | "center" | "right" | "justify";
  children: (CustomText | InlineElement)[];
}

export interface HeadingTwoElement extends BlockElementBase {
  type: "heading-two";
  align?: "left" | "center" | "right" | "justify";
  children: (CustomText | InlineElement)[];
}

export interface HeadingThreeElement extends BlockElementBase {
  type: "heading-three";
  align?: "left" | "center" | "right" | "justify";
  children: (CustomText | InlineElement)[];
}

// List container elements
export interface BulletedListElement extends BlockElementBase {
  type: "bulleted-list";
  children: ListItemElement[];
}

export interface NumberedListElement extends BlockElementBase {
  type: "numbered-list";
  children: ListItemElement[];
}

// Block quote element
export interface BlockQuoteElement extends BlockElementBase {
  type: "block-quote";
  align?: "left" | "center" | "right" | "justify";
  children: (CustomText | InlineElement)[];
}

// Code block element
export interface CodeBlockElement extends BlockElementBase {
  type: "code-block";
  language?: string;
  children: CustomText[];
}

// Divider element
export interface DividerElement extends BlockElementBase {
  type: "divider";
  children: CustomText[];
}

// Table elements
export interface TableElement extends BlockElementBase {
  type: "table";
  colWidths?: number[];
  tableWidth?: number;
  tableAlign?: "left" | "center" | "right";
  children: TableRowElement[];
}

export interface TableRowElement extends BlockElementBase {
  type: "table-row";
  height?: number;
  children: TableCellElement[];
}

export interface TableBorder {
  style: string;
  width: number;
  color: string;
}

export interface TableCellElement extends BlockElementBase {
  type: "table-cell";
  colSpan?: number;
  rowSpan?: number;
  width?: number;
  widthPercent?: number;
  vAlign?: "top" | "center" | "bottom";
  backgroundColor?: string;
  borders?: {
    top?: TableBorder;
    bottom?: TableBorder;
    left?: TableBorder;
    right?: TableBorder;
  };
  padding?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  children: (ParagraphElement | TableElement | ListItemElement | BulletedListElement | NumberedListElement)[];
}

// Image element
export interface ImageElement extends BlockElementBase {
  type: "image";
  src: string;
  width: number;
  height: number;
  alt?: string;
  align?: "left" | "center" | "right";
  children: CustomText[]; // Required by Slate, but empty for void elements
}

// List item element
export interface ListItemElement extends BlockElementBase {
  type: "list-item";
  listType: "bullet" | "numbered";
  level: number;
  /** Original Word numbering identity and format, retained across DOCX export. */
  numId?: number;
  numFmt?: string;
  children: CustomText[];
}

// Inline elements (for future use)
export type InlineElement = LinkElement;

export interface LinkElement {
  type: "link";
  url: string;
  children: CustomText[];
}

// Extend Slate types
declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

// Helper type guards
export function isParagraphElement(element: CustomElement): element is ParagraphElement {
  return element.type === "paragraph";
}

export function isTableElement(element: CustomElement): element is TableElement {
  return element.type === "table";
}

export function isTableRowElement(element: CustomElement): element is TableRowElement {
  return element.type === "table-row";
}

export function isTableCellElement(element: CustomElement): element is TableCellElement {
  return element.type === "table-cell";
}

export function isImageElement(element: CustomElement): element is ImageElement {
  return element.type === "image";
}

export function isListItemElement(element: CustomElement): element is ListItemElement {
  return element.type === "list-item";
}
