import { Editor, Transforms, Text, Range, Point, Node, Path, Element as SlateElement } from "slate";
import type { Descendant } from "slate";
import type { TrackedChange, CustomText } from "./types";
import { normalizeWhitespace, collapseWhitespace } from "./changeUtils";


let changeIdCounter = 0;

function generateChangeId(): string {
  return `change-${Date.now()}-${++changeIdCounter}`;
}

// State for grouping consecutive insertions
interface InsertionState {
  changeId: string;
  lastTimestamp: number;
  lastPath: string; // JSON stringified path for comparison
}

let currentInsertion: InsertionState | null = null;
const GROUPING_TIMEOUT_MS = 1500; // Group insertions within 1.5 seconds

function getOrCreateInsertionChangeId(path: number[]): string {
  const now = Date.now();
  const pathStr = JSON.stringify(path);
  
  // Check if we should reuse the current insertion change
  if (currentInsertion && 
      now - currentInsertion.lastTimestamp < GROUPING_TIMEOUT_MS) {
    // Update timestamp and return same changeId
    currentInsertion.lastTimestamp = now;
    currentInsertion.lastPath = pathStr;
    return currentInsertion.changeId;
  }
  
  // Create new insertion state
  const newChangeId = generateChangeId();
  currentInsertion = {
    changeId: newChangeId,
    lastTimestamp: now,
    lastPath: pathStr,
  };
  return newChangeId;
}

// Reset insertion state (call when selection changes significantly)
function resetInsertionState(): void {
  currentInsertion = null;
}

export interface TrackChangesEditor extends Editor {
  isTrackChangesEnabled: () => boolean;
  setTrackChangesEnabled: (enabled: boolean) => void;
  getTrackedChanges: () => { change: TrackedChange; path: Path; text: string }[];
  acceptChange: (changeId: string) => void;
  rejectChange: (changeId: string) => void;
  acceptAllChanges: () => void;
  rejectAllChanges: () => void;
  // New methods for bidirectional sync with chat
  acceptChangeById: (changeId: string) => boolean;
  rejectChangeById: (changeId: string) => boolean;
  hasChange: (changeId: string) => boolean;
  setOnChangeAccepted: (callback: ((changeId: string) => void) | undefined) => void;
  setOnChangeRejected: (callback: ((changeId: string) => void) | undefined) => void;
}

