import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { Editor, Range, Text, Transforms } from "slate";
import { useSlate } from "slate-react";
import { placeBesideAnchor, type AnchorRect } from "../lib/floatingPosition";
import { MessageSquare, Send, X } from "lucide-react";
import { Button } from "./ui/button";
import { useCommentsContext } from "../slate/CommentsContext";
import { useTranslations } from "../i18n";
import { useEditorTheme } from "../theme";
import type { CommentAuthor, CustomText } from "../slate/types";

interface AddCommentPopoverProps {
  currentUser: CommentAuthor;
  documentId: string;
  onCommentAdded?: () => void;
}

export function AddCommentPopover({ 
  currentUser, 
  documentId,
  onCommentAdded,
}: AddCommentPopoverProps) {
  const editor = useSlate();
  const { setShowCommentsPanel, setActiveCommentId, refreshComments } = useCommentsContext();
  const t = useTranslations();
  const theme = useEditorTheme();
  
  const [isOpen, setIsOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);
  const [selectionInfo, setSelectionInfo] = useState<{
    start: number;
    end: number;
    text: string;
  } | null>(null);

  // Save the Slate selection at the moment the popover opens,
  // because it may be lost when the textarea receives focus
  const savedSelectionRef = useRef<Range | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Capture the selection rect (viewport coords). Placement beside the
  // selection + viewport clamping is done by placeBesideAnchor.
  const captureAnchorRect = useCallback((): AnchorRect | null => {
    const { selection } = editor;
    if (!selection || Range.isCollapsed(selection)) {
      return null;
    }

    try {
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) return null;

      const rect = domSelection.getRangeAt(0).getBoundingClientRect();

      if (rect.width === 0 && rect.height === 0) return null;

      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    } catch {
      return null;
    }
  }, [editor]);

  // Get selection info (start, end, text)
  const getSelectionInfo = useCallback(() => {
    const { selection } = editor;
    if (!selection || Range.isCollapsed(selection)) {
      return null;
    }

    const text = Editor.string(editor, selection);
    if (!text.trim()) return null;

    // Calculate absolute character positions
    let start = 0;
    let end = 0;
    let charCount = 0;
    let foundStart = false;
    let foundEnd = false;

    const [startPoint, endPoint] = Range.edges(selection);

    for (const [node, path] of Editor.nodes(editor, { at: [] })) {
      if (Text.isText(node)) {
        const nodeStart = charCount;
        const nodeEnd = charCount + node.text.length;

        // Check if this node contains the start point
        if (!foundStart && JSON.stringify(path) === JSON.stringify(startPoint.path)) {
          start = nodeStart + startPoint.offset;
          foundStart = true;
        }

        // Check if this node contains the end point
        if (!foundEnd && JSON.stringify(path) === JSON.stringify(endPoint.path)) {
          end = nodeStart + endPoint.offset;
          foundEnd = true;
        }

        charCount = nodeEnd;

        if (foundStart && foundEnd) break;
      }
    }

    return { start, end, text };
  }, [editor]);

  // Open popover with current selection
  const openPopover = useCallback(() => {
    const rect = captureAnchorRect();
    const info = getSelectionInfo();

    if (rect && info) {
      // Save the Slate selection before focus moves to textarea
      savedSelectionRef.current = editor.selection ? { ...editor.selection } : null;
      setAnchorRect(rect);
      // Provisional position with an estimated size; refined to the measured
      // size in a layout effect (below) so the popover never lands off-screen.
      setPosition(
        placeBesideAnchor(
          rect,
          { width: 340, height: 220 },
          { width: window.innerWidth, height: window.innerHeight }
        )
      );
      setSelectionInfo(info);
      setIsOpen(true);

      // Focus textarea after opening
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  }, [captureAnchorRect, getSelectionInfo, editor]);

  // Close popover
  const closePopover = useCallback(() => {
    setIsOpen(false);
    setCommentText("");
    setPosition(null);
    setAnchorRect(null);
    setSelectionInfo(null);
    savedSelectionRef.current = null;
  }, []);

  // Refine the popover position to its actual measured size, clamped to the
  // viewport (so it never runs off the right edge). Runs before paint, so the
  // provisional estimate is never shown.
  useLayoutEffect(() => {
    if (!isOpen || !anchorRect || !popoverRef.current) return;
    const el = popoverRef.current;
    setPosition(
      placeBesideAnchor(
        anchorRect,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight }
      )
    );
  }, [isOpen, anchorRect]);

  // Submit comment
  const handleSubmit = useCallback(() => {
    if (!commentText.trim() || !selectionInfo) return;

    const commentId = `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Create full comment mark with all data (stored in document)
    const commentMark = {
      commentId,
      content: commentText.trim(),
      author: currentUser,
      createdAt: now,
      status: "open" as const,
      replies: [],
    };

    // Use the saved selection (captured when popover opened) because
    // the current editor.selection may have been lost when textarea got focus
    const targetSelection = savedSelectionRef.current || editor.selection;
    if (targetSelection && !Range.isCollapsed(targetSelection)) {
      Transforms.setNodes(
        editor,
        { comment: commentMark } as Partial<CustomText>,
        {
          at: targetSelection,
          match: Text.isText,
          split: true
        }
      );
    }

    // Refresh comment list so the new comment appears in the panel
    refreshComments();

    // Open comments panel and select this comment
    setShowCommentsPanel(true);
    setActiveCommentId(commentId);

    onCommentAdded?.();
    closePopover();
  }, [
    commentText,
    selectionInfo,
    editor,
    currentUser,
    refreshComments,
    setShowCommentsPanel,
    setActiveCommentId,
    onCommentAdded,
    closePopover,
  ]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      closePopover();
    }
  }, [handleSubmit, closePopover]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closePopover();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, closePopover]);

  // Expose open method via ref-like pattern (using context or callback)
  // This will be called from the toolbar button
  useEffect(() => {
    (window as any).__openCommentPopover = openPopover;
    return () => {
      delete (window as any).__openCommentPopover;
    };
  }, [openPopover]);

  if (!isOpen || !position) return null;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 rounded-lg shadow-lg border docx-floating-surface"
      style={{
        top: position.top,
        left: position.left,
        minWidth: "280px",
        maxWidth: "360px",
      }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-2 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" style={{ color: theme.primaryButton }} />
          <span className="text-sm font-medium">{t.comments.addComment}</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={closePopover}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Selected text preview */}
      {selectionInfo && (
        <div 
          className="px-3 py-2 text-xs border-b"
          style={{ 
            backgroundColor: "var(--muted)",
            borderColor: "var(--border)",
            color: "var(--muted-foreground)",
          }}
        >
          <span className="font-medium">{t.comments.selected}: </span>
          «{selectionInfo.text.length > 60 
            ? selectionInfo.text.slice(0, 60) + "..." 
            : selectionInfo.text}»
        </div>
      )}

      {/* Comment input */}
      <div className="p-3">
        <textarea
          ref={textareaRef}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.comments.writePlaceholder}
          className="w-full min-h-[80px] px-2 py-1.5 text-sm rounded border resize-none"
          style={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
          }}
        />
        
        {/* Author info and submit */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <div 
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={{ 
                backgroundColor: theme.avatarBackground,
                color: theme.avatarText,
              }}
            >
              {currentUser.firstName?.[0] || currentUser.username[0].toUpperCase()}
            </div>
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {currentUser.firstName || currentUser.username}
            </span>
          </div>
          
          <Button 
            size="sm"
            disabled={!commentText.trim()}
            onClick={handleSubmit}
            style={{ backgroundColor: theme.primaryButton, color: theme.primaryButtonText }}
          >
            <Send className="h-3 w-3 mr-1" />
            {t.comments.add}
          </Button>
        </div>
        
        <div className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
          {t.comments.tipCtrlEnter}
        </div>
      </div>
    </div>
  );
}

// Hook to trigger the comment popover from outside
export function useAddComment() {
  const openPopover = useCallback(() => {
    const fn = (window as any).__openCommentPopover;
    if (typeof fn === "function") {
      fn();
    }
  }, []);

  return { openCommentPopover: openPopover };
}

export default AddCommentPopover;

