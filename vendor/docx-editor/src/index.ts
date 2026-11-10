// CSS редактора для встраивания (build:lib → docx-editor.css): theme-токены +
// Tailwind-утилиты + компонентные стили, БЕЗ preflight/глобального base —
// чтобы host (cli-gateway без Tailwind) получил стилизованный тулбар, не
// ломая свои стили. Подробности — в src/lib.css.
import "./lib.css";

// React для монтирования
import React from "react";
import { createRoot, Root } from "react-dom/client";

// Main component exports
export { DocxEditor } from "./components/DocxEditor";
export type { DocxEditorProps, DocxEditorRef } from "./components/DocxEditor";

export { SlateEditor } from "./components/SlateEditor";
export type { Version, CompareState } from "./components/SlateEditor";

export { UnifiedDiff, SideBySideDiff } from "./components/VersionDiff";
export { VirtualizedReadOnlyDocument } from "./components/VirtualizedReadOnlyDocument";

// Notion-style UI components
export { BubbleMenu } from "./components/BubbleMenu";
export { SlashCommandMenu } from "./components/SlashCommandMenu";
export { SelectionMenu } from "./components/SelectionMenu";
export type { UIMode } from "./components/EditorToolbar";
export { HistoryPopover } from "./components/HistoryPopover";

// Layout engine exports
export { DocxLayoutEngine, parseDocxXml } from "./layout";
export type { Document, PageConfig, Page, Paragraph } from "./layout/types";

// Slate utilities
import { ensureUids as _ensureUids } from "./slate/documentToSlate";
export { documentToSlate, ensureUids, resetUidCounter } from "./slate/documentToSlate";
export { slateToDocument } from "./slate/slateToDocument";
export { withUids, initializeUidManager, resetUidManager, collectExistingUids } from "./slate/withUids";

// Local reference for use in this file
const ensureUids = _ensureUids;
export { saveDocumentAsDocx, buildDocxDocument, documentToDocxBytes } from "./slate/exportDocx";

// Track changes & Jinja utilities
export { withTrackChanges } from "./slate/trackChanges";
export type { TrackChangesEditor } from "./slate/trackChanges";
export { createJinjaDecorator, extractJinjaVariables } from "./slate/jinjaDecorator";

// Side-by-side comparison view
export { makeDiffDecorator, composeDecorators } from "./slate/withDiffDecorations";
export type { DiffStatus, InlineDiffRange, InlineDiffMap, DiffRangeMeta } from "./slate/withDiffDecorations";
export { DiffBlockContext, useDiffStatusForUid } from "./slate/DiffBlockContext";
export type { BlockDiffMap } from "./slate/DiffBlockContext";
export type { DiffMode } from "./components/SlateEditor";

// Variable popover
export { VariablePopover } from "./components/VariablePopover";
export type { VariablePopoverData } from "./components/VariablePopover";
export type { VariableClickData } from "./slate/leaves";

// Comments
export { CommentsProvider, useCommentsContext, useOptionalCommentsContext } from "./slate/CommentsContext";
export { CommentsPanel } from "./components/CommentsPanel";
export { AddCommentPopover, useAddComment } from "./components/AddCommentPopover";

// Types
import type { Descendant } from "slate";
import type { DocxEditorProps } from "./components/DocxEditor";
import { DocxEditor } from "./components/DocxEditor";

// Import Version type from SlateEditor
import type { Version, DiffMode } from "./components/SlateEditor";
import type { InlineDiffMap } from "./slate/withDiffDecorations";
import type { BlockDiffMap } from "./slate/DiffBlockContext";

// Export editor mode, track changes, and comment types
export type { EditorMode, TrackedChange, Comment, CommentMark, CommentStatus, CommentAuthor } from "./slate/types";
import type { EditorMode, TrackedChange, Comment, CommentAuthor } from "./slate/types";

/**
 * Mount options for the DocxEditor
 */