export function withTrackChanges<T extends Editor>(editor: T): T & TrackChangesEditor {
  const e = editor as T & TrackChangesEditor;
  const { insertText, deleteBackward, deleteForward, insertBreak } = e;

  let trackChangesEnabled = false;
  let onChangeAcceptedCallback: ((changeId: string) => void) | undefined;
  let onChangeRejectedCallback: ((changeId: string) => void) | undefined;

  e.isTrackChangesEnabled = () => trackChangesEnabled;

  e.setTrackChangesEnabled = (enabled: boolean) => {
    trackChangesEnabled = enabled;
  };

  e.setOnChangeAccepted = (callback) => {
    onChangeAcceptedCallback = callback;
  };

  e.setOnChangeRejected = (callback) => {
    onChangeRejectedCallback = callback;
  };

  e.insertText = (text: string) => {
    if (!trackChangesEnabled) {
      insertText(text);
      return;
    }

    const { selection } = e;
    if (!selection) {
      insertText(text);
      return;
    }

    // IMPORTANT: Handle text replacement (selection is expanded)
    // When user selects text and types, we need to:
    // 1. Mark selected text as deleted (strikethrough)
    // 2. Insert new text as addition (green)
    if (Range.isExpanded(selection)) {
      resetInsertionState();
      
      const changeId = generateChangeId();
      const timestamp = Date.now();
      
      // Get formatting from selected text to preserve it
      const [startNode] = Editor.node(e, selection.anchor.path);
      let formatting: Record<string, any> = {};
      if (Text.isText(startNode)) {
        const { text: _, trackedChange: __, comment: ___, ...nodeFormatting } = startNode as CustomText;
        formatting = nodeFormatting;
      }
      
      Editor.withoutNormalizing(e, () => {
        // Step 1: Mark selected text as deleted
        const deleteChange: TrackedChange = {
          changeId,
          changeType: "delete",
          timestamp,
        };
        
        Transforms.setNodes(
          e,
          { trackedChange: deleteChange } as Partial<CustomText>,
          { at: selection, match: Text.isText, split: true }
        );
        
        // Step 2: Move cursor to end of deleted range
        const end = Range.end(selection);
        Transforms.select(e, end);
        
        // Step 3: Insert new text as addition
        const insertChange: TrackedChange = {
          changeId,
          changeType: "insert",
          timestamp,
        };
        
        Transforms.insertNodes(e, {
          text,
          ...formatting,
          trackedChange: insertChange,
        } as CustomText);
      });
      
      return;
    }

    // Get current path for grouping
    const currentPath = selection.anchor.path;
    
    // Check if we can extend an existing tracked insert node
    // This merges consecutive typing into one change
    const [currentNode] = Editor.node(e, currentPath);
    if (Text.isText(currentNode)) {
      const textNode = currentNode as CustomText;
      // If cursor is at the end of a tracked insert with compatible changeId
      if (textNode.trackedChange?.changeType === "insert" && 
          selection.anchor.offset === textNode.text.length) {
        const changeId = getOrCreateInsertionChangeId(currentPath);
        // If same changeId, just extend by inserting text normally
        // The text will be added to the same node
        if (textNode.trackedChange.changeId === changeId || 
            (currentInsertion && Date.now() - currentInsertion.lastTimestamp < GROUPING_TIMEOUT_MS)) {
          // Update the changeId to match current grouping
          if (textNode.trackedChange.changeId !== changeId) {
            Transforms.setNodes(
              e,
              { trackedChange: { ...textNode.trackedChange, changeId } } as Partial<CustomText>,
              { at: currentPath }
            );
          }
          insertText(text);
          if (currentInsertion) currentInsertion.lastTimestamp = Date.now();
          return;
        }
      }
    }

    // Use grouped changeId for new insertions
    const changeId = getOrCreateInsertionChangeId(currentPath);
    
    const trackedChange: TrackedChange = {
      changeId,
      changeType: "insert",
      timestamp: Date.now(),
    };

    // Get current marks (font, size, etc.) to preserve them
    const currentMarks = Editor.marks(e) || {};
    
    // Remove trackedChange from currentMarks if present (we'll add our own)
    const { trackedChange: _, ...otherMarks } = currentMarks as any;

    // Insert text node directly with trackedChange mark
    Transforms.insertNodes(e, {
      text,
      ...otherMarks,
      trackedChange,
    } as CustomText);
  };

  e.insertBreak = () => {
    if (!trackChangesEnabled) {
      insertBreak();
      return;
    }

    // For line breaks in track changes mode, we insert a tracked newline marker
    // and then do the actual break
    const trackedChange: TrackedChange = {
      changeId: generateChangeId(),
      changeType: "insert",
      timestamp: Date.now(),
    };

    // Get current marks to preserve them after break
    const currentMarks = Editor.marks(e) || {};
    const { trackedChange: _, ...otherMarks } = currentMarks as any;

    // Insert break normally
    insertBreak();

    // Re-apply marks after break so next text will have track change
    for (const [key, value] of Object.entries(otherMarks)) {
      Editor.addMark(e, key, value);
    }
    Editor.addMark(e, "trackedChange", trackedChange);
  };

  e.deleteBackward = (unit) => {
    if (!trackChangesEnabled) {
      deleteBackward(unit);
      return;
    }

    // Reset insertion grouping on delete
    resetInsertionState();

    const { selection } = e;
    if (!selection) {
      deleteBackward(unit);
      return;
    }

    if (Range.isExpanded(selection)) {
      markSelectionAsDeleted(e, selection);
    } else {
      const before = Editor.before(e, selection.anchor, { unit });
      if (before) {
        const range = { anchor: before, focus: selection.anchor };
        markSelectionAsDeleted(e, range);
      }
    }
  };

  e.deleteForward = (unit) => {
    if (!trackChangesEnabled) {
      deleteForward(unit);
      return;
    }

    // Reset insertion grouping on delete
    resetInsertionState();

    const { selection } = e;
    if (!selection) {
      deleteForward(unit);
      return;
    }

    if (Range.isExpanded(selection)) {
      markSelectionAsDeleted(e, selection);
    } else {
      const after = Editor.after(e, selection.anchor, { unit });
      if (after) {
        const range = { anchor: selection.anchor, focus: after };
        markSelectionAsDeleted(e, range);
      }
    }
  };

  // P1.5: кеш по reference-identity `e.children`. Slate immutable
  // transforms заменяют children массивом при любой мутации (`editor.children`
  // меняет ссылку), так что простое `===` сравнение — надёжный invalidation
  // signal без зависимости от operations buffer (который сбрасывается на flush).
  // На документе 100+ страниц с 3-5k text-узлов это снимает O(n) на каждый
  // вызов getTrackedChanges() (он дёргается из getTrackedChanges-consumers
  // и из panel-render циклов на каждый onChange).
  let cachedFor: any = null;
  let cachedChanges: { change: TrackedChange; path: Path; text: string }[] | null = null;

  e.getTrackedChanges = () => {
    if (cachedChanges !== null && cachedFor === e.children) {
      return cachedChanges;
    }

    const changes: { change: TrackedChange; path: Path; text: string }[] = [];
    const seen = new Set<string>();

    for (const [node, path] of Node.texts(e)) {
      const text = node as CustomText;
      if (text.trackedChange && !seen.has(text.trackedChange.changeId)) {
        seen.add(text.trackedChange.changeId);
        changes.push({
          change: text.trackedChange,
          path,
          text: text.text,
        });
      }
    }

    changes.sort((a, b) => a.change.timestamp - b.change.timestamp);
    cachedChanges = changes;
    cachedFor = e.children;
    return changes;
  };

  e.acceptChange = (changeId: string) => {
    // Collect all nodes matching this changeId first
    const deleteNodes: { path: Path; node: CustomText }[] = [];
    const insertNodes: { path: Path; node: CustomText }[] = [];
    
    for (const [node, path] of Node.texts(e)) {
      const text = node as CustomText;
      if (text.trackedChange?.changeId === changeId) {
        if (text.trackedChange.changeType === "delete") {
          deleteNodes.push({ path: [...path], node: text });
        } else if (text.trackedChange.changeType === "insert") {
          insertNodes.push({ path: [...path], node: text });
        }
      }
    }
    
    Editor.withoutNormalizing(e, () => {
      // First, unmark all insert nodes (they stay) - process from end to start
      for (const { path } of insertNodes.reverse()) {
        try {
          Transforms.unsetNodes(e, "trackedChange", { at: path, match: Text.isText });
        } catch {
          // Node path may have changed, skip
        }
      }
      
      // Then, remove all delete nodes - process from end to start
      for (const { path } of deleteNodes.reverse()) {
        try {
          Transforms.removeNodes(e, { at: path });
        } catch {
          // Node may have been merged, skip
        }
      }
    });
  };

  e.rejectChange = (changeId: string) => {
    // Collect all nodes matching this changeId first
    const deleteNodes: { path: Path; node: CustomText }[] = [];
    const insertNodes: { path: Path; node: CustomText }[] = [];
    
    for (const [node, path] of Node.texts(e)) {
      const text = node as CustomText;
      if (text.trackedChange?.changeId === changeId) {
        if (text.trackedChange.changeType === "delete") {
          deleteNodes.push({ path: [...path], node: text });
        } else if (text.trackedChange.changeType === "insert") {
          insertNodes.push({ path: [...path], node: text });
        }
      }
    }
    
    Editor.withoutNormalizing(e, () => {
      // First, unmark all delete nodes (they get restored) - process from end to start
      for (const { path } of deleteNodes.reverse()) {
        try {
          Transforms.unsetNodes(e, "trackedChange", { at: path, match: Text.isText });
        } catch {
          // Node path may have changed, skip
        }
      }
      
      // Then, remove all insert nodes - process from end to start
      for (const { path } of insertNodes.reverse()) {
        try {
          Transforms.removeNodes(e, { at: path });
        } catch {
          // Node may have been merged, skip
        }
      }
    });
  };

  e.acceptAllChanges = () => {
    const changes = e.getTrackedChanges();
    const changeIds = [...new Set(changes.map(c => c.change.changeId))];
    for (const changeId of changeIds) {
      e.acceptChange(changeId);
    }
  };

  e.rejectAllChanges = () => {
    const changes = e.getTrackedChanges();
    const changeIds = [...new Set(changes.map(c => c.change.changeId))];
    for (const changeId of changeIds) {
      e.rejectChange(changeId);
    }
  };

  // Check if a change exists in the document
  e.hasChange = (changeId: string): boolean => {
    for (const [node] of Node.texts(e)) {
      const text = node as CustomText;
      if (text.trackedChange?.changeId === changeId) {
        return true;
      }
    }
    return false;
  };

  // Accept change by ID and return success status + trigger callback
  e.acceptChangeById = (changeId: string): boolean => {
    if (!e.hasChange(changeId)) {
      return false;
    }
    e.acceptChange(changeId);
    onChangeAcceptedCallback?.(changeId);
    return true;
  };

  // Reject change by ID and return success status + trigger callback
  e.rejectChangeById = (changeId: string): boolean => {
    if (!e.hasChange(changeId)) {
      return false;
    }
    e.rejectChange(changeId);
    onChangeRejectedCallback?.(changeId);
    return true;
  };

  return e;
}

