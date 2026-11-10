import React from "react";
import { Editor, Transforms, Element as SlateElement } from "slate";
import { useSlate } from "slate-react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Image as ImageIcon,
  Save,
  GitCompare,
  Code2,
  Check,
  X,
  MessageSquare,
  PanelRightClose,
  Table as TableIcon,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
} from "lucide-react";

import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "./ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { FontControls } from "./FontControls";
import { DocumentDownloadAction } from "./DocumentDownloadAction";

import {
  toggleList,
  getCurrentListType,
} from "../slate/listUtils";
import {
  insertTable,
  isInTable,
  addRowAfter,
  addRowBefore,
  addColumnAfter,
  addColumnBefore,
  deleteRow,
  deleteColumn,
  deleteTable,
} from "../slate/tableUtils";
import { useEditorTheme } from "../theme";
import type { EditorMode } from "../slate/types";

export type UIMode = "toolbar" | "notion";

interface EditorToolbarProps {
  onImageUpload?: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onExport?: () => void;
  onDownloadOriginal?: () => void;
  onSave?: () => void;
  hasUnsavedChanges?: boolean;
  historySlot?: React.ReactNode;
  editorMode?: EditorMode;
  onModeChange?: (mode: EditorMode) => void;
  onAcceptAllChanges?: () => void;
  onRejectAllChanges?: () => void;
  onAddComment?: () => void;
  onToggleCommentsPanel?: () => void;
  showCommentsPanel?: boolean;
  commentsCount?: number;
  uiMode?: UIMode;
  onUiModeChange?: (mode: UIMode) => void;
}

