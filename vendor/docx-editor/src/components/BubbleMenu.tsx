import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { Editor, Range, Element as SlateElement, Transforms } from "slate";
import { useSlate, ReactEditor } from "slate-react";
import { placeCenteredAbove, type AnchorRect } from "../lib/floatingPosition";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  MessageSquarePlus,
} from "lucide-react";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { toggleList, getCurrentListType } from "../slate/listUtils";
import type { CustomElement } from "../slate/types";

interface BubbleMenuProps {
  className?: string;
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

// Check if block is active
function isBlockActive(editor: Editor, format: string): boolean {
  const [match] = Editor.nodes(editor, {
    match: (n) =>
      !Editor.isEditor(n) && SlateElement.isElement(n) && n.type === format,
  });
  return !!match;
}

// Toggle block type
function toggleBlock(editor: Editor, format: string): void {
  const isActive = isBlockActive(editor, format);
  const isList = format === "bulleted-list" || format === "numbered-list";

  if (isList) {
    toggleList(editor, format === "bulleted-list" ? "bullet" : "numbered");
    return;
  }

  const newProperties: Partial<CustomElement> = {
    type: isActive ? "paragraph" : (format as CustomElement["type"]),
  };

  // Apply to all matching blocks in selection
  Transforms.setNodes(editor, newProperties, {
    match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
  });
}

// Set text alignment for all block types (paragraph, headings, etc.)
function setAlignment(editor: Editor, align: "left" | "center" | "right" | "justify"): void {
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

export function BubbleMenu({ className, onAddToChat }: BubbleMenuProps) {
  const editor = useSlate();
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

    // Check if selection has text
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

      // Store the selection rect (viewport coords); placement + viewport
      // clamping happens in a layout effect once the menu's real size is known.
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
    // Update on selection change
    const handleSelectionChange = () => {
      // Small delay to ensure DOM is updated
      requestAnimationFrame(updatePosition);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [updatePosition]);

  // Update on editor changes
  useEffect(() => {
    updatePosition();
  }, [editor.selection, updatePosition]);

  // Measure the mounted menu and place it centered above the selection,
  // clamped to the viewport. Runs before paint to avoid a position flash.
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

  const currentListType = getCurrentListType(editor);
  const currentAlign = getCurrentAlignment(editor);

  return (
    <div
      ref={menuRef}
      className={`fixed z-50 flex items-center gap-0.5 p-1 rounded-lg border docx-floating-surface shadow-lg animate-in fade-in-0 zoom-in-95 ${className || ""}`}
      style={{
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
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
        title="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${isMarkActive(editor, "code") ? "bg-accent" : ""}`}
        onClick={() => toggleMark(editor, "code")}
        title="Code"
      >
        <Code className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Headings */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${isBlockActive(editor, "heading-one") ? "bg-accent" : ""}`}
        onClick={() => toggleBlock(editor, "heading-one")}
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${isBlockActive(editor, "heading-two") ? "bg-accent" : ""}`}
        onClick={() => toggleBlock(editor, "heading-two")}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${isBlockActive(editor, "heading-three") ? "bg-accent" : ""}`}
        onClick={() => toggleBlock(editor, "heading-three")}
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Lists */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${currentListType === "bullet" ? "bg-accent" : ""}`}
        onClick={() => toggleList(editor, "bullet")}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${currentListType === "numbered" ? "bg-accent" : ""}`}
        onClick={() => toggleList(editor, "numbered")}
        title="Numbered List"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${isBlockActive(editor, "block-quote") ? "bg-accent" : ""}`}
        onClick={() => toggleBlock(editor, "block-quote")}
        title="Quote"
      >
        <Quote className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Alignment */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${currentAlign === "left" ? "bg-accent" : ""}`}
        onClick={() => setAlignment(editor, "left")}
        title="Align Left"
      >
        <AlignLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${currentAlign === "center" ? "bg-accent" : ""}`}
        onClick={() => setAlignment(editor, "center")}
        title="Align Center"
      >
        <AlignCenter className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 ${currentAlign === "right" ? "bg-accent" : ""}`}
        onClick={() => setAlignment(editor, "right")}
        title="Align Right"
      >
        <AlignRight className="h-4 w-4" />
      </Button>

      {/* Add to chat button */}
      {onAddToChat && (
        <>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleAddToChat}
            title="Добавить в чат (Ctrl+L)"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}

export default BubbleMenu;