function markSelectionAsDeleted(editor: Editor, range: Range): void {
  const trackedChange: TrackedChange = {
    changeId: generateChangeId(),
    changeType: "delete",
    timestamp: Date.now(),
  };

  Transforms.setNodes(
    editor,
    { trackedChange } as Partial<CustomText>,
    { at: range, match: Text.isText, split: true }
  );

  // Move cursor to end of deleted range so new text goes after
  const end = Range.end(range);
  Transforms.select(editor, end);
}


export interface LLMSuggestion {
  id: string;
  type: "text_replacement" | "text_addition" | "text_deletion" | "node_replacement";
  description: string;
  content?: string;
  original_text?: string;
  /**
   * Позиция вставки для text_addition:
   * - "end" (по умолчанию) — в конец документа
   * - "start" — в начало документа
   * - "after" — новый абзац ПОСЛЕ блока, содержащего original_text
   * - "before" — новый абзац ДО блока, содержащего original_text
   */
  position?: "start" | "end" | "after" | "before";
  // For node_replacement
  uid?: string;
  action?: string;
  /**
   * Slate-узел для вставки/замены. Тип `unknown` — намеренно: интерфейс
   * не привязан к slate-типам напрямую (потребители из Vue-store не
   * импортируют `Descendant`). Внутри `applyNodeReplacementByUid` и
   * соседних функций проверяем структуру до изменения документа.
   */
  new_node?: unknown;
}


