import React, { useDeferredValue } from "react";
import { useSlate } from "slate-react";
import { Check, ChevronDown, Type } from "lucide-react";

import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "./ui/dropdown-menu";
import {
  FONT_FAMILIES,
  FONT_SIZES,
  COLORS,
  setFontFamily,
  setFontSize,
  setColor,
  getActiveFontFamily,
  getActiveFontSize,
  getActiveColor,
} from "../slate/fontUtils";

interface FontControlsProps {
  compact?: boolean;
}

export function FontControls({ compact = false }: FontControlsProps) {
  const editor = useSlate();
  
  // Get active values - these trigger recalculation
  const activeFontFamilyImmediate = getActiveFontFamily(editor);
  const activeFontSizeImmediate = getActiveFontSize(editor);
  const activeColorImmediate = getActiveColor(editor);
  
  // Use deferred values for display - keeps typing responsive
  // Font controls display can lag slightly without affecting input
  const activeFontFamily = useDeferredValue(activeFontFamilyImmediate);
  const activeFontSize = useDeferredValue(activeFontSizeImmediate);
  const activeColor = useDeferredValue(activeColorImmediate);
  
  // Round font size for display
  const displayFontSize = typeof activeFontSize === 'number' 
    ? Math.round(activeFontSize * 10) / 10 
    : activeFontSize;

  // Get short font name for compact mode
  const shortFontName = activeFontFamily.split(' ')[0].substring(0, 8);

  return (
    <div className="flex items-center gap-0.5">
      {/* Font Family */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={`${compact ? 'w-[80px]' : 'w-[110px]'} h-7 justify-between px-2 text-xs`}>
            <span className="truncate">{compact ? shortFontName : activeFontFamily}</span>
            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-[300px] overflow-y-auto">
          <DropdownMenuLabel>Шрифт</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {FONT_FAMILIES.map((font) => (
            <DropdownMenuItem
              key={font.value}
              onClick={() => setFontFamily(editor, font.value)}
              className="justify-between"
              style={{ fontFamily: font.value }}
            >
              {font.name}
              {activeFontFamily === font.value && <Check className="h-3 w-3" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Font Size */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="w-[50px] h-7 justify-between px-2 text-xs">
            <span>{displayFontSize}</span>
            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-[300px] overflow-y-auto">
          <DropdownMenuLabel>Размер</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {FONT_SIZES.map((size) => (
            <DropdownMenuItem
              key={size}
              onClick={() => setFontSize(editor, size)}
              className="justify-between"
            >
              {size}
              {activeFontSize === size && <Check className="h-3 w-3" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Color Picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="w-7 h-7 p-0">
            <div 
              className="h-3.5 w-3.5 rounded-full border border-border" 
              style={{ backgroundColor: activeColor }}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Цвет текста</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="grid grid-cols-5 gap-1 p-1">
            {COLORS.map((color) => (
              <button
                key={color.value}
                className="h-6 w-6 rounded-full border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: color.value }}
                onClick={() => setColor(editor, color.value)}
                title={color.name}
              />
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

