import React, { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from "react";
import { Descendant } from "slate";
import { SlateEditor, Version, CompareState, SlateEditorRef, type DiffMode } from "./SlateEditor";
import type { InlineDiffMap } from "../slate/withDiffDecorations";
import type { BlockDiffMap } from "../slate/DiffBlockContext";
import { parseDocxXml } from "../layout";
import { documentToSlate } from "../slate/documentToSlate";
import { slateToDocument } from "../slate/slateToDocument";
import { saveDocumentAsDocx } from "../slate/exportDocx";
import type { Document, PageConfig } from "../layout/types";
import type { EditorMode, TrackedChange, Comment, CommentAuthor } from "../slate/types";
import { Upload, FileText, X } from "lucide-react";

export interface DocxEditorProps {
  /** Initial document content */
  initialDocument?: Document | null;
  /** Initial Slate content (alternative to initialDocument) */
  initialContent?: Descendant[] | null;
  /** Page configuration */
  pageConfig?: PageConfig | null;
  /** Callback when content changes */
  onContentChange?: (content: Descendant[]) => void;
  /** Callback when selection changes */
  onSelectionChange?: (selectedText: string | null) => void;
  /** Callback when document is saved */
  onSave?: (content: Descendant[], comment?: string) => void | boolean | Promise<void | boolean>;
  /** External versions for history */
  versions?: Version[];
  /** Callback when version is saved */
  onVersionSave?: (version: Version) => void | boolean | Promise<void | boolean>;
  /** Callback when version is restored */
  onVersionRestore?: (version: Version) => void;
  /** Callback to request version content (for lazy loading) */
  onVersionRequest?: (versionId: string) => void;
  /** Callback when file is loaded */
  onFileLoad?: (filename: string, document: Document) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Whether to show file upload UI */
  showFileUpload?: boolean;
  /** Custom placeholder text */
  placeholder?: string;
  /** Read-only mode */
  readOnly?: boolean;
  /** CSS class for container */
  className?: string;
  /** Inline styles for container */
  style?: React.CSSProperties;
  /** Editor mode (normal, redline, jinja) */
  mode?: EditorMode;
  /** Callback when mode changes */
  onModeChange?: (mode: EditorMode) => void;
  
  // Comments props
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
  /** Callback when user wants to add selected text to chat context */
  onAddToChat?: (selectedText: string) => void;
  /** Map of variable keys to human-readable labels (for jinja mode) */
  variableLabels?: Record<string, string>;
  /** Metadata displayed when a template variable is selected. */
  variableMetadata?: Record<string, { description?: string; type?: string; example?: string }>;
  /** Document title used as export filename (e.g. "Договор поставки") */
  documentTitle?: string;
  /** Whether the host allows client-side DOCX export. */
  canExport?: boolean;
  locale?: "ru" | "en";
  /** Optional host download for the preserved source file. */
  onDownloadOriginal?: () => void;
  /** Перенаправление compare из HistoryPopover наружу (см. SlateEditorProps). */
  onCompareRequested?: (leftVersionId: string, rightVersionId: string | null, mode: "unified" | "sideBySide") => void;
}

export interface DocxEditorRef {
  hasUnsavedChanges: () => boolean;
  requestSave: (comment?: string) => Promise<boolean>;
  /** Get current Slate content */
  getContent: () => Descendant[] | null;
  /** Set Slate content */
  setContent: (content: Descendant[]) => void;
  /** Load a docx file */
  loadDocx: (file: File) => Promise<void>;
  /** Load from ArrayBuffer */
  loadFromBuffer: (buffer: ArrayBuffer, filename?: string) => Promise<void>;
  /** Export current content as docx */
  exportDocx: (filename?: string) => void;
  /** Get current document */
  getDocument: () => Document | null;
  /** Get page config */
  getPageConfig: () => PageConfig | null;
  /** Set editor mode */
  setMode: (mode: EditorMode) => void;
  /** Get current editor mode */
  getMode: () => EditorMode;
  /** Get tracked changes */
  getTrackedChanges: () => { change: TrackedChange; path: number[]; text: string }[];
  /** Accept a single change */
  acceptChange: (changeId: string) => void;
  /** Reject a single change */
  rejectChange: (changeId: string) => void;
  /** Accept all changes */
  acceptAllChanges: () => void;
  /** Reject all changes */
  rejectAllChanges: () => void;
  /** Scroll to and highlight a template variable */
  scrollToVariable: (variableName: string) => boolean;
  /** Get selected text */
  getSelectedText: () => string | null;
  // --- Side-by-side comparison view ---
  /** DOM-элемент scrollable-контейнера (для синхронного скролла из comparison-view) */
  getScrollableElement: () => HTMLElement | null;
  /** Включить/выключить режим сравнения */
  setDiffMode: (mode: DiffMode | null) => void;
  /** Карта блочной подсветки по uid */
  setBlockDiffMap: (map: BlockDiffMap | null) => void;
  /** Карта inline-подсветки по path-string */
  setInlineDiffMap: (map: InlineDiffMap | null) => void;
  /** Проскроллить редактор к узлу по пути */
  scrollToPath: (path: number[]) => void;
}

export const DocxEditor = forwardRef<DocxEditorRef, DocxEditorProps>(function DocxEditor({
  initialDocument = null,
  initialContent = null,
  pageConfig: externalPageConfig = null,
  onContentChange,
  onSelectionChange,
  onSave,
  versions: externalVersions,
  onVersionSave,
  onVersionRestore,
  onVersionRequest,
  onFileLoad,
  onError,
  showFileUpload = true,
  placeholder,
  readOnly = false,
  className,
  style,
  mode: externalMode,
  onModeChange,
  documentId,
  currentUser,
  comments,
  onCommentAdd,
  onCommentUpdate,
  onCommentDelete,
  onCommentResolve,
  onCommentReopen,
  onAddToChat,
  variableLabels,
  variableMetadata,
  documentTitle,
  canExport = true,
  locale = "ru",
  onDownloadOriginal,
  onCompareRequested,
}, ref) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slateEditorRef = useRef<SlateEditorRef | null>(null);
  // Pending diff state: parent зовёт setDiffMode/setBlockDiffMap/setInlineDiffMap
  // через imperative handle, но `slateEditorRef.current` резолвится только
  // после первого рендера SlateEditor. Без буфера ранние вызовы летят в
  // `slateEditorRef.current?.setBlockDiffMap?.()` = no-op, карта теряется,
  // и одна из двух панелей side-by-side compare остаётся без подсветки.
  const pendingDiffModeRef = useRef<DiffMode | null | undefined>(undefined);
  const pendingBlockDiffMapRef = useRef<BlockDiffMap | null | undefined>(undefined);
  const pendingInlineDiffMapRef = useRef<InlineDiffMap | null | undefined>(undefined);
  // Callback ref для SlateEditor: вместо useRef-object используем callback,
  // чтобы знать момент когда React зарезолвил imperative handle и применить
  // буферизованные diff-вызовы.
  const slateRefCallback = useCallback((handle: SlateEditorRef | null) => {
    slateEditorRef.current = handle;
    if (!handle) return;
    if (pendingDiffModeRef.current !== undefined && handle.setDiffMode) {
      handle.setDiffMode(pendingDiffModeRef.current);
      pendingDiffModeRef.current = undefined;
    }
    if (pendingBlockDiffMapRef.current !== undefined && handle.setBlockDiffMap) {
      handle.setBlockDiffMap(pendingBlockDiffMapRef.current);
      pendingBlockDiffMapRef.current = undefined;
    }
    if (pendingInlineDiffMapRef.current !== undefined && handle.setInlineDiffMap) {
      handle.setInlineDiffMap(pendingInlineDiffMapRef.current);
      pendingInlineDiffMapRef.current = undefined;
    }
  }, []);
  const [document, setDocument] = useState<Document | null>(initialDocument);
  const [content, setContent] = useState<Descendant[] | null>(initialContent);
  const [pageConfig, setPageConfig] = useState<PageConfig | null>(externalPageConfig);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadedFilename, setLoadedFilename] = useState<string | null>(null);
  const [internalMode, setInternalMode] = useState<EditorMode>(externalMode ?? "normal");

  // Always use internal mode (which is synced from external when it changes)
  const editorMode = internalMode;

  // Sync external mode prop to internal state
  useEffect(() => {
    if (externalMode !== undefined) {
      setInternalMode(externalMode);
    }
  }, [externalMode]);

  // Sync initialContent prop changes to state (for cases when content arrives after mount)
  useEffect(() => {
    if (initialContent && initialContent.length > 0 && !content) {
      setContent(initialContent);
    }
  }, [initialContent]);

  // Handle mode change
  const handleModeChange = useCallback((newMode: EditorMode) => {
    setInternalMode(newMode);
    onModeChange?.(newMode);
  }, [onModeChange]);

  // Load docx from ArrayBuffer
  const loadFromBuffer = useCallback(async (buffer: ArrayBuffer, filename = "document.docx") => {
    setLoading(true);
    setError(null);

    try {
      const parsedDocument = await parseDocxXml(buffer);
      setDocument(parsedDocument);
      setPageConfig(parsedDocument.pageConfig);
      setLoadedFilename(filename);
      
      // Convert to Slate content
      const slateContent = documentToSlate(parsedDocument);
      setContent(slateContent);
      
      onFileLoad?.(filename, parsedDocument);
    } catch (err) {
      console.error("Error processing DOCX:", err);
      const error = err instanceof Error ? err : new Error("Ошибка при загрузке файла");
      setError(error.message);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [onFileLoad, onError]);

  // Load docx file
  const loadDocxFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      const error = new Error("Выберите файл .docx");
      setError(error.message);
      onError?.(error);
      return;
    }

    const buffer = await file.arrayBuffer();
    await loadFromBuffer(buffer, file.name);
  }, [loadFromBuffer, onError]);

  // Handle file input change
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await loadDocxFile(file);
    }
    // Reset input
    if (event.target) {
      event.target.value = "";
    }
  }, [loadDocxFile]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await loadDocxFile(file);
    }
  }, [loadDocxFile]);

  // Handle document change from editor
  const handleDocumentChange = useCallback((newDoc: Document) => {
    setDocument(newDoc);
    const slateContent = documentToSlate(newDoc);
    setContent(slateContent);
    onContentChange?.(slateContent);
  }, [onContentChange]);

  // Compute the export filename from available sources
  const resolvedExportFilename = loadedFilename || (documentTitle ? `${documentTitle}.docx` : "document.docx");

  // Export as docx
  const exportDocx = useCallback((filename = resolvedExportFilename) => {
    if (content && content.length > 0) {
      const doc = slateToDocument(content, pageConfig ?? undefined);
      saveDocumentAsDocx(doc, filename);
    }
  }, [content, pageConfig, resolvedExportFilename]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    getContent: () => slateEditorRef.current?.getContent?.() ?? content,
    hasUnsavedChanges: () => slateEditorRef.current?.hasUnsavedChanges() ?? false,
    requestSave: (comment) => slateEditorRef.current?.requestSave(comment) ?? Promise.resolve(false),
    getSelectedText: () => slateEditorRef.current?.getSelectedText?.() ?? null,
    setContent: (newContent: Descendant[]) => {
      setContent(newContent);
      onContentChange?.(newContent);
    },
    loadDocx: loadDocxFile,
    loadFromBuffer,
    exportDocx,
    getDocument: () => document,
    getPageConfig: () => pageConfig,
    setMode: handleModeChange,
    getMode: () => editorMode,
    getTrackedChanges: () => slateEditorRef.current?.getTrackedChanges() ?? [],
    acceptChange: (changeId: string) => slateEditorRef.current?.acceptChange(changeId),
    rejectChange: (changeId: string) => slateEditorRef.current?.rejectChange(changeId),
    acceptAllChanges: () => slateEditorRef.current?.acceptAllChanges(),
    rejectAllChanges: () => slateEditorRef.current?.rejectAllChanges(),
    // P0.3: каноничное имя — `applySuggestion` (соответствует MountedEditor
    // и DocxEditorAPI). `applyLLMSuggestion` оставлен как deprecated-alias
    // на короткое время — будет удалён вместе с Slate-impl при миграции
    // на ProseMirror.
    applySuggestion: (suggestion: any) => slateEditorRef.current?.applyLLMSuggestion?.(suggestion),
    /** @deprecated используйте `applySuggestion`. */
    applyLLMSuggestion: (suggestion: any) => slateEditorRef.current?.applyLLMSuggestion?.(suggestion),
    scrollToVariable: (variableName: string) => slateEditorRef.current?.scrollToVariable?.(variableName) ?? false,
    // --- Side-by-side comparison view ---
    getScrollableElement: () => slateEditorRef.current?.getScrollableElement?.() ?? null,
    setDiffMode: (mode: DiffMode | null) => {
      if (slateEditorRef.current?.setDiffMode) {
        slateEditorRef.current.setDiffMode(mode);
      } else {
        pendingDiffModeRef.current = mode;
      }
    },
    setBlockDiffMap: (map: BlockDiffMap | null) => {
      if (slateEditorRef.current?.setBlockDiffMap) {
        slateEditorRef.current.setBlockDiffMap(map);
      } else {
        // SlateEditor ещё не отдал ref — буферизуем, slateRefCallback применит.
        pendingBlockDiffMapRef.current = map;
      }
    },
    setInlineDiffMap: (map: InlineDiffMap | null) => {
      if (slateEditorRef.current?.setInlineDiffMap) {
        slateEditorRef.current.setInlineDiffMap(map);
      } else {
        pendingInlineDiffMapRef.current = map;
      }
    },
    scrollToPath: (path: number[]) => slateEditorRef.current?.scrollToPath?.(path),
  }), [content, loadDocxFile, loadFromBuffer, exportDocx, document, pageConfig, onContentChange, editorMode, handleModeChange]);

  // Show upload UI only if showFileUpload is explicitly true AND no content exists
  // Note: content state is updated by useEffect when initialContent changes
  const showUploadUI = showFileUpload === true && !document && !content;

  return (
    <div 
      className={["docx-editor-root", className].filter(Boolean).join(" ")}
      style={{ 
        display: "flex", 
        flexDirection: "column", 
        height: "100%",
        ...style 
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {/* Error message */}
      {error && (
        <div style={{
          padding: "12px 16px",
          backgroundColor: "#fef2f2",
          color: "#991b1b",
          borderRadius: "6px",
          marginBottom: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div style={{
          padding: "20px",
          textAlign: "center",
          color: "#666",
        }}>
          <div style={{
            display: "inline-block",
            width: "24px",
            height: "24px",
            border: "3px solid #e5e7eb",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }} />
          <p style={{ marginTop: "8px" }}>Загрузка документа...</p>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Upload UI */}
      {showUploadUI && !loading && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
            border: `2px dashed ${isDragOver ? "#3b82f6" : "#d1d5db"}`,
            borderRadius: "12px",
            backgroundColor: isDragOver ? "#eff6ff" : "#f9fafb",
            cursor: "pointer",
            transition: "all 0.2s ease",
            minHeight: "300px",
          }}
        >
          <div style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            backgroundColor: isDragOver ? "#dbeafe" : "#e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "16px",
            transition: "all 0.2s ease",
          }}>
            {isDragOver ? (
              <Upload size={28} color="#3b82f6" />
            ) : (
              <FileText size={28} color="#6b7280" />
            )}
          </div>
          <h3 style={{
            margin: "0 0 8px",
            fontSize: "18px",
            fontWeight: 600,
            color: "#374151",
          }}>
            {isDragOver ? "Отпустите для загрузки" : "Загрузите DOCX файл"}
          </h3>
          <p style={{
            margin: 0,
            color: "#6b7280",
            fontSize: "14px",
          }}>
            Перетащите файл сюда или нажмите для выбора
          </p>
          <p style={{
            margin: "8px 0 0",
            color: "#9ca3af",
            fontSize: "12px",
          }}>
            Поддерживаются файлы .docx
          </p>
        </div>
      )}

      {/* Editor */}
      {(document || content) && !loading && (
        <div style={{ flex: 1, position: "relative", minHeight: 0, height: "100%" }}>
          {/* Small upload button in corner when document is loaded */}
          {showFileUpload && (
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Загрузить другой файл"
              style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                zIndex: 100,
                padding: "6px 12px",
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                color: "#374151",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <Upload size={14} />
              <span>Открыть файл</span>
            </button>
          )}
          
          <SlateEditor
            ref={slateRefCallback}
            document={document}
            initialContent={content}
            onDocumentChange={handleDocumentChange}
            onContentChange={onContentChange}
            onSelectionChange={onSelectionChange}
            versions={externalVersions}
            onVersionSave={(versionContent, comment) => {
              return onVersionSave?.({
                id: Date.now().toString(),
                timestamp: Date.now(),
                description: comment,
                content: versionContent,
              });
            }}
            onVersionRestore={onVersionRestore}
            onVersionRequest={onVersionRequest}
            readOnly={readOnly}
            mode={editorMode}
            onModeChange={handleModeChange}
            documentId={documentId}
            currentUser={currentUser}
            onAddToChat={onAddToChat}
            variableLabels={variableLabels}
            variableMetadata={variableMetadata}
            exportFilename={resolvedExportFilename}
            canExport={canExport}
            locale={locale}
            onDownloadOriginal={onDownloadOriginal}
            onCompareRequested={onCompareRequested}
          />
        </div>
      )}
    </div>
  );
});

export default DocxEditor;