export function applyLLMSuggestion(
  editor: TrackChangesEditor,
  suggestion: LLMSuggestion
): { success: boolean; changeId: string } {
  const changeId = suggestion.id || generateChangeId();

  // BUG #48: повторное применение того же suggestion.id не должно
  // создавать второй tracked change. Без этого гарда каждый ре-вызов
  // (re-queue после ошибки сети, повторный клик пользователя, повторный
  // chunk_suggestion из стрима) добавлял дубль на следующее вхождение
  // original_text — корень репорта о «дублировании текста».
  if (editor.hasChange(changeId)) {
    return { success: true, changeId };
  }

  if (suggestion.type === "text_replacement" && suggestion.original_text) {
    return applyTextReplacement(editor, suggestion, changeId);
  }

  if (suggestion.type === "text_addition" && suggestion.content) {
    return applyTextAddition(editor, suggestion, changeId);
  }

  if (suggestion.type === "text_deletion" && suggestion.original_text) {
    return applyTextDeletion(editor, suggestion, changeId);
  }

  // For node_replacement: use original_text and content as text_replacement
  // This shows proper track changes (strikethrough old + green new)
  if (suggestion.type === "node_replacement" && suggestion.original_text && suggestion.content) {
    const textReplacementSuggestion: LLMSuggestion = {
      ...suggestion,
      type: "text_replacement",
    };
    return applyTextReplacement(editor, textReplacementSuggestion, changeId);
  }

  // For node_replacement with uid: handle replace/delete/insert_after actions
  if (suggestion.type === "node_replacement" && suggestion.uid) {
    const action = suggestion.action || 'replace';
    
    if (action === 'replace' && suggestion.new_node) {
      const result = applyNodeReplacementByUid(editor, suggestion, changeId);
      if (result.success) {
        return result;
      }
    }
    
    if (action === 'delete') {
      const result = applyNodeDeletionByUid(editor, suggestion, changeId);
      if (result.success) {
        return result;
      }
    }
    
    if (action === 'insert_after' && suggestion.new_node) {
      const result = applyNodeInsertAfterUid(editor, suggestion, changeId);
      if (result.success) {
        return result;
      }
    }
    // Fall through to return false if not handled
  }

  return { success: false, changeId };
}

// Extract all text content from a Slate node (recursively).
// Внешний new_node проходит проверку структуры перед чтением текста.
function extractTextFromNode(node: unknown): string {
  if (Text.isText(node)) return node.text;
  if (SlateElement.isElement(node) || Editor.isEditor(node)) {
    return node.children.map(extractTextFromNode).join("");
  }
  return "";
}

