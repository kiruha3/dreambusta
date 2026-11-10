import React, { useCallback, useMemo, useState, useEffect, useRef, memo, forwardRef, useImperativeHandle, useDeferredValue } from "react";
import { createEditor, Descendant, Editor, Transforms, Element as SlateElement, Text, NodeEntry, Path, Range } from "slate";
import { Slate, Editable, withReact } from "slate-react";
import { withHistory, type HistoryEditor } from "slate-history";
import { IMAGE_DRAG_TYPE, moveDroppedImage } from "../slate/imageDrag";
import { renderElement } from "../slate/elements";
import { renderLeaf, setLeafContext, getLeafContext, createRenderLeaf, type LeafContext, type VariableClickData } from "../slate/leaves";
import { VariablePopover, type VariablePopoverData } from "./VariablePopover";
import { documentToSlate } from "../slate/documentToSlate";
import { slateToDocument } from "../slate/slateToDocument";
import { saveDocumentAsDocx } from "../slate/exportDocx";
import { isInTable, moveToNextCell, moveToPreviousCell } from "../slate/tableUtils";
import { isInList, indentListItem, outdentListItem, handleListEnter, handleListBackspace } from "../slate/listUtils";
import { createImageUploadHandler } from "../slate/imageUtils";
import { clearDocumentDefaultsCache, getDefaultMarks, setEditorDocDefaults } from "../slate/fontUtils";
import { withTrackChanges, TrackChangesEditor, applyLLMSuggestion, type LLMSuggestion } from "../slate/trackChanges";
import { withUids, initializeUidManager } from "../slate/withUids";
import { createJinjaDecorator } from "../slate/jinjaDecorator";
import { TrackChangesProvider } from "../slate/TrackChangesContext";
import { CommentsProvider, useCommentsContext } from "../slate/CommentsContext";
import { ReactEditor } from "slate-react";
import {
  makeDiffDecorator,
  composeDecorators,
  type InlineDiffMap,
  type DiffStatus as DiffStatusType,
} from "../slate/withDiffDecorations";
import { DiffBlockContext, type BlockDiffMap } from "../slate/DiffBlockContext";

export type DiffMode = "comparison";
import { I18nProvider, useTranslations } from "../i18n";
import { ThemeProvider, useEditorTheme, type EditorTheme } from "../theme";
import { EditorToolbar, type UIMode } from "./EditorToolbar";
import { DocumentDownloadAction } from "./DocumentDownloadAction";
import { HistoryPopover } from "./HistoryPopover";
import { UnifiedDiff, SideBySideDiff } from "./VersionDiff";
import { CommentsPanel } from "./CommentsPanel";
import { AddCommentPopover, useAddComment } from "./AddCommentPopover";
import { BubbleMenu } from "./BubbleMenu";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { SelectionMenu } from "./SelectionMenu";
import { Save, LayoutTemplate } from "lucide-react";
import type { Document, PageConfig } from "../layout/types";
import type { CustomElement, EditorMode, TrackedChange, Comment, CommentAuthor } from "../slate/types";

// Найти ближайший text-leaf в том же block-параграфе, у которого есть
// данный font-mark. Используется как paragraph-local fallback ДО глобального
// `getDefaultMarks` — чтобы при наборе в параграфе со своим шрифтом (не TNR)
// новый текст наследовал тот шрифт, а не fallback'ал в TNR из defaults.
//
// Возвращает значения mark'ов от первого подходящего leaf'а в текущем
// блоке. Не лезет в соседние блоки, чтобы не «утекать» шрифтом между
// абзацами с разными стилями.
function getParagraphLocalMarks(editor: Editor): { fontFamily?: string; fontSize?: number } {
  if (!editor.selection) return {};
  try {
    // Поднимаемся к ближайшему block-узлу (paragraph / heading / list-item / cell …).
    const blockEntry = Editor.above(editor, {
      match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n as SlateElement),
    });
    if (!blockEntry) return {};
    const [, blockPath] = blockEntry;

    const result: { fontFamily?: string; fontSize?: number } = {};
    for (const [textNode] of Editor.nodes(editor, {
      at: blockPath,
      match: (n) => Text.isText(n),
    })) {
      const t = textNode as Text & { fontFamily?: string; fontSize?: number };
      if (result.fontFamily === undefined && t.fontFamily) result.fontFamily = t.fontFamily;
      if (result.fontSize === undefined && t.fontSize) result.fontSize = t.fontSize;
      if (result.fontFamily !== undefined && result.fontSize !== undefined) break;
    }
    return result;
  } catch {
    return {};
  }
}

// Plugin to apply default marks for new text
const withDefaultMarks = (editor: Editor) => {
  const { insertText, insertBreak } = editor;

  // Резолюция шрифта при наборе нового текста:
  //   1. Editor.marks  — explicit cursor marks (toolbar-выбор / mark на leaf'е под кареткой).
  //   2. Paragraph-local — соседний leaf того же блока (наследуем шрифт абзаца).
  //   3. getDefaultMarks — global doc defaults (dominant font in first 100 nodes).
  //   4. FALLBACK_DEFAULTS внутри getDefaultMarks — TNR/14.
  // Раньше шага (2) не было, и при наборе в параграфе с пустым leaf-mark'ом
  // (DOCX без явного `<w:rFonts>` на run'е) текст уходил в TNR через шаг 3,
  // даже если соседний run в том же параграфе был, скажем, Arial.
  const resolveDefaults = (): { fontFamily?: string; fontSize?: number } => {
    const local = getParagraphLocalMarks(editor);
    if (local.fontFamily && local.fontSize) return local;
    const docDefaults = getDefaultMarks(editor);
    return {
      fontFamily: local.fontFamily || (docDefaults.fontFamily as string | undefined),
      fontSize: local.fontSize || (docDefaults.fontSize as number | undefined),
    };
  };

  editor.insertText = (text) => {
    const marks = Editor.marks(editor);
    if (!marks?.fontFamily || !marks?.fontSize) {
      const defaults = resolveDefaults();
      if (!marks?.fontFamily && defaults.fontFamily) {
        Editor.addMark(editor, "fontFamily", defaults.fontFamily);
      }
      if (!marks?.fontSize && defaults.fontSize) {
        Editor.addMark(editor, "fontSize", defaults.fontSize);
      }
    }
    insertText(text);
  };

  editor.insertBreak = () => {
    // Preserve marks across line breaks
    const marks = Editor.marks(editor);
    insertBreak();
    if (marks) {
      for (const [key, value] of Object.entries(marks)) {
        Editor.addMark(editor, key, value);
      }
    } else {
      // Apply defaults for new line — paragraph-local перед global.
      const defaults = resolveDefaults();
      if (defaults.fontFamily) {
        Editor.addMark(editor, "fontFamily", defaults.fontFamily);
      }
      if (defaults.fontSize) {
        Editor.addMark(editor, "fontSize", defaults.fontSize);
      }
    }
  };

  return editor;
};

