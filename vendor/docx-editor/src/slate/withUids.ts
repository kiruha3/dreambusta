import { Editor, Element, Node, Transforms } from "slate";

/**
 * UidManager - manages unique identifiers for Slate nodes
 * 
 * This ensures all block-level elements have stable uid for:
 * - AI suggestions targeting specific nodes
 * - Track changes referencing nodes
 * - Version history and diffing
 */

// Set to track all existing uids in the document
// TODO(bugsweep D1, low): модульные мутабельные глобалы шарятся между всеми
// инстансами редактора (comparison-режим монтирует два одновременно) —
// latent collision/race; сейчас спасает readOnly второго редактора.
// Перенести состояние в инстанс (WeakMap<Editor, {uids, counter}> или
// замыкание withUids) — затронет API collectExistingUids/resetUidManager
// и их call-sites, поэтому отдельной задачей.
let existingUids = new Set<string>();
let uidCounter = 0;

/**
 * Generate a unique uid that doesn't conflict with existing ones
 */
function generateUniqueUid(): string {
  let uid: string;
  do {
    uid = `n${uidCounter++}`;
  } while (existingUids.has(uid));
  existingUids.add(uid);
  return uid;
}

/**
 * Collect all existing uids from content
 */
export function collectExistingUids(nodes: Node[]): void {
  existingUids.clear();
  uidCounter = 0;
  
  const collect = (node: Node) => {
    if (Element.isElement(node)) {
      const element = node as any;
      if (element.uid) {
        existingUids.add(element.uid);
        // Update counter to be higher than any numeric uid
        const match = element.uid.match(/^n(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= uidCounter) {
            uidCounter = num + 1;
          }
        }
      }
      // Recursively collect from children
      if (node.children) {
        for (const child of node.children) {
          collect(child);
        }
      }
    }
  };
  
  for (const node of nodes) {
    collect(node);
  }
}

/**
 * Reset uid manager state (for new documents)
 */
export function resetUidManager(): void {
  existingUids.clear();
  uidCounter = 0;
}

/**
 * Check if a node type should have uid
 * Block-level elements need uid, text nodes don't
 */
function shouldHaveUid(node: Node): boolean {
  if (!Element.isElement(node)) {
    return false; // Text nodes don't need uid
  }
  
  const element = node as any;
  const type = element.type;
  
  // Block-level elements that should have uid.
  // Имена должны совпадать с types.ts (CustomElement union): раньше здесь были
  // "blockquote" (фактический тип — "block-quote") и несуществующие
  // heading-four/five/six — такие ноды молча оставались без uid, и
  // uid-зависимые механизмы (diff-подсветка, track changes targeting)
  // для них не работали до следующего ensureUids при загрузке.
  const blockTypes = [
    "paragraph",
    "heading-one",
    "heading-two",
    "heading-three",
    "table",
    "table-row",
    "table-cell",
    "list-item",
    "bulleted-list",
    "numbered-list",
    "block-quote",
    "code-block",
    "image",
  ];
  
  return blockTypes.includes(type);
}

/**
 * Slate plugin that ensures all block elements have uid
 */
export function withUids<T extends Editor>(editor: T): T {
  const { normalizeNode, apply } = editor;
  
  // Override normalizeNode to add uid to elements without one
  editor.normalizeNode = (entry) => {
    const [node, path] = entry;
    
    if (shouldHaveUid(node)) {
      const element = node as any;
      if (!element.uid) {
        // Add uid to element
        const uid = generateUniqueUid();
        Transforms.setNodes(
          editor,
          { uid } as any,
          { at: path }
        );
        return; // Return early, normalization will continue
      } else {
        // Track existing uid
        if (!existingUids.has(element.uid)) {
          existingUids.add(element.uid);
        }
      }
    }
    
    // Fall through to default normalization
    normalizeNode(entry);
  };
  
  // Override apply to handle operations that might need uid updates
  editor.apply = (operation) => {
    apply(operation);
    
    // After split_node, the new node needs a new uid
    if (operation.type === "split_node") {
      // The normalizer will handle adding uid
    }
    
    // After insert_node, ensure uid is present
    if (operation.type === "insert_node") {
      // The normalizer will handle adding uid
    }
  };
  
  return editor;
}

/**
 * Initialize uid manager with document content
 * Call this when loading content into the editor
 */
export function initializeUidManager(content: Node[]): void {
  collectExistingUids(content);
}

