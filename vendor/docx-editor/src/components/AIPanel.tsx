import React, { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Loader2, Check, X } from "lucide-react";

interface LLMSuggestion {
  id: string;
  type: "text_replacement" | "text_addition" | "text_deletion";
  description: string;
  content?: string;
  original_text?: string;
}

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (text: string, suggestion?: LLMSuggestion) => void;
  originalText: string;
  action: string;
  apiEndpoint?: string;
  authToken?: string;
  selectedModel?: string;
  onRequestAI?: (text: string, action: string) => Promise<{ result: string; suggestion?: LLMSuggestion }>;
}

const ACTION_LABELS: Record<string, string> = {
  "rephrase": "Перефразировать",
  "fix-grammar": "Исправить грамматику",
  "translate-en": "Перевести на английский",
  "translate-ru": "Перевести на русский",
  "summarize": "Кратко изложить",
  "expand": "Расширить",
  "simplify": "Упростить",
  "formal": "Формальный стиль",
};

export function AIPanel({
  isOpen,
  onClose,
  onAccept,
  originalText,
  action,
  apiEndpoint,
  authToken,
  selectedModel,
  onRequestAI,
}: AIPanelProps) {
  const [result, setResult] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<LLMSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processWithAI = useCallback(async () => {
    if (!originalText || !action) return;

    setIsLoading(true);
    setResult(null);
    setError(null);
    setSuggestion(null);

    try {
      if (onRequestAI) {
        const response = await onRequestAI(originalText, action);
        setResult(response.result);
        if (response.suggestion) {
          setSuggestion(response.suggestion);
        }
      } else if (apiEndpoint && authToken) {
        const response = await fetch(apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            text: originalText,
            action: action,
            model: selectedModel || "default",
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        setResult(data.result);

        if (data.suggestion) {
          setSuggestion(data.suggestion);
        } else {
          setSuggestion({
            id: `ai-${Date.now()}`,
            type: "text_replacement",
            description: ACTION_LABELS[action] || action,
            content: data.result,
            original_text: originalText,
          });
        }
      } else {
        let processed = originalText;
        if (action === "rephrase") processed = `[Rephrased]: ${originalText}`;
        if (action === "fix-grammar") processed = `[Fixed]: ${originalText}`;
        if (action === "translate-en") processed = `[Translated EN]: ${originalText}`;
        if (action === "translate-ru") processed = `[Translated RU]: ${originalText}`;
        if (action === "summarize") processed = `[Summary]: ${originalText.substring(0, 50)}...`;
        if (action === "expand") processed = `[Expanded]: ${originalText}. Additional context...`;
        if (action === "simplify") processed = `[Simplified]: ${originalText}`;
        if (action === "formal") processed = `[Formal]: ${originalText}`;

        setResult(processed);
        setSuggestion({
          id: `mock-${Date.now()}`,
          type: "text_replacement",
          description: ACTION_LABELS[action] || action,
          content: processed,
          original_text: originalText,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process with AI");
    } finally {
      setIsLoading(false);
    }
  }, [originalText, action, apiEndpoint, authToken, selectedModel, onRequestAI]);

  useEffect(() => {
    if (isOpen && originalText && action) {
      processWithAI();
    }
  }, [isOpen, originalText, action, processWithAI]);

  const handleAccept = () => {
    if (result) {
      onAccept(result, suggestion || undefined);
    }
  };

  const actionLabel = ACTION_LABELS[action] || action;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>AI Assistant: {actionLabel}</DialogTitle>
          <DialogDescription>
            Просмотрите предложенные изменения перед применением.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground">Оригинал</h4>
            <div className="p-3 bg-red-50/50 dark:bg-red-950/20 rounded-md text-sm border border-red-200 dark:border-red-900 max-h-[120px] overflow-y-auto">
              {originalText}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground">Предложение AI</h4>
            <div className="p-3 bg-green-50/50 dark:bg-green-950/20 rounded-md text-sm border border-green-200 dark:border-green-900 min-h-[60px] max-h-[200px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Генерация...
                </div>
              ) : error ? (
                <div className="text-red-500">{error}</div>
              ) : (
                result
              )}
            </div>
          </div>

          {suggestion && (
            <div className="text-xs text-muted-foreground">
              Изменение будет применено как Track Change
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Отмена
          </Button>
          <Button
            onClick={handleAccept}
            disabled={isLoading || !result || !!error}
            className="bg-green-600 hover:bg-green-700"
          >
            <Check className="h-4 w-4 mr-1" />
            Принять
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

