import React, { useEffect, useState, useRef, useCallback } from "react";
import { Editor, Transforms, Range, Point, Element as SlateElement } from "slate";
import { useSlate, ReactEditor } from "slate-react";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Table,
  Image,
  Minus,
  Type,
  CheckSquare,
} from "lucide-react";
import { cn } from "@docx/lib/utils";
import type { CustomElement, TableRowElement } from "../slate/types";

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  keywords: string[];
  action: (editor: Editor) => void;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "paragraph",
    label: "Текст",
    description: "Обычный текстовый блок",
    icon: <Type className="h-4 w-4" />,
    keywords: ["text", "paragraph", "p", "текст"],
    action: (editor) => {
      insertBlock(editor, { type: "paragraph", children: [{ text: "" }] });
    },
  },
  {
    id: "heading1",
    label: "Заголовок 1",
    description: "Крупный заголовок раздела",
    icon: <Heading1 className="h-4 w-4" />,
    keywords: ["h1", "heading", "title", "заголовок"],
    action: (editor) => {
      insertBlock(editor, { type: "heading-one", children: [{ text: "" }] });
    },
  },
  {
    id: "heading2",
    label: "Заголовок 2",
    description: "Средний заголовок",
    icon: <Heading2 className="h-4 w-4" />,
    keywords: ["h2", "heading", "subtitle", "подзаголовок"],
    action: (editor) => {
      insertBlock(editor, { type: "heading-two", children: [{ text: "" }] });
    },
  },
  {
    id: "heading3",
    label: "Заголовок 3",
    description: "Маленький заголовок",
    icon: <Heading3 className="h-4 w-4" />,
    keywords: ["h3", "heading"],
    action: (editor) => {
      insertBlock(editor, { type: "heading-three", children: [{ text: "" }] });
    },
  },
  {
    id: "bullet-list",
    label: "Маркированный список",
    description: "Список с точками",
    icon: <List className="h-4 w-4" />,
    keywords: ["ul", "bullet", "list", "список", "маркированный"],
    action: (editor) => {
      insertBlock(editor, {
        type: "list-item",
        listType: "bullet",
        level: 0,
        children: [{ text: "" }],
      });
    },
  },
  {
    id: "numbered-list",
    label: "Нумерованный список",
    description: "Список с номерами",
    icon: <ListOrdered className="h-4 w-4" />,
    keywords: ["ol", "numbered", "list", "номерованный"],
    action: (editor) => {
      insertBlock(editor, {
        type: "list-item",
        listType: "numbered",
        level: 0,
        children: [{ text: "" }],
      });
    },
  },
  {
    id: "quote",
    label: "Цитата",
    description: "Выделенная цитата",
    icon: <Quote className="h-4 w-4" />,
    keywords: ["quote", "blockquote", "цитата"],
    action: (editor) => {
      insertBlock(editor, { type: "block-quote", children: [{ text: "" }] });
    },
  },
  {
    id: "code",
    label: "Код",
    description: "Блок кода",
    icon: <Code className="h-4 w-4" />,
    keywords: ["code", "codeblock", "код"],
    action: (editor) => {
      insertBlock(editor, { type: "code-block", children: [{ text: "" }] });
    },
  },
  {
    id: "divider",
    label: "Разделитель",
    description: "Горизонтальная линия",
    icon: <Minus className="h-4 w-4" />,
    keywords: ["hr", "divider", "line", "разделитель"],
    action: (editor) => {
      Transforms.insertNodes(editor, { type: "divider", children: [{ text: "" }] } as CustomElement);
      // Insert paragraph after divider
      Transforms.insertNodes(editor, { type: "paragraph", children: [{ text: "" }] } as CustomElement);
    },
  },
  {
    id: "table",
    label: "Таблица",
    description: "Вставить таблицу 3x3",
    icon: <Table className="h-4 w-4" />,
    keywords: ["table", "grid", "таблица"],
    action: (editor) => {
      const tableRow = (cells: number): TableRowElement => ({
        type: "table-row",
        children: Array.from({ length: cells }, () => ({
          type: "table-cell",
          children: [{ type: "paragraph", children: [{ text: "" }] }],
        })),
      });
      insertBlock(editor, {
        type: "table",
        children: [tableRow(3), tableRow(3), tableRow(3)],
      });
    },
  },
];

function insertBlock(editor: Editor, block: CustomElement) {
  const { selection } = editor;
  
  if (!selection) return;
  
  // Delete the slash command text
  const [start] = Range.edges(selection);
  const lineStart = Editor.before(editor, start, { unit: "line" });
  
  if (lineStart) {
    // Find the slash character position
    const beforeRange = { anchor: lineStart, focus: start };
    const beforeText = Editor.string(editor, beforeRange);
    const slashIndex = beforeText.lastIndexOf("/");
    
    if (slashIndex !== -1) {
      const slashPoint: Point = {
        path: start.path,
        offset: lineStart.offset + slashIndex,
      };
      
      // Delete from slash to cursor
      Transforms.delete(editor, {
        at: { anchor: slashPoint, focus: start },
      });
    }
  }
  
  // Insert the new block
  Transforms.insertNodes(editor, block);
}

interface SlashCommandMenuProps {
  onClose?: () => void;
}

export function SlashCommandMenu({ onClose }: SlashCommandMenuProps) {
  const editor = useSlate();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter commands based on search
  const filteredCommands = SLASH_COMMANDS.filter((cmd) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query) ||
      cmd.keywords.some((k) => k.includes(query))
    );
  });

  const updatePosition = useCallback(() => {
    const { selection } = editor;
    
    if (!selection || !Range.isCollapsed(selection)) {
      setIsVisible(false);
      return;
    }

    try {
      // Get current line text
      const [start] = Range.edges(selection);
      const lineStart = Editor.before(editor, start, { unit: "line" });
      
      if (!lineStart) {
        setIsVisible(false);
        return;
      }

      const lineRange = { anchor: lineStart, focus: start };
      const lineText = Editor.string(editor, lineRange);
      
      // Check if line starts with / or has / followed by text
      const slashMatch = lineText.match(/\/(\w*)$/);
      
      if (!slashMatch) {
        setIsVisible(false);
        setSearchQuery("");
        return;
      }

      setSearchQuery(slashMatch[1] || "");
      setSelectedIndex(0);

      // Get cursor position
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) {
        setIsVisible(false);
        return;
      }

      const domRange = domSelection.getRangeAt(0);
      const rect = domRange.getBoundingClientRect();

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

      setPosition({
        top: rect.bottom + scrollTop + 4,
        left: rect.left + scrollLeft,
      });
      setIsVisible(true);
    } catch (e) {
      setIsVisible(false);
    }
  }, [editor]);

  useEffect(() => {
    updatePosition();
  }, [editor.selection, updatePosition]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action(editor);
          setIsVisible(false);
          onClose?.();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsVisible(false);
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, selectedIndex, filteredCommands, editor, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsVisible(false);
        onClose?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isVisible, onClose]);

  if (!isVisible || filteredCommands.length === 0) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[280px] rounded-lg border docx-floating-surface p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
        Выберите блок
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {filteredCommands.map((cmd, index) => (
          <button
            key={cmd.id}
            className={cn(
              "w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors",
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            )}
            onClick={() => {
              cmd.action(editor);
              setIsVisible(false);
              onClose?.();
            }}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded bg-muted">
              {cmd.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{cmd.label}</div>
              <div className="text-xs text-muted-foreground truncate">
                {cmd.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default SlashCommandMenu;