function isSlateDescendant(node: unknown): node is Descendant {
  return Text.isText(node) || (
    SlateElement.isElement(node) && typeof node.type === "string" &&
    node.children.every(isSlateDescendant)
  );
}

// Find node path by uid in editor
function findNodePathByUid(editor: Editor, uid: string): Path | null {
  for (const [node, path] of Node.nodes(editor)) {
    if ((node as any).uid === uid) {
      return path;
    }
  }
  return null;
}

// Apply node replacement by uid with track changes
function applyNodeReplacementByUid(
  editor: TrackChangesEditor,
  suggestion: LLMSuggestion,
  changeId: string
): { success: boolean; changeId: string } {
  const uid = suggestion.uid!;
  const newNode = suggestion.new_node;
  if (!isSlateDescendant(newNode)) {
    return { success: false, changeId };
  }
  
  // Find the node with this uid
  const nodePath = findNodePathByUid(editor, uid);
  if (!nodePath) {
    console.warn("[applyNodeReplacementByUid] Node not found with uid:", uid);
    return { success: false, changeId };
  }
  
  // Get the original node
  const originalNode = Node.get(editor, nodePath);
  const originalText = extractTextFromNode(originalNode);
  const newText = extractTextFromNode(newNode);
  
  if (!originalText && !newText) {
    console.warn("[applyNodeReplacementByUid] Both texts are empty");
    return { success: false, changeId };
  }
  
  // Use text replacement approach for track changes visualization
  const textReplacementSuggestion: LLMSuggestion = {
    ...suggestion,
    type: "text_replacement",
    original_text: originalText,
    content: newText,
  };
  
  return applyTextReplacement(editor, textReplacementSuggestion, changeId);
}

// Apply node deletion by uid with track changes (strikethrough)
function applyNodeDeletionByUid(
  editor: TrackChangesEditor,
  suggestion: LLMSuggestion,
  changeId: string
): { success: boolean; changeId: string } {
  const uid = suggestion.uid!;
  
  const nodePath = findNodePathByUid(editor, uid);
  if (!nodePath) {
    console.warn("[applyNodeDeletionByUid] Node not found with uid:", uid);
    return { success: false, changeId };
  }
  
  const originalNode = Node.get(editor, nodePath);
  const originalText = extractTextFromNode(originalNode);
  
  if (!originalText) {
    // If node has no text, just remove it without track changes
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: nodePath });
    });
    return { success: true, changeId };
  }
  
  // Mark all text in the node as deleted (strikethrough)
  const deleteSuggestion: LLMSuggestion = {
    ...suggestion,
    type: "text_deletion",
    original_text: originalText,
  };
  
  return applyTextDeletion(editor, deleteSuggestion, changeId);
}

// Apply node insertion after uid with track changes (green text)
function applyNodeInsertAfterUid(
  editor: TrackChangesEditor,
  suggestion: LLMSuggestion,
  changeId: string
): { success: boolean; changeId: string } {
  const uid = suggestion.uid!;
  const newNode = suggestion.new_node;
  if (!isSlateDescendant(newNode)) {
    return { success: false, changeId };
  }
  
  // Find the reference node
  const nodePath = findNodePathByUid(editor, uid);
  
  // Calculate insertion path (after the found node, or at the end)
  let insertPath: Path;
  if (nodePath) {
    // Insert after this node (increment last index)
    insertPath = [...nodePath.slice(0, -1), nodePath[nodePath.length - 1] + 1];
  } else {
    // If reference node not found (e.g., empty document), insert at the end
    const childCount = editor.children.length;
    insertPath = [childCount];
  }
  
  const newText = extractTextFromNode(newNode);
  
  // Create new node with tracked insert marks on all text
  const timestamp = Date.now();
  const insertChange: TrackedChange = {
    changeId,
    changeType: "insert",
    timestamp,
  };
  
  // Clone new_node and add trackedChange to all text nodes
  const nodeWithTracking = addTrackedChangeToNode(newNode, insertChange);
  
  Editor.withoutNormalizing(editor, () => {
    Transforms.insertNodes(editor, nodeWithTracking, { at: insertPath });
  });
  
  return { success: true, changeId };
}

