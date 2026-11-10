import React from "react";
import { RenderLeafProps } from "slate-react";
import type { CustomText, CommentMark } from "./types";
import type { EditorTheme } from "../theme";
import { Check, X } from "lucide-react";
import { resolveFontFamily } from "./fontUtils";

// Extended leaf props to include decoration properties
interface ExtendedLeaf extends CustomText {
  isJinjaVariable?: boolean;
  jinjaType?: "variable" | "tag" | "comment";
  isReplacedVariable?: boolean;
}

// Variable click data passed to callback
export interface VariableClickData {
  key: string;
  label: string;
  description?: string;
  type?: string;
  example?: string;
  position: { x: number; y: number };
}

// Callbacks and context data passed to renderLeaf (avoid hooks in each leaf)
export interface LeafContext {
  // Track changes
  onAcceptChange?: (changeId: string) => void;
  onRejectChange?: (changeId: string) => void;
  // Comments
  activeCommentId?: string | null;
  showCommentsPanel?: boolean;
  setActiveCommentId?: (id: string | null) => void;
  // Theme
  theme?: EditorTheme;
  // Translations
  commentPrefix?: string;
  // Variable labels mapping (key -> human-readable label)
  variableLabels?: Record<string, string>;
  // Variable metadata (for popover display)
  variableMetadata?: Record<string, { description?: string; type?: string; example?: string }>;
  // Variable click callback (for showing popover)
  onVariableClick?: (data: VariableClickData) => void;
}

// Track changes colors
const TRACK_CHANGES_STYLES = {
  insert: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",  // green-500 with opacity
    borderBottom: "2px solid rgb(34, 197, 94)",
  },
  delete: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",  // red-500 with opacity
    textDecoration: "line-through",
    color: "rgb(185, 28, 28)",  // red-700
  },
};

// Jinja highlighting colors - friendly for lawyers
// Variables are yellow by default, highlighted blue when selected
const JINJA_STYLES: Record<string, React.CSSProperties> = {
  variable: {
    backgroundColor: "rgba(251, 191, 36, 0.25)",  // amber/yellow
    border: "1px solid rgba(251, 191, 36, 0.6)",
    borderRadius: "4px",
    padding: "1px 6px",
    // No monospace - use document font
  },
  tag: {
    backgroundColor: "rgba(168, 85, 247, 0.15)",  // purple with opacity
    border: "1px solid rgba(168, 85, 247, 0.4)",
    borderRadius: "4px",
    padding: "1px 4px",
    fontSize: "0.9em",
  },
  comment: {
    backgroundColor: "rgba(107, 114, 128, 0.1)",  // gray with opacity
    border: "1px dashed rgba(107, 114, 128, 0.4)",
    borderRadius: "4px",
    padding: "1px 4px",
    fontStyle: "italic",
    opacity: 0.7,
  },
};

