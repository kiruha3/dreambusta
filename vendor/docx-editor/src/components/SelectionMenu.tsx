import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { Editor, Range, Element as SlateElement, Transforms } from "slate";
import { useSlate, ReactEditor } from "slate-react";
import { placeCenteredAbove, type AnchorRect } from "../lib/floatingPosition";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  MessageSquarePlus,
  MessageSquare,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { useTranslations } from "../i18n";
import type { CustomElement } from "../slate/types";

interface SelectionMenuProps {
  onAddToChat?: (selectedText: string) => void;
}

// Check if mark is active
function isMarkActive(editor: Editor, format: string): boolean {
  const marks = Editor.marks(editor);
  return marks ? marks[format as keyof typeof marks] === true : false;
}

// Toggle mark
function toggleMark(editor: Editor, format: string): void {
  const isActive = isMarkActive(editor, format);
  if (isActive) {
    Editor.removeMark(editor, format);
  } else {
    Editor.addMark(editor, format, true);
  }
}

// Set text alignment
function setAlignment(editor: Editor, align: "left" | "center" | "right"): void {
  Transforms.setNodes(
    editor,
    { align } as Partial<CustomElement>,
    {
      match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
    }
  );
}

// Get current alignment
function getCurrentAlignment(editor: Editor): string {
  const [entry] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
  });
  if (entry) {
    const [node] = entry;
    return SlateElement.isElement(node) && "align" in node ? node.align || "left" : "left";
  }
  return "left";
}

/**
 * Selection menu for toolbar mode - shows formatting, comment, and "Add to Chat" buttons
 */
export function SelectionMenu({ onAddToChat }: SelectionMenuProps) {
  const editor = useSlate();
  const t = useTranslations();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const handleAddToChat = useCallback(() => {
    const { selection } = editor;
    if (!selection || Range.isCollapsed(selection)) return;

    const selectedText = Editor.string(editor, selection);
    if (selectedText.trim() && onAddToChat) {
      onAddToChat(selectedText);
    }
  }, [editor, onAddToChat]);

  const handleAddComment = useCallback(() => {
    const fn = (window as any).__openCommentPopover;
    if (typeof fn === "function") {
      fn();
    }
  }, []);

  const updatePosition = useCallback(() => {
    const { selection } = editor;

    // Check if editor is focused - critical to avoid showing menu for selections outside editor
    if (!ReactEditor.isFocused(editor)) {
      setIsVisible(false);
      return;
    }

    if (!selection || Range.isCollapsed(selection)) {
      setIsVisible(false);
      return;
    }

    const selectedText = Editor.string(editor, selection);
    if (!selectedText.trim()) {
      setIsVisible(false);
      return;
    }

    try {
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) {
        setIsVisible(false);
        return;
      }

      const domRange = domSelection.getRangeAt(0);
      const rect = domRange.getBoundingClientRect();

      if (rect.width === 0) {
        setIsVisible(false);
        return;
      }

      // Additional check: ensure selection is within the editor DOM
      try {
        const editorEl = ReactEditor.toDOMNode(editor, editor);
        if (!editorEl.contains(domRange.commonAncestorContainer)) {
          setIsVisible(false);
          return;
        }
      } catch {
        setIsVisible(false);
        return;
      }

      // Store the selection rect (viewport coords); the menu is centered above
      // it and clamped to the viewport in a layout effect once its real size
      // is known (see below).
      setAnchorRect({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      });
      setIsVisible(true);
    } catch (e) {
      setIsVisible(false);
    }
  }, [editor]);

  useEffect(() => {
    const handleSelectionChange = () => {
      requestAnimationFrame(updatePosition);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [updatePosition]);

  useEffect(() => {
    updatePosition();
  }, [editor.selection, updatePosition]);

  // Once the menu is mounted, measure its real (untransformed) size and place
  // it centered above the selection, clamped so it never leaves the viewport.
  // Runs before paint, so the provisional position is never shown.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!isVisible || !anchorRect || !menu) return;
    setPosition(
      placeCenteredAbove(
        anchorRect,
        { width: menu.offsetWidth, height: menu.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight }
      )
    );
  }, [isVisible, anchorRect]);

  if (!isVisible) {
    return null;
  }

  const currentAlign = getCurrentAlignment(editor);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 flex items-center gap-0.5 p-1 rounded-lg border docx-floating-surface shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Text formatting */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${isMarkActive(editor, "bold") ? "bg-accent" : ""}`}
        onClick={() => toggleMark(editor, "bold")}
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${isMarkActive(editor, "italic") ? "bg-accent" : ""}`}
        onClick={() => toggleMark(editor, "italic")}
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${isMarkActive(editor, "underline") ? "bg-accent" : ""}`}
        onClick={() => toggleMark(editor, "underline")}
        title="Underline (Ctrl+U)"
      >
        <Underline className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${isMarkActive(editor, "strikethrough") ? "bg-accent" : ""}`}
        onClick={() => toggleMark(editor, "strikethrough")}
        title={t.selectionMenu?.strikethrough || "Strikethrough"}
      >
        <Strikethrough className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-0.5" />

      {/* Alignment */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${currentAlign === "left" ? "bg-accent" : ""}`}
        onClick={() => setAlignment(editor, "left")}
        title={t.selectionMenu?.alignLeft || "Align Left"}
      >
        <AlignLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${currentAlign === "center" ? "bg-accent" : ""}`}
        onClick={() => setAlignment(editor, "center")}
        title={t.selectionMenu?.alignCenter || "Align Center"}
      >
        <AlignCenter className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${currentAlign === "right" ? "bg-accent" : ""}`}
        onClick={() => setAlignment(editor, "right")}
        title={t.selectionMenu?.alignRight || "Align Right"}
      >
        <AlignRight className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-0.5" />

      {/* Comment */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 gap-1.5"
        onClick={handleAddComment}
        title={t.comments?.addComment || "Add comment"}
      >
        <MessageSquare className="h-4 w-4" />
        <span className="text-xs">{t.selectionMenu?.comment || "Comment"}</span>
      </Button>

      {/* Add to chat */}
      {onAddToChat && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 gap-1.5"
          onClick={handleAddToChat}
          title={t.selectionMenu?.addToChat || "Add to chat (Ctrl+L)"}
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span className="text-xs">{t.selectionMenu?.chat || "Chat"}</span>
        </Button>
      )}
    </div>
  );
}

export default SelectionMenu;