export function EditorToolbar({ 
  onImageUpload, 
  onExport, 
  onDownloadOriginal,
  onSave, 
  hasUnsavedChanges, 
  historySlot,
  editorMode = "normal",
  onModeChange,
  onAcceptAllChanges,
  onRejectAllChanges,
  onAddComment,
  onToggleCommentsPanel,
  showCommentsPanel = false,
  commentsCount = 0,
}: EditorToolbarProps) {
  const editor = useSlate();
  const theme = useEditorTheme();
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const [tablePopoverOpen, setTablePopoverOpen] = React.useState(false);
  const [isCompact, setIsCompact] = React.useState(false);
  const inTable = isInTable(editor);

  // Detect compact mode based on toolbar width
  React.useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < 680);
      }
    });

    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  const handleModeToggle = (mode: EditorMode) => {
    if (editorMode === mode) {
      onModeChange?.("normal");
    } else {
      onModeChange?.(mode);
    }
  };

  const currentListType = getCurrentListType(editor);

  return (
    <TooltipProvider delayDuration={300}>
      <div 
        ref={toolbarRef}
        className="flex items-center gap-1 px-3 h-[52px] sticky top-0 z-10"
        style={{ 
          backgroundColor: "var(--background)",
          borderBottom: "1px solid var(--border)"
        }}
      >
        {/* Font Controls - always visible */}
        <FontControls compact={isCompact} />

        {!isCompact && <Separator orientation="vertical" className="h-5 mx-1" />}

        {/* Alignment - hidden in compact */}
        {!isCompact && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <AlignLeft className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Выравнивание</p></TooltipContent>
            </Tooltip>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setAlignment(editor, "left")}>
                <AlignLeft className="h-4 w-4 mr-2" /> По левому краю
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAlignment(editor, "center")}>
                <AlignCenter className="h-4 w-4 mr-2" /> По центру
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAlignment(editor, "right")}>
                <AlignRight className="h-4 w-4 mr-2" /> По правому краю
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAlignment(editor, "justify")}>
                <AlignJustify className="h-4 w-4 mr-2" /> По ширине
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Lists - hidden in compact */}
        {!isCompact && (
          <>
            <ToolbarButton
              onClick={() => toggleList(editor, "bullet")}
              isActive={currentListType === "bullet"}
              icon={<List className="h-3.5 w-3.5" />}
              tooltip="Маркированный список"
            />
            <ToolbarButton
              onClick={() => toggleList(editor, "numbered")}
              isActive={currentListType === "numbered"}
              icon={<ListOrdered className="h-3.5 w-3.5" />}
              tooltip="Нумерованный список"
            />
          </>
        )}

        {!isCompact && <Separator orientation="vertical" className="h-5 mx-1" />}

        {/* Insert: Image & Table - hidden in compact */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={onImageUpload}
          style={{ display: "none" }}
        />
        
        {!isCompact && (
          <>
            <ToolbarButton
              onClick={() => imageInputRef.current?.click()}
              icon={<ImageIcon className="h-3.5 w-3.5" />}
              tooltip="Вставить изображение"
            />

            {/* Table - context-aware */}
            {inTable ? (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" size="sm" className="h-7 w-7 p-0">
                        <TableIcon className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>Редактировать таблицу</p></TooltipContent>
                </Tooltip>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Вставить</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => addRowBefore(editor)}>
                    <ArrowUp className="h-4 w-4 mr-2" /> Строку выше
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addRowAfter(editor)}>
                    <ArrowDown className="h-4 w-4 mr-2" /> Строку ниже
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addColumnBefore(editor)}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Столбец слева
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addColumnAfter(editor)}>
                    <ArrowRight className="h-4 w-4 mr-2" /> Столбец справа
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Удалить</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => deleteRow(editor)} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Строку
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => deleteColumn(editor)} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Столбец
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => deleteTable(editor)} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Таблицу
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Popover open={tablePopoverOpen} onOpenChange={setTablePopoverOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <TableIcon className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>Вставить таблицу</p></TooltipContent>
                </Tooltip>
                <PopoverContent className="w-auto p-0" align="start">
                  <TableSizeGrid 
                    onSelect={(rows, cols) => {
                      insertTable(editor, rows, cols);
                      setTablePopoverOpen(false);
                    }} 
                  />
                </PopoverContent>
              </Popover>
            )}

            <Separator orientation="vertical" className="h-5 mx-1" />
          </>
        )}

        {/* Modes Group - always visible but compact */}
        <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded">
          <ToolbarButton
            onClick={() => handleModeToggle("redline")}
            isActive={editorMode === "redline"}
            icon={<GitCompare className="h-3.5 w-3.5" />}
            tooltip="Режим правок"
            activeColor="rgb(59, 130, 246)"
          />
          <ToolbarButton
            onClick={() => handleModeToggle("jinja")}
            isActive={editorMode === "jinja"}
            icon={<Code2 className="h-3.5 w-3.5" />}
            tooltip="Переменные"
            activeColor="rgb(59, 130, 246)"
          />
        </div>

        {/* Accept/Reject - only in redline mode */}
        {editorMode === "redline" && (
          <>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <div className="flex items-center gap-0.5">
              <ToolbarButton
                onClick={() => onAcceptAllChanges?.()}
                icon={<Check className="h-3.5 w-3.5" />}
                tooltip="Принять все"
                activeColor="rgb(34, 197, 94)"
              />
              <ToolbarButton
                onClick={() => onRejectAllChanges?.()}
                icon={<X className="h-3.5 w-3.5" />}
                tooltip="Отклонить все"
                activeColor="rgb(239, 68, 68)"
              />
            </div>
          </>
        )}

        {!isCompact && <Separator orientation="vertical" className="h-5 mx-1" />}

        {/* Comments - hidden in compact */}
        {!isCompact && (
          <div className="relative">
            <ToolbarButton
              onClick={() => onToggleCommentsPanel?.()}
              isActive={showCommentsPanel}
              icon={showCommentsPanel ? <PanelRightClose className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
              tooltip={showCommentsPanel ? "Скрыть комментарии" : "Комментарии"}
              activeColor={theme.primaryButton}
            />
            {commentsCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-4 h-4 flex items-center justify-center text-[10px] font-medium rounded-full px-1"
                style={{
                  backgroundColor: theme.primaryButton,
                  color: theme.primaryButtonText,
                }}
              >
                {commentsCount > 99 ? "99+" : commentsCount}
              </span>
            )}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Compact mode: overflow menu */}
        {isCompact && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Ещё</p></TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {/* Alignment submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <AlignLeft className="h-4 w-4 mr-2" /> Выравнивание
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setAlignment(editor, "left")}>
                    <AlignLeft className="h-4 w-4 mr-2" /> По левому краю
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAlignment(editor, "center")}>
                    <AlignCenter className="h-4 w-4 mr-2" /> По центру
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAlignment(editor, "right")}>
                    <AlignRight className="h-4 w-4 mr-2" /> По правому краю
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAlignment(editor, "justify")}>
                    <AlignJustify className="h-4 w-4 mr-2" /> По ширине
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              
              <DropdownMenuSeparator />
              
              {/* Lists */}
              <DropdownMenuItem onClick={() => toggleList(editor, "bullet")}>
                <List className="h-4 w-4 mr-2" /> 
                Маркированный список
                {currentListType === "bullet" && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleList(editor, "numbered")}>
                <ListOrdered className="h-4 w-4 mr-2" /> 
                Нумерованный список
                {currentListType === "numbered" && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              {/* Insert */}
              <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                <ImageIcon className="h-4 w-4 mr-2" /> Вставить изображение
              </DropdownMenuItem>
              
              {!inTable && (
                <DropdownMenuItem onClick={() => {
                  insertTable(editor, 3, 3);
                }}>
                  <TableIcon className="h-4 w-4 mr-2" /> Вставить таблицу 3×3
                </DropdownMenuItem>
              )}
              
              {inTable && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <TableIcon className="h-4 w-4 mr-2" /> Таблица
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => addRowBefore(editor)}>
                      <ArrowUp className="h-4 w-4 mr-2" /> Строку выше
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addRowAfter(editor)}>
                      <ArrowDown className="h-4 w-4 mr-2" /> Строку ниже
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addColumnBefore(editor)}>
                      <ArrowLeft className="h-4 w-4 mr-2" /> Столбец слева
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addColumnAfter(editor)}>
                      <ArrowRight className="h-4 w-4 mr-2" /> Столбец справа
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => deleteRow(editor)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" /> Удалить строку
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => deleteColumn(editor)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" /> Удалить столбец
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => deleteTable(editor)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" /> Удалить таблицу
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              
              <DropdownMenuSeparator />
              
              {/* Comments */}
              <DropdownMenuItem onClick={() => onToggleCommentsPanel?.()}>
                <MessageSquare className="h-4 w-4 mr-2" /> 
                {showCommentsPanel ? "Скрыть комментарии" : "Комментарии"}
                {commentsCount > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground">{commentsCount}</span>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Right side: Save, Export, History */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => onSave?.()}
            icon={<Save className="h-3.5 w-3.5" />}
            tooltip="Сохранить (Ctrl+S)"
            isActive={hasUnsavedChanges}
            activeColor={theme.primaryButton}
          />
          {onExport && (
            <DocumentDownloadAction compact onDownloadCurrent={onExport} onDownloadOriginal={onDownloadOriginal} />
          )}
          {historySlot}
        </div>
      </div>
    </TooltipProvider>
  );
}