// Recursively add trackedChange to all text nodes in a node.
function addTrackedChangeToNode(node: Descendant, trackedChange: TrackedChange): Descendant {
  if (!node) return node;

  // If it's a text node, add the tracked change
  if (Text.isText(node)) {
    return { ...node, trackedChange } as CustomText;
  }

  // If it has children, recursively process them
  if (Array.isArray((node as any).children)) {
    return {
      ...node,
      children: ((node as any).children as Descendant[]).map(child => addTrackedChangeToNode(child, trackedChange)),
    } as Descendant;
  }
  
  return node;
}


function applyTextReplacement(
  editor: TrackChangesEditor,
  suggestion: LLMSuggestion,
  changeId: string
): { success: boolean; changeId: string } {
  const searchText = suggestion.original_text!;
  const newText = suggestion.content || "";

  // BUG #48: idempotency. Дублирует гард в applyLLMSuggestion на случай
  // прямого вызова через applyNodeReplacementByUid и тесты.
  for (const [node] of Node.texts(editor)) {
    if ((node as CustomText).trackedChange?.changeId === changeId) {
      return { success: true, changeId };
    }
  }

  // First, try exact match in a single node
  for (const [node, path] of Node.texts(editor)) {
    const text = node as CustomText;
    // Skip nodes already involved in a tracked change (prevents duplication on re-apply)
    if (text.trackedChange) continue;
    const textContent = text.text;
    const idx = textContent.indexOf(searchText);

    if (idx !== -1) {
      // Copy formatting from original node (fontFamily, fontSize, bold, italic, etc.)
      const { text: _, trackedChange: __, comment: ___, ...formatting } = text;
      
      Editor.withoutNormalizing(editor, () => {
        const startOffset = idx;
        const endOffset = idx + searchText.length;

        const startPoint: Point = { path, offset: startOffset };
        const endPoint: Point = { path, offset: endOffset };
        const range: Range = { anchor: startPoint, focus: endPoint };

        const timestamp = Date.now();
        
        // Use same changeId for both delete and insert so they are accepted/rejected together
        const deleteChange: TrackedChange = {
          changeId,
          changeType: "delete",
          timestamp,
        };

        Transforms.setNodes(
          editor,
          { trackedChange: deleteChange } as Partial<CustomText>,
          { at: range, match: Text.isText, split: true }
        );

        const insertChange: TrackedChange = {
          changeId,
          changeType: "insert",
          timestamp,
        };

        // Insert new text with same formatting as original
        Transforms.insertNodes(
          editor,
          { text: newText, ...formatting, trackedChange: insertChange } as CustomText,
          { at: endPoint }
        );
      });

      return { success: true, changeId };
    }
  }

  // If exact match failed, try normalized search (collapse whitespace, remove pipe separators)
  const normalizedSearch = normalizeWhitespace(searchText);

  for (const [node, path] of Node.texts(editor)) {
    const text = node as CustomText;
    if (text.trackedChange) continue;
    const textContent = text.text;
    const normalizedContent = collapseWhitespace(textContent);
    const idx = normalizedContent.indexOf(normalizedSearch);

    if (idx !== -1) {
      // Copy formatting from original node
      const { text: _, trackedChange: __, comment: ___, ...formatting } = text;
      
      // Find the actual positions in original text
      let actualStart = 0;
      let normalizedPos = 0;
      while (normalizedPos < idx && actualStart < textContent.length) {
        if (/\s/.test(textContent[actualStart])) {
          while (actualStart < textContent.length - 1 && /\s/.test(textContent[actualStart + 1])) {
            actualStart++;
          }
        }
        actualStart++;
        normalizedPos++;
      }
      
      // Find end position
      let actualEnd = actualStart;
      let searchPos = 0;
      while (searchPos < normalizedSearch.length && actualEnd < textContent.length) {
        if (/\s/.test(textContent[actualEnd])) {
          while (actualEnd < textContent.length - 1 && /\s/.test(textContent[actualEnd + 1])) {
            actualEnd++;
          }
        }
        actualEnd++;
        searchPos++;
      }

      Editor.withoutNormalizing(editor, () => {
        const startPoint: Point = { path, offset: actualStart };
        const endPoint: Point = { path, offset: actualEnd };
        const range: Range = { anchor: startPoint, focus: endPoint };

        const timestamp = Date.now();
        
        // Use same changeId for both delete and insert so they are accepted/rejected together
        const deleteChange: TrackedChange = {
          changeId,
          changeType: "delete",
          timestamp,
        };

        Transforms.setNodes(
          editor,
          { trackedChange: deleteChange } as Partial<CustomText>,
          { at: range, match: Text.isText, split: true }
        );

        const insertChange: TrackedChange = {
          changeId,
          changeType: "insert",
          timestamp,
        };

        // Insert new text with same formatting as original
        Transforms.insertNodes(
          editor,
          { text: newText, ...formatting, trackedChange: insertChange } as CustomText,
          { at: endPoint }
        );
      });

      return { success: true, changeId };
    }
  }

  // Try cross-node search
  const result = findTextAcrossNodes(editor, searchText);
  if (result) {
    // Get formatting from the first node in the range
    let formatting: Record<string, any> = {};
    try {
      const [startNode] = Editor.node(editor, result.start.path);
      if (startNode && typeof startNode === 'object' && 'text' in startNode) {
        const { text: _, trackedChange: __, comment: ___, ...nodeFormatting } = startNode as CustomText;
        formatting = nodeFormatting;
      }
    } catch (e) {
      // Ignore errors, use empty formatting
    }
    
    Editor.withoutNormalizing(editor, () => {
      const range: Range = { anchor: result.start, focus: result.end };

      const timestamp = Date.now();
      
      // Use same changeId for both delete and insert so they are accepted/rejected together
      const deleteChange: TrackedChange = {
        changeId,
        changeType: "delete",
        timestamp,
      };

      Transforms.setNodes(
        editor,
        { trackedChange: deleteChange } as Partial<CustomText>,
        { at: range, match: Text.isText, split: true }
      );

      const insertChange: TrackedChange = {
        changeId,
        changeType: "insert",
        timestamp,
      };

      // Insert new text with same formatting as original
      Transforms.insertNodes(
        editor,
        { text: newText, ...formatting, trackedChange: insertChange } as CustomText,
        { at: result.end }
      );
    });

    return { success: true, changeId };
  }

  console.warn('[trackChanges] Could not find text to replace:', searchText.substring(0, 50) + '...');
  return { success: false, changeId };
}

