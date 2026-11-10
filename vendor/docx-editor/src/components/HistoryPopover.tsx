import React, { useState, useCallback, memo } from "react";
import { History } from "lucide-react";
import { Button } from "./ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import type { Version, CompareState } from "./SlateEditor";
import { useTranslations } from "../i18n";

interface HistoryPopoverProps {
  versions: Version[];
  compareState: CompareState;
  onCompareStateChange: (state: CompareState) => void;
  onRestore: (version: Version) => void;
  onVersionRequest?: (versionId: string) => void;
  hasUnsavedChanges: boolean;
  onSave: () => void;
}

export const HistoryPopover = memo(function HistoryPopover({
  versions,
  compareState,
  onCompareStateChange,
  onRestore,
  onVersionRequest,
  hasUnsavedChanges,
  onSave,
}: HistoryPopoverProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);

  const toggleVersionSelect = useCallback((versionId: string) => {
    const { leftVersionId, rightVersionId } = compareState;
    
    // Request version content if needed (lazy loading)
    const version = versions.find(v => v.id === versionId);
    if (version && (!version.content || version.content.length === 0)) {
      onVersionRequest?.(versionId);
    }
    
    if (leftVersionId === versionId) {
      onCompareStateChange({ ...compareState, leftVersionId: null });
    } else if (rightVersionId === versionId) {
      onCompareStateChange({ ...compareState, rightVersionId: null });
    } else if (!leftVersionId) {
      onCompareStateChange({ ...compareState, leftVersionId: versionId });
    } else if (!rightVersionId) {
      onCompareStateChange({ ...compareState, rightVersionId: versionId });
    } else {
      onCompareStateChange({ ...compareState, rightVersionId: versionId });
    }
  }, [compareState, onCompareStateChange, versions, onVersionRequest]);

  const startCompare = useCallback((mode: "unified" | "sideBySide") => {
    onCompareStateChange({ ...compareState, mode });
    setIsOpen(false);
  }, [compareState, onCompareStateChange]);

  const clearSelection = useCallback(() => {
    onCompareStateChange({ mode: null, leftVersionId: null, rightVersionId: null });
  }, [onCompareStateChange]);

  const handleRestore = useCallback((version: Version) => {
    onRestore(version);
    setIsOpen(false);
  }, [onRestore]);

  const hasSelection = compareState.leftVersionId || compareState.rightVersionId;
  const canCompare = compareState.leftVersionId !== null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 gap-1">
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">{t.history.title}</span>
          {versions.length > 0 && (
            <span className="docx-version-chip ml-1 text-xs px-1.5 py-0.5 rounded">
              {versions.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        align="end"
        style={{ maxHeight: "70vh", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div className="p-3 border-b">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm">{t.history.versionHistory}</h4>
            {hasUnsavedChanges && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => {
                  onSave();
                }}
              >
                {t.history.save}
              </Button>
            )}
          </div>
          
          {/* Compare controls */}
          {versions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {hasSelection ? (
                  <>
                    {t.history.selected}: {compareState.leftVersionId ? "1" : "0"}{compareState.rightVersionId ? "+1" : ""} {t.history.versions}
                    {!compareState.rightVersionId && compareState.leftVersionId && ` (${t.history.compareWithCurrent})`}
                  </>
                ) : (
                  t.history.selectVersionsToCompare
                )}
              </p>
              
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  variant={canCompare ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!canCompare}
                  onClick={() => startCompare("unified")}
                >
                  {t.history.unified}
                </Button>
                <Button
                  variant={canCompare ? "secondary" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!canCompare}
                  onClick={() => startCompare("sideBySide")}
                >
                  {t.history.sideBySide}
                </Button>
                {hasSelection && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={clearSelection}
                  >
                    {t.history.reset}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Version list */}
        <div className="flex-1 overflow-auto p-2" style={{ maxHeight: "400px" }}>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t.history.noSavedVersions}<br/>
              <span className="text-xs">{t.history.ctrlSToSave}</span>
            </p>
          ) : (
            <div className="space-y-1.5">
              {/* Current document option */}
              {compareState.leftVersionId && (
                <div
                  className={`docx-version-card rounded-md border cursor-pointer transition-colors ${
                    !compareState.rightVersionId ? "docx-version-card--b" : ""
                  }`}
                  style={{ padding: "10px" }}
                  onClick={() => {
                    if (compareState.leftVersionId) {
                      onCompareStateChange({ ...compareState, rightVersionId: null });
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">{t.history.currentDocument}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                      Live
                    </span>
                  </div>
                </div>
              )}
              
              {versions.map((version, index) => {
                const isLeft = compareState.leftVersionId === version.id;
                const isRight = compareState.rightVersionId === version.id;
                const isSelected = isLeft || isRight;
                
                return (
                  <div
                    key={version.id}
                    className={`docx-version-card rounded-md border cursor-pointer transition-colors relative ${
                      isSelected
                        ? isLeft ? "docx-version-card--a" : "docx-version-card--b"
                        : index === 0 ? "docx-version-card--latest" : ""
                    }`}
                    style={{ padding: "10px" }}
                    onClick={() => toggleVersionSelect(version.id)}
                  >
                    {/* Selection badge */}
                    {isSelected && (
                      <div className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                        isLeft ? "bg-red-500" : "bg-green-500"
                      }`}>
                        {isLeft ? "A" : "B"}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {new Date(version.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(version.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mb-1.5 line-clamp-1">
                      {version.description}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      {index === 0 && (
                        <span className="docx-version-chip--latest text-[10px] px-1.5 py-0.5 rounded">
                          {t.history.latest}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs ml-auto"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(version);
                        }}
                      >
                        {t.history.restore}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});

export default HistoryPopover;

