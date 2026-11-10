import React, { useEffect, useRef } from "react";
import { Copy, X, Tag, FileText } from "lucide-react";
import { useTranslations } from "../i18n";

export interface VariablePopoverData {
  key: string;
  label: string;
  description?: string;
  type?: string;
  example?: string;
  position: { x: number; y: number };
}

interface VariablePopoverProps {
  variable: VariablePopoverData;
  onClose: () => void;
  onCopy?: (text: string) => void;
}

/**
 * Popover shown when clicking on a template variable in the editor.
 * Shows variable info and allows copying the jinja expression.
 */
export function VariablePopover({ variable, onClose, onCopy }: VariablePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const t = useTranslations();

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Close on Escape
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const adjustedPosition = React.useMemo(() => {
    const padding = 16;
    const popoverWidth = 280;
    const popoverHeight = 180;

    let x = variable.position.x;
    let y = variable.position.y + 8; // 8px below cursor

    // Adjust horizontal position
    if (x + popoverWidth > window.innerWidth - padding) {
      x = window.innerWidth - popoverWidth - padding;
    }
    if (x < padding) {
      x = padding;
    }

    // Adjust vertical position
    if (y + popoverHeight > window.innerHeight - padding) {
      y = variable.position.y - popoverHeight - 8; // Show above cursor
    }

    return { x, y };
  }, [variable.position]);

  const jinjaExpr = `{{ ${variable.key} }}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(jinjaExpr).then(() => {
      onCopy?.(jinjaExpr);
    }).catch(err => {
      console.error("Failed to copy:", err);
    });
  };

  // Map type to display name
  const typeLabels = t.variables.types;

  return (
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 9999,
        width: "280px",
      }}
      className="rounded-lg border docx-floating-surface shadow-lg animate-in fade-in-0 zoom-in-95"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-amber-500" />
          <span className="font-medium text-sm">{t.variables.title}</span>
        </div>
        <button
          onClick={onClose}
          className="h-6 w-6 rounded hover:bg-accent flex items-center justify-center text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Variable name */}
        <div>
          <div className="text-xs text-muted-foreground mb-1">{t.variables.name}</div>
          <div className="font-medium">{variable.label}</div>
          {variable.key !== variable.label && (
            <div className="text-xs text-muted-foreground mt-0.5">
              <code className="bg-muted px-1 py-0.5 rounded">{variable.key}</code>
            </div>
          )}
        </div>

        {/* Type */}
        {variable.type && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t.variables.type}</div>
            <div className="text-sm">{typeLabels[variable.type] || variable.type}</div>
          </div>
        )}

        {/* Description */}
        {variable.description && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t.variables.description}</div>
            <div className="text-sm text-muted-foreground">{variable.description}</div>
          </div>
        )}

        {/* Example */}
        {variable.example && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t.variables.example}</div>
            <div className="text-sm italic">{variable.example}</div>
          </div>
        )}

        {/* Jinja expression with copy button */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <div className="flex-1">
            <code className="text-xs bg-muted px-2 py-1.5 rounded block font-mono">
              {jinjaExpr}
            </code>
          </div>
          <button
            onClick={handleCopy}
            className="h-8 px-3 rounded bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 text-xs font-medium"
            title={t.variables.copy}
          >
            <Copy className="h-3.5 w-3.5" />
            {t.variables.copy}
          </button>
        </div>
      </div>
    </div>
  );
}

export default VariablePopover;