interface SlateEditorProps {
  document: Document | null;
  initialContent?: Descendant[] | null;
  onDocumentChange?: (doc: Document) => void;
  onContentChange?: (content: Descendant[]) => void;
  /** Callback when selection changes (provides selected text or null) */
  onSelectionChange?: (selectedText: string | null) => void;
  /** External versions from backend */
  versions?: Version[];
  /** Callback when version is saved (to backend) */
  onVersionSave?: (content: Descendant[], comment: string) => void | boolean | Promise<void | boolean>;
  /** Callback when version is restored */
  onVersionRestore?: (version: Version) => void;
  /** Callback to request version content (for lazy loading) */
  onVersionRequest?: (versionId: string) => void;
  /** Whether the editor is in readonly mode */
  readOnly?: boolean;
  /** Editor mode (normal, redline, jinja) */
  mode?: EditorMode;
  /** Callback when mode changes */
  onModeChange?: (mode: EditorMode) => void;
  /** Document ID for comments */
  documentId?: string;
  /** Current user for comments (used for adding new comments) */
  currentUser?: CommentAuthor;
  /** Locale for i18n (default: 'ru') */
  locale?: "ru" | "en";
  /** Theme customization */
  theme?: Partial<EditorTheme>;
  /** UI mode: toolbar (classic) or notion (bubble menu + slash commands) */
  uiMode?: UIMode;
  /** Callback when UI mode changes */
  onUiModeChange?: (mode: UIMode) => void;
  /** Callback when user wants to add selected text to chat context */
  onAddToChat?: (selectedText: string) => void;
  /** Map of variable keys to human-readable labels (for jinja mode) */
  variableLabels?: Record<string, string>;
  /** Variable metadata for popover display (key -> { description, type, example }) */
  variableMetadata?: Record<string, { description?: string; type?: string; example?: string }>;
  /** Filename used for export (default: "document.docx") */
  exportFilename?: string;
  /** Whether the host allows client-side DOCX export. */
  canExport?: boolean;
  /** Optional host download for the preserved source file. */
  onDownloadOriginal?: () => void;
  /**
   * Когда задан — попытка войти в compare-режим (sideBySide / unified)
   * через HistoryPopover не переключает внутренний CompareState, а эмитит
   * наружу. Vue-обёртка использует это, чтобы открыть свой
   * `DocumentComparisonView` (настоящие React-Slate'ы + table-aware diff)
   * вместо встроенного `SideBySideDiff`/`UnifiedDiff`.
   */
  onCompareRequested?: (leftVersionId: string, rightVersionId: string | null, mode: "unified" | "sideBySide") => void;
}

const initialValue: Descendant[] = [
  { type: "paragraph", children: [{ text: "Start typing..." }] },
];

// Version type
export interface Version {
  id: string;
  timestamp: number;
  description: string;
  content: Descendant[];
}

// Compare state type
export interface CompareState {
  mode: "unified" | "sideBySide" | null;
  leftVersionId: string | null;
  rightVersionId: string | null;
}

// Extended editor type with track changes
type ExtendedEditor = Editor & TrackChangesEditor & HistoryEditor;

// Ref interface for SlateEditor
export interface SlateEditorRef {
  getContent: () => Descendant[];
  hasUnsavedChanges: () => boolean;
  requestSave: (comment?: string) => Promise<boolean>;
  getTrackedChanges: () => { change: TrackedChange; path: Path; text: string }[];
  acceptChange: (changeId: string) => void;
  rejectChange: (changeId: string) => void;
  acceptAllChanges: () => void;
  rejectAllChanges: () => void;
  // Bidirectional sync with chat
  acceptChangeById: (changeId: string) => boolean;
  rejectChangeById: (changeId: string) => boolean;
  hasChange: (changeId: string) => boolean;
  setOnChangeAccepted: (callback: ((changeId: string) => void) | undefined) => void;
  setOnChangeRejected: (callback: ((changeId: string) => void) | undefined) => void;
  setMode: (mode: EditorMode) => void;
  getMode: () => EditorMode;
  applyLLMSuggestion: (suggestion: LLMSuggestion) => { success: boolean; changeId: string };
  getComments: () => Comment[]; // Now extracts from editor content
  toggleCommentsPanel: () => void;
  getSelectedText: () => string | null;
  scrollToVariable: (variableName: string) => boolean; // Scroll to and highlight variable
  // --- Side-by-side comparison view ---
  getScrollableElement: () => HTMLElement | null;
  setDiffMode: (mode: DiffMode | null) => void;
  setBlockDiffMap: (map: BlockDiffMap | null) => void;
  setInlineDiffMap: (map: InlineDiffMap | null) => void;
  scrollToPath: (path: number[]) => void;
}

