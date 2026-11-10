import React, { useEffect, useState, useRef } from "react";
import { Editor, Range } from "slate";
import { useSlate, ReactEditor } from "slate-react";
import { Sparkles, RefreshCw, Languages, Check, X } from "lucide-react";

import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "./ui/dropdown-menu";

interface LLMContextMenuProps {
  onAction: (action: string, selection: Range) => void;
}

export function LLMContextMenu({ onAction }: LLMContextMenuProps) {
  const editor = useSlate();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selection, setSelection] = useState<Range | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { selection } = editor;

    if (!selection || Range.isCollapsed(selection)) {
      setPosition(null);
      setSelection(null);
      return;
    }

    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      return;
    }

    const domRange = domSelection.getRangeAt(0);
    const rect = domRange.getBoundingClientRect();

    setPosition({
      top: rect.top + window.scrollY - 40, // Position above selection
      left: rect.left + window.scrollX + rect.width / 2,
    });
    setSelection(selection);
  }, [editor.selection]);

  if (!position || !selection) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 flex items-center justify-center pointer-events-none"
      style={{ top: position.top, left: position.left }}
    >
      <div className="bg-background border rounded-md shadow-md p-1 flex gap-1 pointer-events-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50">
              <Sparkles className="h-4 w-4 mr-1" />
              AI Edit
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuLabel>AI Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAction("rephrase", selection)}>
              <RefreshCw className="h-4 w-4 mr-2" /> Rephrase
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("fix-grammar", selection)}>
              <Check className="h-4 w-4 mr-2" /> Fix Grammar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("translate", selection)}>
              <Languages className="h-4 w-4 mr-2" /> Translate to English
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("summarize", selection)}>
              <Sparkles className="h-4 w-4 mr-2" /> Summarize
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