function findTextAcrossNodes(
  editor: Editor,
  searchText: string
): { start: Point; end: Point } | null {
  // charMap: for each character in combinedText, maps to { path, offset } in Slate
  // null for synthetic separators (spaces between blocks)
  const charMap: Array<{ path: Path; offset: number } | null> = [];
  // occupiedRanges: ranges in combinedText that are tracked changes (already applied)
  const occupiedRanges: Array<[number, number]> = [];
  let combinedText = '';
  let prevBlockPath = '';

  for (const [node, path] of Node.texts(editor)) {
    const customText = node as CustomText;
    const text = customText.text;
    const blockPath = path.slice(0, 1).join('-');

    // Add space between different blocks
    if (prevBlockPath && blockPath !== prevBlockPath) {
      charMap.push(null);
      combinedText += ' ';
    }

    const startPos = combinedText.length;

    for (let c = 0; c < text.length; c++) {
      charMap.push({ path, offset: c });
      combinedText += text[c];
    }

    // Track occupied ranges (already-applied tracked changes)
    if (customText.trackedChange) {
      occupiedRanges.push([startPos, combinedText.length]);
    }

    prevBlockPath = blockPath;
  }

  // Normalize: collapse whitespace and remove pipe separators
  const normalizedSearch = normalizeWhitespace(searchText);
  const normalizedCombined = collapseWhitespace(combinedText);

  // Build normalized→original index mapping
  const normToOrig: number[] = [];
  let oi = 0;
  for (let ni = 0; ni < normalizedCombined.length; ni++) {
    // Skip extra whitespace in original
    while (oi < combinedText.length && /\s/.test(combinedText[oi]) && normToOrig.length > 0) {
      const prevNorm = normToOrig.length - 1;
      if (normalizedCombined[prevNorm] === ' ' && /\s/.test(combinedText[oi])) {
        oi++;
        continue;
      }
      break;
    }
    normToOrig.push(oi);
    oi++;
  }

  // Search for match, skipping occupied ranges
  let searchFrom = 0;
  while (searchFrom <= normalizedCombined.length - normalizedSearch.length) {
    const idx = normalizedCombined.indexOf(normalizedSearch, searchFrom);
    if (idx === -1) return null;

    const origStart = normToOrig[idx] ?? idx;
    const origEnd = (normToOrig[idx + normalizedSearch.length - 1] ?? (idx + normalizedSearch.length - 1)) + 1;

    // Check if match overlaps any occupied range
    const overlapsOccupied = occupiedRanges.some(
      ([os, oe]) => origStart < oe && origEnd > os
    );

    if (!overlapsOccupied) {
      // Map back to Slate points
      const startMapping = charMap[origStart];
      // Find last valid charMap entry at or before origEnd-1
      let endMapping: { path: Path; offset: number } | null = null;
      for (let e = origEnd - 1; e >= origStart; e--) {
        if (charMap[e]) {
          endMapping = { path: charMap[e]!.path, offset: charMap[e]!.offset + 1 };
          break;
        }
      }

      if (startMapping && endMapping) {
        return {
          start: { path: startMapping.path, offset: startMapping.offset },
          end: { path: endMapping.path, offset: endMapping.offset },
        };
      }
    }

    // Try next occurrence
    searchFrom = idx + 1;
  }

  return null;
}