export const SlateEditor = memo(forwardRef<SlateEditorRef, SlateEditorProps>(function SlateEditor({
  document,
  initialContent,
  onDocumentChange,
  onContentChange,
  onSelectionChange,
  versions: externalVersions,
  onVersionSave,
  onVersionRestore,
  onVersionRequest,
  readOnly = false,
  mode: externalMode,
  onModeChange,
  documentId = "doc-" + Date.now(),
  currentUser,
  locale = "ru",
  theme,
  uiMode: externalUiMode,
  onUiModeChange,
  onAddToChat,
  variableLabels,
  variableMetadata,
  exportFilename,
  canExport = true,
  onDownloadOriginal,
  onCompareRequested,
}, ref) {
  // State for variable popover
  const [variablePopover, setVariablePopover] = useState<VariablePopoverData | null>(null);

  // --- Side-by-side comparison view state ---
  // Block diff: Map<element.uid, DiffStatus> — пересоздаём ссылку при смене,
  // чтобы Provider пробросил новое значение и блочные компоненты пере-рендерились.
  const [blockDiffMap, setBlockDiffMap] = useState<BlockDiffMap | null>(null);
  // Inline diff: Map<path-string, ranges> — читается через ленивый getter
  // в decorate-функции, поэтому держим в ref + dummy state для триггера ре-рендера.
  const inlineDiffMapRef = useRef<InlineDiffMap | null>(null);
  const [inlineDiffVersion, setInlineDiffVersion] = useState(0);
  const [diffMode, setDiffModeState] = useState<DiffMode | null>(null);
  // Scrollable container ref для синхронного скролла из comparison-view.
  const scrollableRef = useRef<HTMLDivElement | null>(null);

  // Create editor once with plugins (including track changes and uid management)
  const editor = useMemo(() => 
    withDefaultMarks(withUids(withTrackChanges(withHistory(withReact(createEditor()))))) as ExtendedEditor, 
    []
  );
  
  const [value, setValue] = useState<Descendant[]>(initialValue);
  const [pageConfig, setPageConfig] = useState<PageConfig | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [localVersions, setLocalVersions] = useState<Version[]>([]);
  const [internalMode, setInternalMode] = useState<EditorMode>("normal");
  
  // Use external mode if provided, otherwise use internal state
  const editorMode = externalMode ?? internalMode;
  
  // UI mode state (toolbar or notion)
  const [internalUiMode, setInternalUiMode] = useState<UIMode>("toolbar");
  const uiMode = externalUiMode ?? internalUiMode;
  
  const handleUiModeChange = useCallback((mode: UIMode) => {
    if (onUiModeChange) {
      onUiModeChange(mode);
    } else {
      setInternalUiMode(mode);
    }
  }, [onUiModeChange]);
  
  // Use external versions if provided, otherwise use local versions
  const versions = externalVersions ?? localVersions;
  
  // Compare state
  const [compareState, setCompareState] = useState<CompareState>({
    mode: null,
    leftVersionId: null,
    rightVersionId: null,
  });
  
  const changeCountRef = useRef(0);
  const contentEpochRef = useRef(0);
  const pendingSaveRef = useRef<object | null>(null);
  const requestSaveRef = useRef<(comment?: string) => Promise<boolean>>(async () => false);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const isInitializingRef = useRef(false);
  const prevInitialContentRef = useRef<string>("");
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  
  // Comments refs and state
  const commentsContextRef = useRef<ReturnType<typeof useCommentsContext> | null>(null);
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [commentsCount, setCommentsCount] = useState(0);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  
  // Default user if not provided
  const defaultUser: CommentAuthor = useMemo(() => ({
    id: 0,
    username: "Anonymous",
    firstName: "Anonymous",
    lastName: "User",
  }), []);
  
  const effectiveUser = currentUser || defaultUser;

  // Sync track changes enabled state with editor mode
  useEffect(() => {
    editor.setTrackChangesEnabled(editorMode === "redline");
  }, [editor, editorMode]);

  // Handle mode change
  const handleModeChange = useCallback((newMode: EditorMode) => {
    if (onModeChange) {
      onModeChange(newMode);
    } else {
      setInternalMode(newMode);
    }
  }, [onModeChange]);

  // Get tracked changes from editor
  const getTrackedChanges = useCallback(() => {
    return editor.getTrackedChanges();
  }, [editor]);

  // Accept a single change
  const acceptChange = useCallback((changeId: string) => {
    editor.acceptChange(changeId);
  }, [editor]);

  // Reject a single change
  const rejectChange = useCallback((changeId: string) => {
    editor.rejectChange(changeId);
  }, [editor]);

  // Accept all changes and exit redline mode
  const acceptAllChanges = useCallback(() => {
    editor.acceptAllChanges();
    // Exit redline mode after accepting all changes
    handleModeChange("normal");
  }, [editor, handleModeChange]);

  // Reject all changes
  const rejectAllChanges = useCallback(() => {
    editor.rejectAllChanges();
  }, [editor]);

  // Bidirectional sync methods
  const acceptChangeById = useCallback((changeId: string): boolean => {
    return editor.acceptChangeById(changeId);
  }, [editor]);

  const rejectChangeById = useCallback((changeId: string): boolean => {
    return editor.rejectChangeById(changeId);
  }, [editor]);

  const hasChange = useCallback((changeId: string): boolean => {
    return editor.hasChange(changeId);
  }, [editor]);

  const setOnChangeAccepted = useCallback((callback: ((changeId: string) => void) | undefined) => {
    editor.setOnChangeAccepted(callback);
  }, [editor]);

  const setOnChangeRejected = useCallback((callback: ((changeId: string) => void) | undefined) => {
    editor.setOnChangeRejected(callback);
  }, [editor]);

  // Apply LLM suggestion as track change
  const handleApplyLLMSuggestion = useCallback((suggestion: LLMSuggestion) => {
    // Ensure we're in redline mode for visual feedback
    if (!editor.isTrackChangesEnabled()) {
      handleModeChange("redline");
    }
    return applyLLMSuggestion(editor, suggestion);
  }, [editor, handleModeChange]);

  // Get selected text from editor
  const getSelectedText = useCallback(() => {
    const { selection } = editor;
    if (!selection || Range.isCollapsed(selection)) {
      return null;
    }
    return Editor.string(editor, selection);
  }, [editor]);

  // Handle variable click (show popover)
  const handleVariableClick = useCallback((data: VariableClickData) => {
    setVariablePopover(data);
  }, []);

  // Close variable popover
  const handleCloseVariablePopover = useCallback(() => {
    setVariablePopover(null);
  }, []);

  // Scroll to and highlight a variable in the document
  const scrollToVariable = useCallback((variableName: string): boolean => {
    const container = scrollableRef.current;
    if (!container) return false;
    // Remove previous highlights from all variables
    container.querySelectorAll('.template-variable.variable-highlight').forEach(el => {
      el.classList.remove('variable-highlight');
    });
    
    // Find all template variables and look for matching one
    const allVars = container.querySelectorAll('.template-variable');
    
    for (const el of allVars) {
      const dataName = el.getAttribute('data-variable-name');
      // Match by data-variable-name or by text content
      if (dataName === variableName || el.textContent?.trim() === variableName) {
        const htmlEl = el as HTMLElement;
        
        // Scroll into view
        htmlEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add highlight class
        htmlEl.classList.add('variable-highlight');
        
        // Remove highlight after animation
        setTimeout(() => {
          htmlEl.classList.remove('variable-highlight');
        }, 3000);
        
        return true;
      }
    }
    
    // Fallback: search in Slate nodes by text pattern
    const escapedName = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\{\\{\\s*${escapedName}\\s*\\}\\}`, 'i');
    
    const texts = Editor.nodes(editor, {
      at: [],
      match: n => Text.isText(n),
    });
    
    for (const [node, path] of texts) {
      const text = (node as any).text as string;
      const match = pattern.exec(text);
      
      if (match) {
        const range = {
          anchor: { path, offset: match.index },
          focus: { path, offset: match.index + match[0].length },
        };
        
        Transforms.select(editor, range);
        
        setTimeout(() => {
          const domSelection = window.getSelection();
          if (domSelection && domSelection.rangeCount > 0) {
            const domRange = domSelection.getRangeAt(0);
            domRange.startContainer.parentElement?.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
          }
        }, 50);
        
        return true;
      }
    }
    
    return false;
  }, [editor]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    getContent: () => editor.children,
    hasUnsavedChanges: () => hasUnsavedChangesRef.current,
    requestSave: (comment) => requestSaveRef.current(comment),
    getTrackedChanges,
    acceptChange,
    rejectChange,
    acceptAllChanges,
    rejectAllChanges,
    acceptChangeById,
    rejectChangeById,
    hasChange,
    setOnChangeAccepted,
    setOnChangeRejected,
    setMode: handleModeChange,
    getMode: () => editorMode,
    applyLLMSuggestion: handleApplyLLMSuggestion,
    getComments: () => commentsContextRef.current?.comments || [],
    toggleCommentsPanel: () => setShowCommentsPanel(prev => !prev),
    getSelectedText,
    scrollToVariable,
    // --- Side-by-side comparison view ---
    getScrollableElement: () => scrollableRef.current,
    setDiffMode: (mode: DiffMode | null) => setDiffModeState(mode),
    setBlockDiffMap: (map: BlockDiffMap | null) => {
      // Worker всегда возвращает свежий Map (см. useDocumentDiff.deserialiseSide),
      // и при `null` reference тоже меняется — Provider перерендерит consumer'ов.
      // Поэтому копировать (3000 entries на 80-страничном документе) не нужно.
      setBlockDiffMap(map);
    },
    setInlineDiffMap: (map: InlineDiffMap | null) => {
      inlineDiffMapRef.current = map;
      // Бампим версию: combinedDecorate пересчитается, Editable перерисует листья.
      setInlineDiffVersion(v => v + 1);
    },
    scrollToPath: (path: number[]) => {
      try {
        const node = Editor.node(editor, path);
        if (!node) return;
        const dom = ReactEditor.toDOMNode(editor, node[0]);
        if (dom && typeof dom.scrollIntoView === "function") {
          dom.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } catch {
        // путь может не существовать (документ изменился) — тихо игнорируем
      }
    },
  }), [getTrackedChanges, acceptChange, rejectChange, acceptAllChanges, rejectAllChanges, acceptChangeById, rejectChangeById, hasChange, setOnChangeAccepted, setOnChangeRejected, handleModeChange, editorMode, handleApplyLLMSuggestion, getSelectedText, scrollToVariable, editor]);

  // Helper function to load content
  const loadContent = useCallback((newContent: Descendant[]) => {
    contentEpochRef.current++;
    pendingSaveRef.current = null;
    isInitializingRef.current = true;
    if (contentChangeTimerRef.current) {
      clearTimeout(contentChangeTimerRef.current);
      contentChangeTimerRef.current = null;
    }
    // Clear document defaults cache on new content
    clearDocumentDefaultsCache(editor);
    
    // Initialize uid manager with existing uids from content
    initializeUidManager(newContent);
    
    let validContent = [...newContent];
    const last = validContent[validContent.length - 1] as CustomElement;
    if (last?.type !== "paragraph") {
      validContent = [...validContent, { type: "paragraph", children: [{ text: "" }] }];
    }
    
    // Selection, pending marks and undo batches reference the previous tree.
    // Reset them before notifying Slate consumers about the new version.
    editor.selection = null;
    editor.marks = null;
    editor.history = { undos: [], redos: [] };
    editor.operations = [];
    editor.children = validContent;
    setValue(validContent);
    if (prevSelectionRef.current) {
      prevSelectionRef.current = null;
      onSelectionChangeRef.current?.(null);
    }
    editor.onChange();
    
    setTimeout(() => {
      isInitializingRef.current = false;
      setHasUnsavedChanges(false);
      changeCountRef.current = 0;
    }, 0);
  }, [editor]);

  // Load content from initialContent or document
  useEffect(() => {
    // Priority: initialContent (Slate JSON) > document
    if (initialContent && initialContent.length > 0) {
      const contentStr = JSON.stringify(initialContent);
      // Only reload if content actually changed
      if (contentStr !== prevInitialContentRef.current) {
        prevInitialContentRef.current = contentStr;
        loadContent(initialContent);
      }
      return;
    }
    
    if (document) {
      try {
        const content = documentToSlate(document);
        const validContent = content.length > 0 ? content : initialValue;
        // docDefaults из layout-парсера (родом из <w:docDefaults>) перебивают
        // эвристический сэмплинг fontFamily/Size — это и есть истинный «default font»
        // документа для тулбара и для нового набора в пустом параграфе.
        setEditorDocDefaults(editor, document.docDefaults
          ? { fontFamily: document.docDefaults.family, fontSize: document.docDefaults.size }
          : null);
        loadContent(validContent);
        setPageConfig(document.pageConfig);
      } catch (e) {
        isInitializingRef.current = false;
      }
    }
  }, [document, initialContent, loadContent, editor]);

  // Save version
  const saveVersion = useCallback(async (comment?: string): Promise<boolean> => {
    if (readOnlyRef.current || pendingSaveRef.current) return false;
    const versionComment = comment || "Manual save";
    // Deep copy for version storage
    const contentCopy = JSON.parse(JSON.stringify(editor.children));
    
    // If external callback provided, use it (backend integration)
    if (onVersionSave) {
      const attempt = {};
      const epoch = contentEpochRef.current;
      const revision = changeCountRef.current;
      pendingSaveRef.current = attempt;
      try {
        const acknowledged = await onVersionSave(contentCopy, versionComment);
        if (acknowledged !== false && epoch === contentEpochRef.current && !readOnlyRef.current) {
          if (revision === changeCountRef.current) {
            setHasUnsavedChanges(false);
            hasUnsavedChangesRef.current = false;
            changeCountRef.current = 0;
          }
          return true;
        }
        return false;
      } catch {
        // The HTTP owner presents the error; failed/uncertain saves stay dirty.
        return false;
      } finally {
        if (pendingSaveRef.current === attempt) pendingSaveRef.current = null;
      }
    }
    
    // Otherwise use local storage
    const newVersion: Version = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      description: versionComment,
      content: contentCopy,
    };
    setLocalVersions(prev => [newVersion, ...prev].slice(0, 10));
    setHasUnsavedChanges(false);
    changeCountRef.current = 0;
    return true;
  }, [editor, onVersionSave]);
  requestSaveRef.current = saveVersion;

  // Track previous selection to detect changes
  const prevSelectionRef = useRef<string | null>(null);
  
  // Debounce timer for onContentChange
  const contentChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CONTENT_CHANGE_DEBOUNCE_MS = 300;

  // Ref for hasUnsavedChanges to avoid callback recreation
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  // Handle changes - optimized to avoid JSON.stringify on every keystroke
  const handleChange = useCallback((newValue: Descendant[]) => {
    setValue(newValue);

    // Ignore changes during initialization
    if (isInitializingRef.current) return;

    // Selection operations are not edits and cannot invalidate a save ACK.
    const contentChanged = editor.operations.some(operation => operation.type !== 'set_selection');
    if (contentChanged) {
      if (!hasUnsavedChangesRef.current) {
        setHasUnsavedChanges(true);
        hasUnsavedChangesRef.current = true;
      }
      changeCountRef.current++;

      if (onContentChange) {
        if (contentChangeTimerRef.current) clearTimeout(contentChangeTimerRef.current);
        contentChangeTimerRef.current = setTimeout(() => {
          onContentChange(newValue);
          contentChangeTimerRef.current = null;
        }, CONTENT_CHANGE_DEBOUNCE_MS);
      }
    }

    // Handle selection change
    if (onSelectionChange) {
      const { selection } = editor;
      const selectedText = selection && !Range.isCollapsed(selection)
        ? Editor.string(editor, selection)
        : null;
      const selectionKey = selectedText || "";
      if (selectionKey !== prevSelectionRef.current) {
        prevSelectionRef.current = selectionKey;
        onSelectionChange(selectedText);
      }
    }
  }, [editor, onSelectionChange, onContentChange]);
  
  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      contentEpochRef.current++;
      pendingSaveRef.current = null;
      if (contentChangeTimerRef.current) {
        clearTimeout(contentChangeTimerRef.current);
      }
    };
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey && event.key === "s") {
      event.preventDefault();
      if (!readOnly) {
      saveVersion();
      }
      return;
    }
    if (event.ctrlKey && event.key === "b") {
      event.preventDefault();
      toggleMark(editor, "bold");
      return;
    }
    if (event.ctrlKey && event.key === "i") {
      event.preventDefault();
      toggleMark(editor, "italic");
      return;
    }
    if (event.ctrlKey && event.key === "u") {
      event.preventDefault();
      toggleMark(editor, "underline");
      return;
    }
    // Escape to exit compare mode
    if (event.key === "Escape") {
      setCompareState(prev => {
        if (!prev.mode) return prev;
        return { ...prev, mode: null };
      });
      return;
    }
    if (event.key === "Tab") {
      if (isInTable(editor)) {
        event.preventDefault();
        event.shiftKey ? moveToPreviousCell(editor) : moveToNextCell(editor);
      } else if (isInList(editor)) {
        event.preventDefault();
        event.shiftKey ? outdentListItem(editor) : indentListItem(editor);
      }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && isInList(editor)) {
      if (handleListEnter(editor)) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === "Backspace" && isInList(editor)) {
      if (handleListBackspace(editor)) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === "Delete") {
      const [node] = Editor.nodes(editor, {
        match: n => SlateElement.isElement(n) && (n.type === "table" || n.type === "image"),
      });
      if (node) {
        event.preventDefault();
        Transforms.removeNodes(editor, { at: node[1] });
      }
    }
  }, [editor, saveVersion, readOnly]);

  // Normalize fragment to ensure indent properties are preserved (not undefined)
  const normalizeFragment = useCallback((fragment: Descendant[]): Descendant[] => {
    return fragment.map(node => {
      if ('text' in node) return node;

      const element = node as any;
      return {
        ...element,
        // Preserve indent properties as numbers (0 instead of undefined)
        indent: element.indent ?? 0,
        indentLeft: element.indentLeft ?? 0,
        indentRight: element.indentRight ?? 0,
        children: element.children ? normalizeFragment(element.children) : [],
      };
    });
  }, []);

  // Validate fragment to ensure valid structure
  const validateFragment = useCallback((fragment: any[]): Descendant[] => {
    return fragment.map(node => {
      if (typeof node.text === 'string') return node;

      if (!node.type) {
        return { type: 'paragraph', children: [{ text: '' }] };
      }

      return {
        ...node,
        children: node.children ? validateFragment(node.children) : [{ text: '' }],
      };
    });
  }, []);

  // Custom copy handler to preserve all properties
  const handleCopy = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const { selection } = editor;
    if (!selection) return;

    // Get fragment with full properties
    const fragment = Editor.fragment(editor, selection);

    // Normalize undefined values to 0
    const normalizedFragment = normalizeFragment(fragment);

    // Save to clipboard
    const encoded = JSON.stringify(normalizedFragment);
    event.clipboardData.setData('application/x-slate-fragment', btoa(encodeURIComponent(encoded)));
    event.clipboardData.setData('text/plain', Editor.string(editor, selection));
    event.preventDefault();
  }, [editor, normalizeFragment]);

  // Custom paste handler to validate properties
  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const slateFragment = event.clipboardData.getData('application/x-slate-fragment');

    if (slateFragment) {
      event.preventDefault();
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(slateFragment)));
        // Validate and normalize fragment
        const validatedFragment = validateFragment(decoded);
        Transforms.insertFragment(editor, validatedFragment);
      } catch {
        // Fallback to text paste
        const text = event.clipboardData.getData('text/plain');
        if (text) {
          Transforms.insertText(editor, text);
        }
      }
      return;
    }

    // Standard handling for plain text
  }, [editor, validateFragment]);

  // Export
  const handleExport = useCallback(() => {
    if (value && value.length > 0) {
      const doc = slateToDocument(value, pageConfig ?? undefined);
      saveDocumentAsDocx(doc, exportFilename || "document.docx");
    }
  }, [value, pageConfig, exportFilename]);

  // Restore version
  const handleRestoreVersion = useCallback((version: Version) => {
    // If external callback provided, use it (backend integration)
    if (onVersionRestore) {
      onVersionRestore(version);
      // Clear compare state after restore
      setCompareState({ mode: null, leftVersionId: null, rightVersionId: null });
      return;
    }
    
    // Otherwise restore locally
    setValue(version.content);
    editor.children = version.content;
    editor.onChange();
    // Clear compare state after restore
    setCompareState({ mode: null, leftVersionId: null, rightVersionId: null });
  }, [editor, onVersionRestore]);

  // Exit compare mode
  const exitCompareMode = useCallback(() => {
    setCompareState(prev => ({ ...prev, mode: null }));
  }, []);

  const pageStyle = useMemo(() => ({
    maxWidth: pageConfig ? `${pageConfig.width}px` : "800px",
    minHeight: "400px",
    backgroundColor: "var(--background)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    padding: pageConfig
      ? `${pageConfig.margins.top}px ${pageConfig.margins.right}px ${pageConfig.margins.bottom}px ${pageConfig.margins.left}px`
      : "40px",
    boxSizing: "border-box" as const,
    margin: "0 auto",
    overflowX: "auto" as const,
  }), [pageConfig]);

  // Jinja decorator - memoized based on mode
  const jinjaDecorate = useMemo(() => {
    return createJinjaDecorator(editorMode === "jinja");
  }, [editorMode]);

  // Diff decorator — читает inline-карту через ленивый getter из ref.
  // Memoized once: при смене карты сам decorate не пересоздаём, только бампим
  // inlineDiffVersion → Editable перезапросит decorate на следующем рендере.
  const diffDecorate = useMemo(() => makeDiffDecorator(() => inlineDiffMapRef.current), []);

  // Combined decorate: jinja + diff. Зависит от inlineDiffVersion, чтобы
  // Editable перерисовался при смене карты diff'а.
  const combinedDecorate = useMemo(
    () => composeDecorators(jinjaDecorate, diffDecorate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jinjaDecorate, diffDecorate, inlineDiffVersion]
  );

  // Get versions for comparison
  const leftVersion = versions.find(v => v.id === compareState.leftVersionId) || null;
  const rightVersion = versions.find(v => v.id === compareState.rightVersionId) || null;

  // Render content based on mode
  const renderContent = () => {
    if (compareState.mode === "sideBySide") {
      return (
        <div style={{
          width: "100%",
          height: "calc(100vh - 120px)",
        }}>
          <SideBySideDiff
            leftVersion={leftVersion}
            rightVersion={rightVersion}
            currentContent={value}
            onClose={exitCompareMode}
          />
        </div>
      );
    }

    if (compareState.mode === "unified") {
      return (
        <div style={{
          width: "100%",
          height: "calc(100vh - 120px)",
        }}>
          <UnifiedDiff
            leftVersion={leftVersion}
            rightVersion={rightVersion}
            currentContent={value}
            onClose={exitCompareMode}
          />
        </div>
      );
    }

    // Normal editor mode - page style applies only to the content area
    return (
      <div style={pageStyle}>
        <Editable
          renderElement={renderElement}
          renderLeaf={currentRenderLeaf}
          decorate={combinedDecorate}
          onKeyDown={handleKeyDown}
          onDragOver={event => {
            if (!readOnly && event.dataTransfer.types.includes(IMAGE_DRAG_TYPE)) {
              event.preventDefault();
              return true;
            }
            return false;
          }}
          onDrop={event => !readOnly && moveDroppedImage(editor, event)}
          onCopy={handleCopy}
          onPaste={handlePaste}
          placeholder="Start typing..."
          spellCheck
          readOnly={readOnly}
          style={{ minHeight: "200px", outline: "none", width: "100%" }}
          data-diff-mode={diffMode ?? undefined}
        />
      </div>
    );
  };

  // Handle add comment from toolbar
  const handleAddComment = useCallback(() => {
    const { selection } = editor;
    if (!selection || Range.isCollapsed(selection)) {
      return;
    }
    // Trigger the comment popover
    const fn = (window as any).__openCommentPopover;
    if (typeof fn === "function") {
      fn();
    }
  }, [editor]);

  // Use deferred values for non-critical UI updates
  // This keeps typing responsive while allowing UI indicators to update with lower priority
  const deferredCommentsCount = useDeferredValue(commentsCount);
  const deferredHasUnsavedChanges = useDeferredValue(hasUnsavedChanges);

  // Create renderLeaf that forces comment state to match SlateEditor state.
  // The module-level leafContext may lag behind due to render ordering,
  // so we patch it directly before each leaf render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const currentRenderLeaf = useCallback(
    (props: any) => {
      const ctx = getLeafContext();
      ctx.showCommentsPanel = showCommentsPanel;
      ctx.activeCommentId = activeCommentId;
      return renderLeaf(props);
    },
    [showCommentsPanel, activeCommentId, commentsCount]
  );

  // Перехватчик compareState: если внешний обработчик задан (Vue-обёртка),
  // эмитим наружу и НЕ переключаем внутренний режим — старые встроенные
  // SideBySideDiff/UnifiedDiff больше не показываются. Vue открывает
  // DocumentComparisonView (настоящие React-Slate'ы + table-aware diff).
  const handleCompareStateChange = useCallback((next: CompareState) => {
    if (next.mode && onCompareRequested && next.leftVersionId) {
      onCompareRequested(next.leftVersionId, next.rightVersionId, next.mode);
      // Сбросим выбор, чтобы при возврате из comparison-view popover был чист.
      setCompareState({ mode: null, leftVersionId: null, rightVersionId: null });
      return;
    }
    setCompareState(next);
  }, [onCompareRequested]);

  // History popover component - use deferred hasUnsavedChanges for indicator
  const historyPopover = (
    <HistoryPopover
      versions={versions}
      compareState={compareState}
      onCompareStateChange={handleCompareStateChange}
      onRestore={handleRestoreVersion}
      onVersionRequest={onVersionRequest}
      hasUnsavedChanges={deferredHasUnsavedChanges}
      onSave={saveVersion}
    />
  );

  return (
    <ThemeProvider theme={theme}>
    <I18nProvider locale={locale}>
    <DiffBlockContext.Provider value={blockDiffMap}>
    <CommentsProvider currentUser={effectiveUser}>
      <CommentsContextCapture
        contextRef={commentsContextRef}
        editor={editor}
        showCommentsPanel={showCommentsPanel}
        onShowCommentsPanelChange={setShowCommentsPanel}
        onCommentsCountChange={setCommentsCount}
        onActiveCommentIdChange={setActiveCommentId}
      />
      <div style={{ backgroundColor: "var(--muted)", height: "100%", display: "flex", flexDirection: "column" }}>
        <TrackChangesProvider onAcceptChange={acceptChange} onRejectChange={rejectChange}>
          <Slate editor={editor} initialValue={value} onChange={handleChange}>
            {/* Set leaf context for optimized rendering (avoids hooks in each leaf) */}
            <LeafContextSetter
              onAcceptChange={acceptChange}
              onRejectChange={rejectChange}
              showCommentsPanel={showCommentsPanel}
              variableLabels={variableLabels}
              variableMetadata={variableMetadata}
              onVariableClick={handleVariableClick}
            />
            {/* Read-only: явная плашка вместо тулбара редактирования (Bug 44).
                Показываем при любом readOnly (сравнение версий, публичный просмотр
                и т.п.), чтобы шрифт/размер/жирный не создавали ложное ощущение
                редактируемости. */}
            {readOnly && (
              <div className="docx-readonly-bar flex items-center justify-between gap-3 px-3 py-1.5 text-xs font-medium">
                <span>Только просмотр — редактирование недоступно</span>
                {canExport && (
                  <DocumentDownloadAction onDownloadCurrent={handleExport} onDownloadOriginal={onDownloadOriginal} />
                )}
              </div>
            )}
            {/* Editing toolbar — только когда редактирование доступно */}
            {uiMode === "toolbar" && !readOnly && (
              <EditorToolbar
                onImageUpload={createImageUploadHandler(editor)} 
                onExport={canExport ? handleExport : undefined}
                onDownloadOriginal={onDownloadOriginal}
                onSave={saveVersion}
                hasUnsavedChanges={deferredHasUnsavedChanges}
                historySlot={historyPopover}
                editorMode={editorMode}
                onModeChange={handleModeChange}
                onAcceptAllChanges={acceptAllChanges}
                onRejectAllChanges={rejectAllChanges}
                onAddComment={handleAddComment}
                onToggleCommentsPanel={() => setShowCommentsPanel(prev => !prev)}
                showCommentsPanel={showCommentsPanel}
                commentsCount={deferredCommentsCount}
                uiMode={uiMode}
                onUiModeChange={handleUiModeChange}
              />
            )}
            
            {/* Toolbar mode: Selection menu (only add to chat button) */}
            {uiMode === "toolbar" && !readOnly && (
              <SelectionMenu onAddToChat={onAddToChat} />
            )}
            
            {/* Notion mode: Bubble Menu and Slash Commands */}
            {uiMode === "notion" && !readOnly && (
              <>
                <BubbleMenu onAddToChat={onAddToChat} />
                <SlashCommandMenu />
              </>
            )}
            
            {/* Minimal toolbar in notion mode for mode switch (не в read-only) */}
            {uiMode === "notion" && !readOnly && (
              <div className="flex items-center justify-end gap-1 p-2 border-b" style={{ backgroundColor: "var(--background)" }}>
                <div className="relative">
                  <button
                    onClick={() => saveVersion()}
                    className="h-8 w-8 p-0 rounded hover:bg-accent flex items-center justify-center"
                    title="Сохранить версию (Ctrl+S)"
                  >
                    <Save className="h-4 w-4" />
                  </button>
                  {deferredHasUnsavedChanges && (
                    <div 
                      className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary"
                    />
                  )}
                </div>
                <button
                  onClick={() => handleUiModeChange("toolbar")}
                  className="h-8 w-8 p-0 rounded hover:bg-accent flex items-center justify-center"
                  title="Переключить на Toolbar режим"
                >
                  <LayoutTemplate className="h-4 w-4" />
                </button>
              </div>
            )}
            
            <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
              {/* Document content - scrollable. ref для синхронного скролла из comparison-view. */}
              <div ref={scrollableRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {renderContent()}
              </div>
              
              {/* Comments Panel - takes full height of container, scrolls independently */}
              {showCommentsPanel && (
                <div
                  style={{
                    animation: "comments-panel-slide-in 0.2s ease-out",
                    flexShrink: 0,
                  }}
                >
                  <CommentsPanel
                    currentUser={effectiveUser}
                    onClose={() => setShowCommentsPanel(false)}
                  />
                </div>
              )}
            </div>
            
            {/* Add Comment Popover */}
            <AddCommentPopover
              currentUser={effectiveUser}
              documentId={documentId}
            />

            {/* Variable Popover (shown when clicking on template variable) */}
            {variablePopover && (
              <VariablePopover
                variable={variablePopover}
                onClose={handleCloseVariablePopover}
              />
            )}
          </Slate>
        </TrackChangesProvider>
      </div>
    </CommentsProvider>
    </DiffBlockContext.Provider>
    </I18nProvider>
    </ThemeProvider>
  );
}));

// Helper component to capture comments context ref and register editor
// Also syncs external showCommentsPanel state with context
function CommentsContextCapture({
  contextRef,
  editor,
  showCommentsPanel,
  onShowCommentsPanelChange,
  onCommentsCountChange,
  onActiveCommentIdChange,
}: {
  contextRef: React.MutableRefObject<ReturnType<typeof useCommentsContext> | null>;
  editor: Editor;
  showCommentsPanel: boolean;
  onShowCommentsPanelChange: (show: boolean) => void;
  onCommentsCountChange: (count: number) => void;
  onActiveCommentIdChange: (id: string | null) => void;
}) {
  const context = useCommentsContext();

  // Keep a stable ref to context to avoid re-triggering effects
  const contextStableRef = useRef(context);
  contextStableRef.current = context;

  // Track sync direction to prevent bidirectional ping-pong
  const isSyncingRef = useRef(false);

  useEffect(() => {
    contextRef.current = context;
  });

  // Register editor with comments context — only run once per editor instance
  useEffect(() => {
    contextStableRef.current.setEditor(editor);
    return () => contextStableRef.current.setEditor(null);
  }, [editor]);

  // Sync external showCommentsPanel state → context
  useEffect(() => {
    if (isSyncingRef.current) return;
    if (contextStableRef.current.showCommentsPanel !== showCommentsPanel) {
      isSyncingRef.current = true;
      contextStableRef.current.setShowCommentsPanel(showCommentsPanel);
      // Reset after React processes the state update
      requestAnimationFrame(() => { isSyncingRef.current = false; });
    }
  }, [showCommentsPanel]);

  // Sync context changes back → external state
  useEffect(() => {
    if (isSyncingRef.current) return;
    if (context.showCommentsPanel !== showCommentsPanel) {
      isSyncingRef.current = true;
      onShowCommentsPanelChange(context.showCommentsPanel);
      requestAnimationFrame(() => { isSyncingRef.current = false; });
    }
  }, [context.showCommentsPanel, onShowCommentsPanelChange, showCommentsPanel]);

  // Sync comments count → parent (reactive, via context)
  useEffect(() => {
    onCommentsCountChange(context.comments.length);
  }, [context.comments.length, onCommentsCountChange]);

  // Sync activeCommentId → parent so leaves re-render on comment selection
  useEffect(() => {
    onActiveCommentIdChange(context.activeCommentId);
  }, [context.activeCommentId, onActiveCommentIdChange]);

  return null;
}

// Component to set leaf context with all required values
// Must be inside all providers (Theme, I18n, Comments, TrackChanges)
function LeafContextSetter({
  onAcceptChange,
  onRejectChange,
  showCommentsPanel,
  variableLabels,
  variableMetadata,
  onVariableClick,
}: {
  onAcceptChange: (changeId: string) => void;
  onRejectChange: (changeId: string) => void;
  showCommentsPanel: boolean;
  variableLabels?: Record<string, string>;
  variableMetadata?: Record<string, { description?: string; type?: string; example?: string }>;
  onVariableClick?: (data: VariableClickData) => void;
}) {
  const commentsContext = useCommentsContext();
  const theme = useEditorTheme();
  const t = useTranslations();

  // Update leaf context SYNCHRONOUSLY during render, not in useEffect.
  // This ensures leafContext is always up-to-date when Slate renders leaves.
  const ctx: LeafContext = {
    onAcceptChange,
    onRejectChange,
    activeCommentId: commentsContext.activeCommentId,
    showCommentsPanel,
    setActiveCommentId: commentsContext.setActiveCommentId,
    theme,
    commentPrefix: t.comments.commentPrefix,
    variableLabels,
    variableMetadata,
    onVariableClick,
  };
  setLeafContext(ctx);

  return null;
}

// Helpers
type MarkFormat = "bold" | "italic" | "underline" | "strikethrough";

function toggleMark(editor: Editor, format: MarkFormat) {
  const marks = Editor.marks(editor) as Record<string, boolean> | null;
  if (marks?.[format]) {
    Editor.removeMark(editor, format);
  } else {
    Editor.addMark(editor, format, true);
  }
}

export default SlateEditor;