export interface MountOptions {
  /** Container element to mount into */
  container: HTMLElement;
  /** Editor props */
  props?: Partial<DocxEditorProps>;
  /** Callback when content changes */
  onContentChange?: (content: Descendant[]) => void;
  /** Callback when selection changes */
  onSelectionChange?: (selectedText: string | null) => void;
  /** Callback when save is requested */
  onSave?: (content: Descendant[], comment?: string) => void | boolean | Promise<void | boolean>;
  /** Callback when version is saved (to backend) */
  onVersionSave?: (content: Descendant[], comment: string) => void | boolean | Promise<void | boolean>;
  /** Callback when version is restored */
  onVersionRestore?: (version: Version) => void;
  /** Callback to request version content (for lazy loading) */
  onVersionRequest?: (versionId: string) => Promise<Descendant[] | null>;
  /** Callback when file is loaded */
  onFileLoad?: (filename: string) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Callback when editor mode changes */
  onModeChange?: (mode: EditorMode) => void;
  /**
   * Callback when a tracked change is accepted (inline в документе либо
   * через `mountedEditor.acceptChangeById`). Регистрируется ДО первого
   * рендера, чтобы не было окна гонки между mount и post-hoc
   * `setOnChangeAccepted` (см. bug #48 / refactor P0.2).
   */
  onChangeAccepted?: (changeId: string) => void;
  /** Callback when a tracked change is rejected. Аналогично onChangeAccepted. */
  onChangeRejected?: (changeId: string) => void;

  // Comments options
  /** Document ID for comments */
  documentId?: string;
  /** Current user for comments */
  currentUser?: CommentAuthor;
  /** Initial comments from backend */
  comments?: Comment[];
  /** Callback when comment is added */
  onCommentAdd?: (comment: Comment) => void;
  /** Callback when comment is updated */
  onCommentUpdate?: (comment: Comment) => void;
  /** Callback when comment is deleted */
  onCommentDelete?: (id: string) => void;
  /** Callback when comment is resolved */
  onCommentResolve?: (comment: Comment) => void;
  /** Callback when comment is reopened */
  onCommentReopen?: (comment: Comment) => void;
  /** Callback when user wants to add selected text to chat */
  onAddToChat?: (selectedText: string) => void;
  /**
   * Перенаправление compare-запроса из встроенного HistoryPopover наружу.
   * Когда задан — встроенный SideBySideDiff/UnifiedDiff не открывается;
   * Vue-обёртка получает событие и открывает свой DocumentComparisonView
   * (настоящие React-Slate'ы + table-aware diff).
   */
  onCompareRequested?: (leftVersionId: string, rightVersionId: string | null, mode: "unified" | "sideBySide") => void;
}

/**
 * Mounted editor instance
 */
export interface MountedEditor {
  /** Update props */
  update: (props: Partial<DocxEditorProps>) => void;
  /** Load a docx file */
  loadFile: (file: File) => Promise<void>;
  /** Load from ArrayBuffer */
  loadFromBuffer: (buffer: ArrayBuffer, filename?: string) => Promise<void>;
  /** Get current content */
  getContent: () => Descendant[] | null;
  hasUnsavedChanges: () => boolean;
  requestSave: (comment?: string) => Promise<boolean>;
  /** Get selected text */
  getSelectedText: () => string | null;
  /** Set content */
  setContent: (content: Descendant[]) => void;
  /** Set versions from backend */
  setVersions: (versions: Version[]) => void;
  /** Request version content (lazy load) */
  requestVersion: (versionId: string) => Promise<Version | null>;
  /** Export as docx */
  exportDocx: (filename?: string) => void;
  /** Unmount the editor */
  unmount: () => void;
  
  // Editor mode API
  /** Set editor mode (normal, redline, jinja) */
  setMode: (mode: EditorMode) => void;
  /** Get current editor mode */
  getMode: () => EditorMode;
  
  // Track changes API
  /** Get all tracked changes */
  getTrackedChanges: () => { change: TrackedChange; path: number[]; text: string }[];
  /** Accept a single change by ID */
  acceptChange: (changeId: string) => void;
  /** Reject a single change by ID */
  rejectChange: (changeId: string) => void;
  /** Accept all tracked changes */
  acceptAllChanges: () => void;
  /** Reject all tracked changes */
  rejectAllChanges: () => void;
  
