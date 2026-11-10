import React from "react";
import { Download } from "lucide-react";
import { useTranslations } from "../i18n";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

interface DocumentDownloadActionProps {
  onDownloadCurrent: () => void;
  onDownloadOriginal?: () => void;
  compact?: boolean;
}

export function DocumentDownloadAction({ onDownloadCurrent, onDownloadOriginal, compact = false }: DocumentDownloadActionProps) {
  const { editor } = useTranslations();
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={compact ? "h-7 w-7 p-0" : "h-7 gap-1 px-2"}
      aria-label={onDownloadOriginal ? editor.download : editor.downloadCopy}
      title={onDownloadOriginal ? editor.download : editor.downloadCopy}
      data-testid="docx-download-action"
      onClick={onDownloadOriginal ? undefined : onDownloadCurrent}
    >
      <Download className="h-3.5 w-3.5" />
      {!compact && <span>{onDownloadOriginal ? editor.download : editor.downloadCopy}</span>}
    </Button>
  );

  if (!onDownloadOriginal) return trigger;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onDownloadCurrent}>{editor.downloadCopy}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onDownloadOriginal}>{editor.downloadOriginal}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