// Extract variable name from {{ name }} or {{ name | filter }}
function extractVariableName(text: string): string | null {
  const match = text.match(/\{\{\s*([^|}]+)/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

// Style for replaced variables (shown in preview)
const REPLACED_VARIABLE_STYLE: React.CSSProperties = {
  backgroundColor: "rgba(34, 197, 94, 0.2)",  // green-500 with opacity
  border: "1px solid rgb(34, 197, 94)",
  borderRadius: "3px",
  padding: "0 2px",
};

// Стили inline-подсветки слов в режиме сравнения версий.
// Применяются через Slate decorations (см. withDiffDecorations + decoration meta isDiffRange).
const DIFF_LEAF_STYLES: Record<"added" | "removed" | "changed" | "moved", React.CSSProperties> = {
  added: { backgroundColor: "rgba(34, 197, 94, 0.20)" },
  removed: { backgroundColor: "rgba(239, 68, 68, 0.20)", textDecoration: "line-through" },
  changed: { backgroundColor: "rgba(251, 191, 36, 0.20)" },
  moved: { backgroundColor: "rgba(168, 85, 247, 0.18)" },
};

// Comment highlight styles are now provided via theme context
// See useEditorTheme() hook and ThemeContext.tsx

// Inline buttons for accept/reject
function TrackChangeButtons({ 
  changeId, 
  changeType,
  onAccept, 
  onReject 
}: { 
  changeId: string; 
  changeType: "insert" | "delete";
  onAccept: () => void; 
  onReject: () => void; 
}) {
  return (
    <span 
      contentEditable={false}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        marginLeft: "4px",
        verticalAlign: "middle",
      }}
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAccept();
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "18px",
          height: "18px",
          padding: 0,
          border: "1px solid rgb(34, 197, 94)",
          borderRadius: "3px",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          cursor: "pointer",
          color: "rgb(34, 197, 94)",
        }}
        title={changeType === "insert" ? "Принять вставку" : "Принять удаление"}
      >
        <Check size={12} />
      </button>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onReject();
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "18px",
          height: "18px",
          padding: 0,
          border: "1px solid rgb(239, 68, 68)",
          borderRadius: "3px",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          cursor: "pointer",
          color: "rgb(239, 68, 68)",
        }}
        title={changeType === "insert" ? "Отклонить вставку" : "Отклонить удаление"}
      >
        <X size={12} />
      </button>
    </span>
  );
}

// Default context (empty callbacks)
const defaultContext: LeafContext = {};

// Store context in module scope (set by createRenderLeaf)
let leafContext: LeafContext = defaultContext;

/**
 * Set leaf context - call this from SlateEditor with memoized context
 */
export function setLeafContext(ctx: LeafContext) {
  leafContext = ctx;
}

export function getLeafContext(): LeafContext {
  return leafContext;
}

/**
 * Create renderLeaf function with bound context (alternative approach)
 * This avoids hooks being called for every leaf node
 */
export function createRenderLeaf(ctx: LeafContext) {
  return function renderLeafWithContext(props: RenderLeafProps) {
    return renderLeafInternal(props, ctx);
  };
}

/**
 * Default renderLeaf that uses module-level context
 */
export function renderLeaf(props: RenderLeafProps) {
  return renderLeafInternal(props, leafContext);
}

/**
 * Internal render function - no hooks, uses provided context
 */