  // Bidirectional sync with chat API
  /** Accept change by ID and return success status */
  acceptChangeById: (changeId: string) => boolean;
  /** Reject change by ID and return success status */
  rejectChangeById: (changeId: string) => boolean;
  /** Check if a change exists in the document */
  hasChange: (changeId: string) => boolean;
  /** Set callback for when a change is accepted */
  setOnChangeAccepted: (callback: ((changeId: string) => void) | undefined) => void;
  /** Set callback for when a change is rejected */
  setOnChangeRejected: (callback: ((changeId: string) => void) | undefined) => void;
  
  // AI Suggestion API
  /** Apply an AI suggestion to the document */
  applySuggestion: (suggestion: AISuggestion) => Promise<boolean>;
  
  // Comments API
  /** Get all comments */
  getComments: () => Comment[];
  /** Set comments from backend */
  setComments: (comments: Comment[]) => void;
  /** Toggle comments panel visibility */
  toggleCommentsPanel: () => void;
  /** Show comments panel */
  showCommentsPanel: () => void;
  /** Hide comments panel */
  hideCommentsPanel: () => void;
  
  // Template variables API
  /** Scroll to and highlight a template variable */
  scrollToVariable: (variableName: string) => boolean;
  /** Set variable labels mapping (key -> human-readable label) */
  setVariableLabels: (labels: Record<string, string>) => void;
  /** Set variable metadata for popover display (key -> { description, type, example }) */
  setVariableMetadata: (metadata: Record<string, { description?: string; type?: string; example?: string }>) => void;

  // --- Side-by-side comparison view ---
  /** DOM-элемент scrollable-контейнера. null до маунта. */
  getScrollableElement: () => HTMLElement | null;
  /** Включить/выключить режим сравнения. null — полностью убрать diff-разметку. */
  setDiffMode: (mode: DiffMode | null) => void;
  /** Карта блочной подсветки по element.uid. null — снять. */
  setBlockDiffMap: (map: BlockDiffMap | null) => void;
  /** Карта inline-подсветки слов по path-string (path.join(',')). null — снять. */
  setInlineDiffMap: (map: InlineDiffMap | null) => void;
  /** Проскроллить к узлу по пути (для prev/next-навигации в comparison view). */
  scrollToPath: (path: number[]) => void;
}

/**
 * AI Suggestion interface for LLM-generated changes
 */
export interface AISuggestion {
  id: string;
  type: 'text_addition' | 'text_replacement' | 'text_deletion' | 'node_replacement';
  content?: string;
  original_text?: string;
  /**
   * Позиция для text_addition: "end" | "start" | "after" | "before".
   * "after"/"before" используют original_text как якорный абзац.
   */
  position?: "start" | "end" | "after" | "before";
  description?: string;
  // For node_replacement type
  uid?: string;
  action?: 'replace' | 'delete' | 'insert_after';
  /** Slate-узел для вставки/замены. См. LLMSuggestion.new_node. */
  new_node?: unknown;
}

/**
 * Mount the DocxEditor into a container element
 * This is the main API for integrating the editor into any framework
 */