function applyTextAddition(
  editor: TrackChangesEditor,
  suggestion: LLMSuggestion,
  changeId: string
): { success: boolean; changeId: string } {
  const newText = suggestion.content || "";
  const position = suggestion.position || "end";

  // BUG #48: idempotency.
  for (const [node] of Node.texts(editor)) {
    if ((node as CustomText).trackedChange?.changeId === changeId) {
      return { success: true, changeId };
    }
  }

  let success = true;

  Editor.withoutNormalizing(editor, () => {
    const insertChange: TrackedChange = {
      changeId,
      changeType: "insert",
      timestamp: Date.now(),
    };

    if (position === "end") {
      const lastPath = [editor.children.length - 1];
      const lastNode = editor.children[editor.children.length - 1];

      if (Node.isNode(lastNode)) {
        const lastTextNode = Node.last(lastNode, []);
        if (lastTextNode) {
          const [lastText, lastTextPath] = lastTextNode;
          if (Text.isText(lastText)) {
            const fullPath = [...lastPath, ...lastTextPath];
            const point: Point = { path: fullPath, offset: lastText.text.length };

            Transforms.insertNodes(
              editor,
              { text: newText, trackedChange: insertChange } as CustomText,
              { at: point }
            );
          }
        }
      }
    } else if (position === "start") {
      const point: Point = { path: [0, 0], offset: 0 };
      Transforms.insertNodes(
        editor,
        { text: newText, trackedChange: insertChange } as CustomText,
        { at: point }
      );
    } else if ((position === "after" || position === "before") && suggestion.original_text) {
      // Find the top-level block containing the anchor text
      let anchorBlockIndex = -1;
      for (const [node, path] of Node.children(editor, [])) {
        if (Node.string(node).includes(suggestion.original_text)) {
          anchorBlockIndex = path[0];
          break;
        }
      }
      if (anchorBlockIndex >= 0) {
        const insertAt = position === "after" ? anchorBlockIndex + 1 : anchorBlockIndex;
        Transforms.insertNodes(
          editor,
          {
            type: "paragraph",
            children: [{ text: newText, trackedChange: insertChange }],
          } as unknown as Descendant,
          { at: [insertAt] }
        );
      } else {
        success = false;
      }
    }
  });

  return { success, changeId };
}


function applyTextDeletion(
  editor: TrackChangesEditor,
  suggestion: LLMSuggestion,
  changeId: string
): { success: boolean; changeId: string } {
  const searchText = suggestion.original_text!;

  // BUG #48: idempotency.
  for (const [node] of Node.texts(editor)) {
    if ((node as CustomText).trackedChange?.changeId === changeId) {
      return { success: true, changeId };
    }
  }

  for (const [node, path] of Node.texts(editor)) {
    const text = node as CustomText;
    // Skip nodes already involved in a tracked change (prevents duplication on re-apply)
    if (text.trackedChange) continue;
    const textContent = text.text;
    const idx = textContent.indexOf(searchText);

    if (idx !== -1) {
      Editor.withoutNormalizing(editor, () => {
        const startOffset = idx;
        const endOffset = idx + searchText.length;

        const startPoint: Point = { path, offset: startOffset };
        const endPoint: Point = { path, offset: endOffset };
        const range: Range = { anchor: startPoint, focus: endPoint };

        const deleteChange: TrackedChange = {
          changeId,
          changeType: "delete",
          timestamp: Date.now(),
        };

        Transforms.setNodes(
          editor,
          { trackedChange: deleteChange } as Partial<CustomText>,
          { at: range, match: Text.isText, split: true }
        );
      });

      return { success: true, changeId };
    }
  }

  return { success: false, changeId };
}