function renderLeafInternal(props: RenderLeafProps, ctx: LeafContext) {
  const { attributes, children, leaf } = props;
  const text = leaf as ExtendedLeaf;

  let styledChildren = children;

  // Apply formatting marks
  if (text.bold) {
    styledChildren = <strong>{styledChildren}</strong>;
  }

  if (text.italic) {
    styledChildren = <em>{styledChildren}</em>;
  }

  if (text.underline) {
    styledChildren = <u>{styledChildren}</u>;
  }

  if (text.strikethrough) {
    styledChildren = <s>{styledChildren}</s>;
  }

  // Build inline style for font properties
  const style: React.CSSProperties = {};

  if (text.fontFamily) {
    // Добавляем metric-совместимые fallback'и (Liberation/Carlito/Tinos/…),
    // чтобы на машинах без TNR/Calibri (типичный Linux) текст не уходил в случайный
    // системный serif с чужими метриками. Тулбар при этом показывает оригинальное имя.
    style.fontFamily = resolveFontFamily(text.fontFamily) || text.fontFamily;
  }

  if (text.fontSize) {
    style.fontSize = `${text.fontSize}px`;
  }

  if (text.color) {
    style.color = text.color;
  }

  if (text.backgroundColor) {
    style.backgroundColor = text.backgroundColor;
  }

  // Apply track changes styles
  if (text.trackedChange) {
    const changeStyle = TRACK_CHANGES_STYLES[text.trackedChange.changeType];
    Object.assign(style, changeStyle);
  }

  // Apply side-by-side diff highlighting (приходит через decoration meta из withDiffDecorations).
  // text — это текущий leaf после splitting по decorations, у него есть isDiffRange/diffStatus,
  // если попал в один из range'ей. trackedChange имеет приоритет (если оба — стиль трека).
  const diffStatus = (text as any).isDiffRange ? (text as any).diffStatus : null;
  if (diffStatus && !text.trackedChange) {
    const diffStyle = DIFF_LEAF_STYLES[diffStatus as keyof typeof DIFF_LEAF_STYLES];
    if (diffStyle) Object.assign(style, diffStyle);
  }

  // Apply Jinja highlighting (from decorator)
  // For variables, show friendly styled pill with clean name (no brackets)
  if (text.isJinjaVariable && text.jinjaType === "variable") {
    const variableKey = extractVariableName(text.text);
    // Use human-readable label from context if available
    const displayName = variableKey && ctx.variableLabels?.[variableKey]
      ? ctx.variableLabels[variableKey]
      : variableKey;
    const jinjaStyle = JINJA_STYLES.variable;

    // Get metadata for this variable (if available)
    const metadata = variableKey ? ctx.variableMetadata?.[variableKey] : undefined;

    // Click handler for showing variable popover
    const handleVariableClick = (e: React.MouseEvent) => {
      if (ctx.onVariableClick && variableKey) {
        e.stopPropagation();
        ctx.onVariableClick({
          key: variableKey,
          label: displayName || variableKey,
          description: metadata?.description,
          type: metadata?.type,
          example: metadata?.example,
          position: { x: e.clientX, y: e.clientY },
        });
      }
    };

    return (
      <span
        {...attributes}
        onClick={handleVariableClick}
        style={{
          ...style,
          ...jinjaStyle,
          position: 'relative',
          display: 'inline-block',
          cursor: ctx.onVariableClick ? 'pointer' : undefined,
        }}
        title={displayName
          ? `📋 Поле: ${displayName}${variableKey !== displayName ? `\n(${variableKey})` : ''}\n\nПри генерации документа это поле будет заменено данными.\n\nНажмите для подробностей.`
          : "Шаблонная переменная"
        }
        className="template-variable"
        data-variable-name={variableKey || ''}
      >
        {/* Hidden original text for Slate selection/editing to work */}
        <span style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          whiteSpace: 'pre',
        }}>
          {styledChildren}
        </span>
        {/* Visible clean name */}
        <span contentEditable={false} style={{ userSelect: 'none' }}>
          {displayName || text.text}
        </span>
      </span>
    );
  }
  
  // For tags and comments, apply styles normally
  if (text.isJinjaVariable && text.jinjaType) {
    const jinjaStyle = JINJA_STYLES[text.jinjaType];
    Object.assign(style, jinjaStyle);
  }

  // Apply replaced variable highlighting (for preview)
  if (text.isReplacedVariable) {
    Object.assign(style, REPLACED_VARIABLE_STYLE);
  }

  // If this is a tracked change, wrap with interactive component
  if (text.trackedChange) {
    return (
      <TrackedChangeLeaf 
        attributes={attributes} 
        style={style} 
        trackedChange={text.trackedChange}
        onAccept={ctx.onAcceptChange}
        onReject={ctx.onRejectChange}
      >
        {styledChildren}
      </TrackedChangeLeaf>
    );
  }

  // If this has a comment mark, wrap with comment highlighting
  if (text.comment) {
    return (
      <CommentedTextLeaf
        attributes={attributes}
        style={style}
        comment={text.comment}
        activeCommentId={ctx.activeCommentId}
        showCommentsPanel={ctx.showCommentsPanel}
        setActiveCommentId={ctx.setActiveCommentId}
        theme={ctx.theme}
        commentPrefix={ctx.commentPrefix}
      >
        {styledChildren}
      </CommentedTextLeaf>
    );
  }

  return (
    <span {...attributes} style={style}>
      {styledChildren}
    </span>
  );
}