export function mountDocxEditor(options: MountOptions): MountedEditor {
  const { 
    container, 
    props = {}, 
    onContentChange,
    onSelectionChange,
    onSave, 
    onVersionSave, 
    onVersionRestore, 
    onVersionRequest, 
    onFileLoad, 
    onError, 
    onModeChange,
    onChangeAccepted,
    onChangeRejected,
    documentId,
    currentUser,
    comments: initialComments = [],
    onCommentAdd,
    onCommentUpdate,
    onCommentDelete,
    onCommentResolve,
    onCommentReopen,
    onAddToChat,
    onCompareRequested,
  } = options;

  // Initial track-change callbacks из options. Хранятся отдельно от
  // post-mount setOnChangeAccepted/setOnChangeRejected, чтобы регистрация
  // через MountOptions произошла СРАЗУ как только editorRef доступен —
  // без асинхронной паузы (см. P0.2).
  let pendingOnChangeAccepted: ((id: string) => void) | undefined = onChangeAccepted;
  let pendingOnChangeRejected: ((id: string) => void) | undefined = onChangeRejected;

  // P1.6: debounce onContentChange. Slate стреляет на каждое нажатие
  // клавиши; потребители (Vue → Pinia → бэкенд autosave) перерисовывают
  // дочерние компоненты на каждый callback. 300мс — компромисс между
  // отзывчивостью индикатора «несохранённое» и нагрузкой.
  // ВАЖНО: onSave/onSelectionChange не дебаунсим — они триггерятся явно
  // и должны быть синхронны.
  const CONTENT_CHANGE_DEBOUNCE_MS = 300;
  let contentChangeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastContent: Descendant[] | null = null;
  const flushContentChange = () => {
    if (contentChangeTimer !== null) {
      clearTimeout(contentChangeTimer);
      contentChangeTimer = null;
    }
    if (lastContent !== null && onContentChange) {
      const c = lastContent;
      lastContent = null;
      onContentChange(c);
    }
  };
  const debouncedContentChange = (content: Descendant[]) => {
    if (!onContentChange) return;
    lastContent = content;
    if (contentChangeTimer !== null) {
      clearTimeout(contentChangeTimer);
    }
    contentChangeTimer = setTimeout(flushContentChange, CONTENT_CHANGE_DEBOUNCE_MS);
  };
  
  let root: Root | null = null;
  let currentProps = { ...props };
  let currentVersions: Version[] = [];
  let currentComments: Comment[] = initialComments;
  let currentMode: EditorMode = props.mode || "normal";
  let editorRef: any = null;
  // Pending diff state: parent (DocumentComparisonView) часто шлёт setDiffMode
  // / setBlockDiffMap / setInlineDiffMap раньше, чем React успел резолвить ref
  // на DocxEditor — без буфера эти вызовы летят в `null?.()` и карты теряются,
  // подсветка не появляется. Применяем в refCallback при первом ref.
  let pendingDiffMode: DiffMode | null | undefined = undefined;
  let pendingBlockDiffMap: BlockDiffMap | null | undefined = undefined;
  let pendingInlineDiffMap: InlineDiffMap | null | undefined = undefined;
  const loadingVersions = new Set<string>();

  // Load version content on demand
  async function loadVersionIfNeeded(version: Version): Promise<Version> {
    if (version.content && version.content.length > 0) return version;
    if (loadingVersions.has(version.id)) return version;
    if (!onVersionRequest) return version;

    loadingVersions.add(version.id);
    try {
      const content = await onVersionRequest(version.id);
      if (content) {
        version.content = content;
        // Update in currentVersions
        const idx = currentVersions.findIndex(v => v.id === version.id);
        if (idx >= 0) currentVersions[idx] = { ...version };
        render();
      }
    } finally {
      loadingVersions.delete(version.id);
    }
    return version;
  }
  
  // Create ref callback. Сразу при появлении ref подключаем track-change
  // callbacks (если они были переданы в MountOptions) — это убирает окно
  // гонки, в которое юзер мог inline-accept'нуть правку до того, как
  // Vue-обёртка успела вызвать setOnChangeAccepted post-hoc.
  const refCallback = (ref: any) => {
    editorRef = ref;
    if (ref) {
      if (pendingOnChangeAccepted && typeof ref.setOnChangeAccepted === 'function') {
        ref.setOnChangeAccepted(pendingOnChangeAccepted);
        pendingOnChangeAccepted = undefined;
      }
      if (pendingOnChangeRejected && typeof ref.setOnChangeRejected === 'function') {
        ref.setOnChangeRejected(pendingOnChangeRejected);
        pendingOnChangeRejected = undefined;
      }
      // Применяем буферизованный diff state (см. pendingDiffMode/pending*DiffMap).
      // Порядок важен: сначала режим, потом карты — иначе setBlockDiffMap может
      // отработать раньше, чем editor поймёт что он в comparison-режиме.
      if (pendingDiffMode !== undefined && typeof ref.setDiffMode === 'function') {
        ref.setDiffMode(pendingDiffMode);
        pendingDiffMode = undefined;
      }
      if (pendingBlockDiffMap !== undefined && typeof ref.setBlockDiffMap === 'function') {
        ref.setBlockDiffMap(pendingBlockDiffMap);
        pendingBlockDiffMap = undefined;
      }
      if (pendingInlineDiffMap !== undefined && typeof ref.setInlineDiffMap === 'function') {
        ref.setInlineDiffMap(pendingInlineDiffMap);
        pendingInlineDiffMap = undefined;
      }
    }
  };
  
  // Render function
  const render = () => {
    if (!root) {
      root = createRoot(container);
    }
    
    const element = React.createElement(DocxEditor, {
      ...currentProps,
      versions: currentVersions,
      mode: currentMode,
      ref: refCallback,
      onContentChange: (content: Descendant[]) => {
        debouncedContentChange(content);
      },
      onSelectionChange: (selectedText: string | null) => {
        onSelectionChange?.(selectedText);
      },
      onSave: (content: Descendant[], comment?: string) => {
        // P1.6: явный save должен видеть последнее значение content,
        // даже если debounce ещё не сработал — иначе автосохранение
        // может уехать с устаревшим snapshot.
        flushContentChange();
        return onSave?.(content, comment);
      },
      onVersionSave: (version: Version) => {
        flushContentChange();
        return onVersionSave ? onVersionSave(version.content, version.description) : onSave?.(version.content, version.description);
      },
      onVersionRestore: (version: Version) => {
        onVersionRestore?.(version);
      },
      onVersionRequest: (versionId: string) => {
        const version = currentVersions.find(v => v.id === versionId);
        if (version) loadVersionIfNeeded(version);
      },
      onFileLoad: (filename: string) => {
        onFileLoad?.(filename);
      },
      onError: (error: Error) => {
        onError?.(error);
      },
      onModeChange: (mode: EditorMode) => {
        currentMode = mode;
        onModeChange?.(mode);
      },
      // Comments props
      documentId,
      currentUser,
      comments: currentComments,
      onCommentAdd: (comment: Comment) => {
        currentComments = [...currentComments, comment];
        onCommentAdd?.(comment);
      },
      onAddToChat: (selectedText: string) => {
        onAddToChat?.(selectedText);
      },
      onCommentUpdate,
      onCommentDelete: (id: string) => {
        currentComments = currentComments.filter(c => c.id !== id);
        onCommentDelete?.(id);
      },
      onCommentResolve,
      onCommentReopen,
      onCompareRequested,
    } as any);
    
    root.render(element);
  };
  
  // Initial render
  render();
  
  // Helper to wait for editor ref
  async function waitForEditorRef(maxAttempts = 20): Promise<boolean> {
    let attempts = 0;
    while (!editorRef && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    return !!editorRef;
  }
  
  return {
    update: (newProps: Partial<DocxEditorProps>) => {
      currentProps = { ...currentProps, ...newProps };
      if (newProps.mode !== undefined) {
        currentMode = newProps.mode;
      }
      render();
    },
    
    loadFile: async (file: File) => {
      if (editorRef?.loadDocx) {
        await editorRef.loadDocx(file);
      }
    },
    
    loadFromBuffer: async (buffer: ArrayBuffer, filename = "document.docx") => {
      const file = new File([buffer], filename, { 
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
      });
      
      // Wait for editorRef to be ready (React needs time to mount and set ref)
      await waitForEditorRef();
      
      if (editorRef?.loadDocx) {
        await editorRef.loadDocx(file);
      } else {
        console.error('[mountDocxEditor] editorRef.loadDocx not available after waiting');
      }
    },
    
    getContent: () => {
      return editorRef?.getContent?.() || null;
    },
    hasUnsavedChanges: () => editorRef?.hasUnsavedChanges() ?? false,
    requestSave: (comment) => editorRef?.requestSave(comment) ?? Promise.resolve(false),
    
    getSelectedText: () => {
      return editorRef?.getSelectedText?.() || null;
    },
    
    setContent: async (content: Descendant[]) => {
      await waitForEditorRef();
      
      if (editorRef?.setContent) {
        // Ensure all nodes have uid for stable AI suggestion references
        const contentWithUids = ensureUids(content);
        editorRef.setContent(contentWithUids);
      }
    },
    
    setVersions: (versions: Version[]) => {
      currentVersions = versions;
      render();
    },

    // Request specific version content (for lazy loading)
    requestVersion: async (versionId: string): Promise<Version | null> => {
      const version = currentVersions.find(v => v.id === versionId);
      if (!version) return null;
      return loadVersionIfNeeded(version);
    },
    
    exportDocx: (filename?: string) => {
      editorRef?.exportDocx?.(filename);
    },
    
    unmount: () => {
      // P1.6: flush последнего pending-content до unmount, чтобы не было
      // потерянных правок. И отменяем таймер, чтобы callback не выстрелил
      // после удаления.
      flushContentChange();
      if (contentChangeTimer !== null) {
        clearTimeout(contentChangeTimer);
        contentChangeTimer = null;
      }
      if (root) {
        root.unmount();
        root = null;
      }
      editorRef = null;
    },
    
    // Editor mode API
    setMode: (mode: EditorMode) => {
      currentMode = mode;
      if (editorRef?.setMode) {
        editorRef.setMode(mode);
      } else {
        // Fallback: update via props
        currentProps = { ...currentProps, mode };
        render();
      }
      onModeChange?.(mode);
    },
    
    getMode: () => {
      return editorRef?.getMode?.() ?? currentMode;
    },
    
    // Track changes API
    getTrackedChanges: () => {
      return editorRef?.getTrackedChanges?.() ?? [];
    },
    
    acceptChange: (changeId: string) => {
      editorRef?.acceptChange?.(changeId);
    },
    
    rejectChange: (changeId: string) => {
      editorRef?.rejectChange?.(changeId);
    },
    
    acceptAllChanges: () => {
      editorRef?.acceptAllChanges?.();
    },
    
    rejectAllChanges: () => {
      editorRef?.rejectAllChanges?.();
    },
    
    // New methods for bidirectional sync with chat
    acceptChangeById: (changeId: string): boolean => {
      return editorRef?.acceptChangeById?.(changeId) ?? false;
    },
    
    rejectChangeById: (changeId: string): boolean => {
      return editorRef?.rejectChangeById?.(changeId) ?? false;
    },
    
    hasChange: (changeId: string): boolean => {
      return editorRef?.hasChange?.(changeId) ?? false;
    },
    
    setOnChangeAccepted: (callback: ((changeId: string) => void) | undefined) => {
      editorRef?.setOnChangeAccepted?.(callback);
    },
    
    setOnChangeRejected: (callback: ((changeId: string) => void) | undefined) => {
      editorRef?.setOnChangeRejected?.(callback);
    },
    
    // AI Suggestion API
    applySuggestion: async (suggestion: AISuggestion): Promise<boolean> => {
      await waitForEditorRef();
      
      if (!editorRef) {
        console.error('[mountDocxEditor] No editor ref available for applySuggestion');
        return false;
      }
      
      console.log('[mountDocxEditor] Applying AI suggestion:', suggestion.id, suggestion.type);
      
      // Ensure redline mode is enabled for visual feedback
      const currentMode = editorRef.getMode?.() ?? 'normal';
      if (currentMode !== 'redline') {
        console.log('[mountDocxEditor] Switching to redline mode');
        editorRef.setMode?.('redline');
      }
      
      // P0.3: каноничное имя — `applySuggestion`. Если ref ещё не имеет
      // нового имени (старая версия React-компонента) — фолбэк на legacy
      // `applyLLMSuggestion`. После полной миграции legacy-ветку удалить.
      const applyFn = editorRef.applySuggestion ?? editorRef.applyLLMSuggestion;
      if (typeof applyFn === 'function') {
        try {
          const result = applyFn({
            id: suggestion.id,
            type: suggestion.type,
            content: suggestion.content,
            original_text: suggestion.original_text,
            position: suggestion.position,
            description: suggestion.description,
            // For node_replacement
            uid: suggestion.uid,
            action: suggestion.action,
            new_node: suggestion.new_node,
          });
          return result?.success ?? true;
        } catch (error) {
          console.error('[mountDocxEditor] applySuggestion failed:', error);
          return false;
        }
      }

      // Fallback: apply manually (without track changes)
      console.warn('[mountDocxEditor] applySuggestion not available, using fallback');
      const content = editorRef.getContent?.();
      if (!content || !Array.isArray(content)) {
        console.error('[mountDocxEditor] No content to apply suggestion to');
        return false;
      }
      
      try {
        const newContent = applyAISuggestionToContent(content, suggestion);
        editorRef.setContent(newContent);
        return true;
      } catch (error) {
        console.error('[mountDocxEditor] Fallback apply failed:', error);
        return false;
      }
    },
    
    // Comments API
    getComments: () => {
      return editorRef?.getComments?.() ?? currentComments;
    },
    
    setComments: (comments: Comment[]) => {
      currentComments = comments;
      editorRef?.setComments?.(comments);
      render();
    },
    
    toggleCommentsPanel: () => {
      editorRef?.toggleCommentsPanel?.();
    },
    
    showCommentsPanel: () => {
      // Toggle via editor ref
      editorRef?.toggleCommentsPanel?.();
    },
    
    hideCommentsPanel: () => {
      // Toggle via editor ref  
      editorRef?.toggleCommentsPanel?.();
    },
    
    // Template variables API
    scrollToVariable: (variableName: string): boolean => {
      console.log('[mountDocxEditor] scrollToVariable:', variableName, 'editorRef:', !!editorRef);
      return editorRef?.scrollToVariable?.(variableName) ?? false;
    },
    
    setVariableLabels: (labels: Record<string, string>) => {
      currentProps = { ...currentProps, variableLabels: labels };
      render();
    },

    setVariableMetadata: (metadata: Record<string, { description?: string; type?: string; example?: string }>) => {
      currentProps = { ...currentProps, variableMetadata: metadata };
      render();
    },

    // --- Side-by-side comparison view ---
    getScrollableElement: (): HTMLElement | null => {
      return editorRef?.getScrollableElement?.() ?? null;
    },
    setDiffMode: (mode: DiffMode | null) => {
      if (editorRef && typeof editorRef.setDiffMode === 'function') {
        editorRef.setDiffMode(mode);
      } else {
        pendingDiffMode = mode;
      }
    },
    setBlockDiffMap: (map: BlockDiffMap | null) => {
      if (editorRef && typeof editorRef.setBlockDiffMap === 'function') {
        editorRef.setBlockDiffMap(map);
      } else {
        // Editor ещё не зарезолвил React-ref — буферизуем, refCallback применит.
        pendingBlockDiffMap = map;
      }
    },
    setInlineDiffMap: (map: InlineDiffMap | null) => {
      if (editorRef && typeof editorRef.setInlineDiffMap === 'function') {
        editorRef.setInlineDiffMap(map);
      } else {
        pendingInlineDiffMap = map;
      }
    },
    scrollToPath: (path: number[]) => {
      editorRef?.scrollToPath?.(path);
    },
  };
}

/**
 * Apply AI suggestion to Slate content
 */
function applyAISuggestionToContent(content: Descendant[], suggestion: AISuggestion): Descendant[] {
  const newContent = JSON.parse(JSON.stringify(content));
  
  switch (suggestion.type) {
    case 'node_replacement':
      // Replace/delete/insert nodes - try uid first, fallback to original_text search
      // Note: uid is generated on-the-fly by backend and NOT stored in document content
      {
        const action = (suggestion as any).action || 'replace';
        const newNode = (suggestion as any).new_node;
        let success = false;
        
        // Try by uid first
        if (suggestion.uid) {
          if (action === 'replace' && newNode) {
            success = replaceNodeByUid(newContent, suggestion.uid, newNode);
          } else if (action === 'delete') {
            success = deleteNodeByUid(newContent, suggestion.uid);
          } else if (action === 'insert_after' && newNode) {
            success = insertNodeAfterUid(newContent, suggestion.uid, newNode);
          }
        }
        
        // Fallback to original_text search if uid not found
        if (!success && suggestion.original_text) {
          if (action === 'replace' && newNode) {
            replaceNodeByText(newContent, suggestion.original_text, newNode);
          } else if (action === 'delete') {
            deleteNodeByText(newContent, suggestion.original_text);
          }
          // insert_after doesn't make sense with text search
        }
      }
      break;
    
    case 'text_addition':
      // Add new paragraph at position
      const newParagraph = {
        type: 'paragraph',
        children: [{ text: suggestion.content }]
      };
      
      if (suggestion.position === 'start') {
        newContent.unshift(newParagraph);
      } else if (suggestion.position?.startsWith('between_paragraphs_')) {
        // Parse position like "between_paragraphs_2_3"
        const parts = suggestion.position.split('_');
        const afterIndex = parseInt(parts[2]) - 1;
        if (afterIndex >= 0 && afterIndex < newContent.length) {
          newContent.splice(afterIndex + 1, 0, newParagraph);
        } else {
          newContent.push(newParagraph);
        }
      } else {
        // Default: add at end
        newContent.push(newParagraph);
      }
      break;
      
    case 'text_replacement':
      // Find and replace text throughout the document
      if (suggestion.original_text && suggestion.content !== undefined) {
        replaceTextRecursively(newContent, suggestion.original_text, suggestion.content);
      }
      break;
      
    case 'text_deletion':
      // Find and delete text (replace with empty string)
      if (suggestion.original_text) {
        replaceTextRecursively(newContent, suggestion.original_text, '');
      }
      break;
  }
  
  return newContent;
}

/**
 * Find and replace a node by its uid
 */
function replaceNodeByUid(nodes: any[], uid: string, newNode: any): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].uid === uid) {
      nodes[i] = newNode;
      return true;
    }
    // Check children (for nested structures)
    if (nodes[i].children && Array.isArray(nodes[i].children)) {
      // Only check block-level children, not text nodes
      const children = nodes[i].children.filter((c: any) => c.type);
      if (children.length > 0 && replaceNodeByUid(nodes[i].children, uid, newNode)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Delete a node by its uid
 */
function deleteNodeByUid(nodes: any[], uid: string): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].uid === uid) {
      nodes.splice(i, 1);
      return true;
    }
    if (nodes[i].children && Array.isArray(nodes[i].children)) {
      const children = nodes[i].children.filter((c: any) => c.type);
      if (children.length > 0 && deleteNodeByUid(nodes[i].children, uid)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Insert a node after the node with given uid
 */
function insertNodeAfterUid(nodes: any[], uid: string, newNode: any): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].uid === uid) {
      nodes.splice(i + 1, 0, newNode);
      return true;
    }
    if (nodes[i].children && Array.isArray(nodes[i].children)) {
      const children = nodes[i].children.filter((c: any) => c.type);
      if (children.length > 0 && insertNodeAfterUid(nodes[i].children, uid, newNode)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if node or its children contain specific text
 */
function nodeContainsText(node: any, searchText: string): boolean {
  if (node.text !== undefined && typeof node.text === 'string') {
    return node.text.includes(searchText);
  }
  if (node.children && Array.isArray(node.children)) {
    return node.children.some((child: any) => nodeContainsText(child, searchText));
  }
  return false;
}

/**
 * Replace node by text content (find first node containing the text)
 */
function replaceNodeByText(nodes: any[], searchText: string, newNode: any): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodeContainsText(nodes[i], searchText)) {
      nodes[i] = newNode;
      return true;
    }
  }
  return false;
}

/**
 * Delete node by text content (find first node containing the text)
 */
function deleteNodeByText(nodes: any[], searchText: string): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodeContainsText(nodes[i], searchText)) {
      nodes.splice(i, 1);
      return true;
    }
  }
  return false;
}

/**
 * Recursively replace text in Slate nodes
 */
function replaceTextRecursively(nodes: any[], searchText: string, replaceText: string): void {
  for (const node of nodes) {
    if (node.text !== undefined && typeof node.text === 'string') {
      // Text leaf node
      if (node.text.includes(searchText)) {
        node.text = node.text.replace(searchText, replaceText);
      }
    } else if (node.children && Array.isArray(node.children)) {
      // Element node with children
      replaceTextRecursively(node.children, searchText, replaceText);
    }
  }
}

// Default export
export { DocxEditor as default } from "./components/DocxEditor";