// Table Size Grid Component
function TableSizeGrid({ onSelect }: { onSelect: (rows: number, cols: number) => void }) {
  const [hoverRows, setHoverRows] = React.useState(0);
  const [hoverCols, setHoverCols] = React.useState(0);
  const MAX_ROWS = 8;
  const MAX_COLS = 8;

  return (
    <div className="p-3">
      <div className="text-xs font-medium mb-2 text-center text-muted-foreground">
        {hoverRows > 0 && hoverCols > 0 
          ? `${hoverRows} × ${hoverCols}` 
          : "Выберите размер"}
      </div>
      
      <div 
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 1fr)` }}
        onMouseLeave={() => { setHoverRows(0); setHoverCols(0); }}
      >
        {Array.from({ length: MAX_ROWS * MAX_COLS }).map((_, i) => {
          const row = Math.floor(i / MAX_COLS) + 1;
          const col = (i % MAX_COLS) + 1;
          const isHighlighted = row <= hoverRows && col <= hoverCols;
          
          return (
            <div
              key={i}
              className={`
                w-4 h-4 border rounded-sm cursor-pointer transition-colors
                ${isHighlighted 
                  ? "bg-primary border-primary" 
                  : "bg-background border-border hover:border-primary/50"
                }
              `}
              onMouseEnter={() => { setHoverRows(row); setHoverCols(col); }}
              onClick={() => onSelect(row, col)}
            />
          );
        })}
      </div>
      
      <div className="mt-2 pt-2 border-t">
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start text-xs h-7"
          onClick={() => {
            const rows = prompt("Количество строк:", "3");
            const cols = prompt("Количество столбцов:", "3");
            if (rows && cols) {
              const r = parseInt(rows);
              const c = parseInt(cols);
              if (r > 0 && c > 0 && r <= 50 && c <= 20) {
                onSelect(r, c);
              }
            }
          }}
        >
          <Plus className="h-3 w-3 mr-2" />
          Другой размер...
        </Button>
      </div>
    </div>
  );
}

// Toolbar Button Component
interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  icon: React.ReactNode;
  tooltip: string;
  activeColor?: string;
}

function ToolbarButton({ onClick, isActive, icon, tooltip, activeColor }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isActive ? "secondary" : "ghost"}
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            onClick();
          }}
          className="h-7 w-7 p-0"
          style={isActive && activeColor ? { 
            backgroundColor: `${activeColor}15`,
            color: activeColor,
          } : undefined}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={5}>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Helper functions
function setAlignment(
  editor: Editor,
  align: "left" | "center" | "right" | "justify"
): void {
  Transforms.setNodes(
    editor,
    { align } as any,
    {
      match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
    }
  );
}