// Default theme values for comments (fallback when no theme provided)
const DEFAULT_THEME = {
  commentHighlight: "rgba(251, 191, 36, 0.3)",
  commentHighlightActive: "rgba(59, 130, 246, 0.3)",
  commentHighlightResolved: "rgba(156, 163, 175, 0.2)",
  primaryButton: "rgb(59, 130, 246)",
  primaryButtonText: "white",
};

// Tracked change leaf - no hooks, receives callbacks via props
function TrackedChangeLeaf({ 
  attributes, 
  style, 
  trackedChange,
  onAccept,
  onReject,
  children 
}: { 
  attributes: any; 
  style: React.CSSProperties; 
  trackedChange: { changeId: string; changeType: "insert" | "delete" };
  onAccept?: (changeId: string) => void;
  onReject?: (changeId: string) => void;
  children: React.ReactNode;
}) {
  const handleAccept = () => {
    onAccept?.(trackedChange.changeId);
  };

  const handleReject = () => {
    onReject?.(trackedChange.changeId);
  };

  // Only show buttons on insert part (green text) to avoid duplicate buttons
  const showButtons = onAccept && onReject && trackedChange.changeType === "insert";

  return (
    <span 
      {...attributes} 
      style={{
        ...style,
        position: "relative",
      }}
    >
      {children}
      {showButtons && (
        <TrackChangeButtons 
          changeId={trackedChange.changeId}
          changeType={trackedChange.changeType}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}
    </span>
  );
}

// Commented text leaf - no hooks, receives context via props
function CommentedTextLeaf({
  attributes,
  style,
  comment,
  activeCommentId,
  showCommentsPanel,
  setActiveCommentId,
  theme,
  commentPrefix,
  children,
}: {
  attributes: any;
  style: React.CSSProperties;
  comment: CommentMark;
  activeCommentId?: string | null;
  showCommentsPanel?: boolean;
  setActiveCommentId?: (id: string | null) => void;
  theme?: EditorTheme;
  commentPrefix?: string;
  children: React.ReactNode;
}) {
  const isActive = activeCommentId === comment.commentId;
  const isPanelOpen = showCommentsPanel ?? false;
  const isResolved = comment.status === "resolved";

  const handleClick = (e: React.MouseEvent) => {
    if (!isPanelOpen) return;
    e.stopPropagation();
    setActiveCommentId?.(comment.commentId);
  };

  // Comment highlighting styles — hardcoded for reliability across themes
  let commentStyle: React.CSSProperties = {};

  if (isPanelOpen) {
    if (isResolved) {
      // Resolved: muted, strikethrough-like
      commentStyle = {
        backgroundColor: "rgba(156, 163, 175, 0.15)",
        borderBottom: "2px dashed rgba(156, 163, 175, 0.5)",
        cursor: "pointer",
      };
    } else if (isActive) {
      // Active: bold blue highlight — must stand out clearly
      commentStyle = {
        backgroundColor: "rgba(59, 130, 246, 0.3)",
        borderBottom: "3px solid rgb(59, 130, 246)",
        outline: "2px solid rgba(59, 130, 246, 0.5)",
        outlineOffset: "1px",
        borderRadius: "2px",
        cursor: "pointer",
      };
    } else {
      // Inactive: subtle yellow
      commentStyle = {
        backgroundColor: "rgba(251, 191, 36, 0.2)",
        borderBottom: "2px solid rgba(251, 191, 36, 0.6)",
        cursor: "pointer",
      };
    }
  }

  return (
    <span
      {...attributes}
      onClick={handleClick}
      data-comment-id={comment.commentId}
      style={{
        ...style,
        ...commentStyle,
        position: "relative",
      }}
      title={isPanelOpen && comment.content ? `${commentPrefix || "Comment"}: ${comment.content}` : undefined}
    >
      {children}
    </span>
  );
}
