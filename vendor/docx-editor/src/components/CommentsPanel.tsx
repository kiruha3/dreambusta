import React, { useState, useRef, useEffect } from "react";
import {
  Check,
  RotateCcw,
  Trash2,
  Reply,
  X,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Send,
} from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { useCommentsContext } from "../slate/CommentsContext";
import { useTranslations } from "../i18n";
import { useEditorTheme } from "../theme";
import type { Comment, CommentAuthor, CommentReply } from "../slate/types";

interface CommentsPanelProps {
  currentUser?: CommentAuthor;
  onClose?: () => void;
}

export function CommentsPanel({ currentUser, onClose }: CommentsPanelProps) {
  const { 
    comments, 
    activeCommentId, 
    setActiveCommentId,
    resolveComment,
    reopenComment,
    deleteComment,
    replyToComment,
  } = useCommentsContext();
  const t = useTranslations();
  const theme = useEditorTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  
  const handleSelectComment = (commentId: string) => {
    setActiveCommentId(commentId);
    scrollToComment(commentId);
  };

  // Navigate and scroll
  const goToNextComment = () => {
    if (sortedComments.length === 0) return;
    const currentIndex = activeCommentId 
      ? sortedComments.findIndex(c => c.id === activeCommentId)
      : -1;
    const nextIndex = currentIndex < sortedComments.length - 1 ? currentIndex + 1 : 0;
    const nextId = sortedComments[nextIndex]?.id;
    if (nextId) {
      setActiveCommentId(nextId);
      scrollToComment(nextId);
    }
  };

  const goToPrevComment = () => {
    if (sortedComments.length === 0) return;
    const currentIndex = activeCommentId 
      ? sortedComments.findIndex(c => c.id === activeCommentId)
      : 0;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : sortedComments.length - 1;
    const prevId = sortedComments[prevIndex]?.id;
    if (prevId) {
      setActiveCommentId(prevId);
      scrollToComment(prevId);
    }
  };

  // Handle keyboard navigation (Tab/Shift+Tab, Arrow Up/Down)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        goToPrevComment();
      } else {
        goToNextComment();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      goToPrevComment();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      goToNextComment();
    }
  };

  // Get current comment position
  const activeIndex = activeCommentId 
    ? comments.findIndex(c => c.id === activeCommentId) + 1
    : 0;

  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  // All comments are now root comments (replies are nested in the mark)
  const rootComments = comments;
  
  // Filter comments based on status
  const filteredComments = rootComments.filter(c => {
    if (filter === "all") return true;
    return c.status === filter;
  });

  // Sort by creation date (newest first)
  const sortedComments = [...filteredComments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const openCount = rootComments.filter(c => c.status === "open").length;
  const resolvedCount = rootComments.filter(c => c.status === "resolved").length;

  const toggleThread = (commentId: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  // Track previous activeCommentId to detect external changes (clicks in document)
  const prevActiveCommentIdRef = useRef<string | null>(null);

  // Auto-expand active comment's thread if it has replies
  // Also scroll panel when comment is selected from document (external change)
  useEffect(() => {
    if (activeCommentId) {
      const comment = comments.find(c => c.id === activeCommentId);
      if (comment?.replies?.length) {
        setExpandedThreads(prev => new Set([...prev, comment.id]));
      }
      
      // Scroll panel to active comment when selected from document
      // (only if activeCommentId changed externally, not from panel navigation)
      if (prevActiveCommentIdRef.current !== activeCommentId) {
        setTimeout(() => {
          const panelElement = panelRef.current?.querySelector(`[data-panel-comment-id="${activeCommentId}"]`);
          if (panelElement) {
            panelElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }, 0);
      }
    }
    prevActiveCommentIdRef.current = activeCommentId;
  }, [activeCommentId, comments]);

  // Scroll both document and panel to comment (called on panel actions)
  const scrollToComment = (commentId: string) => {
    // Scroll document
    const docElement = document.querySelector(`[data-comment-id="${commentId}"]`);
    if (docElement) {
      docElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Scroll panel
    const panelElement = panelRef.current?.querySelector(`[data-panel-comment-id="${commentId}"]`);
    if (panelElement) {
      panelElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  return (
    <div 
      ref={panelRef}
      className="flex flex-col border-l"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ 
        width: "320px", 
        height: "100%",
        flexShrink: 0,
        backgroundColor: "var(--background)",
        borderColor: "var(--border)",
        outline: "none",
      }}
    >
      {/* Header - fixed */}
      <div 
        className="flex items-center justify-between p-3 border-b flex-shrink-0"
        style={{ 
          borderColor: "var(--border)",
          backgroundColor: "var(--background)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold">{t.comments.title}</span>
          {rootComments.length > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-4 h-4 text-[10px] font-medium rounded-full px-1"
              style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              {rootComments.length > 99 ? "99+" : rootComments.length}
            </span>
          )}
        </div>
        
        {/* Navigation arrows */}
        <div className="flex items-center gap-1">
          {rootComments.length > 0 && (
            <>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 w-7 p-0"
                onClick={goToPrevComment}
                title={t.comments.prevComment}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <span className="text-xs" style={{ color: "var(--muted-foreground)", minWidth: "40px", textAlign: "center" }}>
                {activeIndex > 0 ? t.comments.commentPosition(activeIndex, rootComments.length) : "—"}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 w-7 p-0"
                onClick={goToNextComment}
                title={t.comments.nextComment}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 ml-1" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Filter tabs - fixed */}
      <div 
        className="flex border-b flex-shrink-0"
        style={{ 
          borderColor: "var(--border)",
          backgroundColor: "var(--background)",
        }}
      >
        <FilterTab 
          active={filter === "all"} 
          onClick={() => setFilter("all")}
          count={rootComments.length}
        >
          {t.comments.all}
        </FilterTab>
        <FilterTab 
          active={filter === "open"} 
          onClick={() => setFilter("open")}
          count={openCount}
        >
          {t.comments.open}
        </FilterTab>
        <FilterTab 
          active={filter === "resolved"} 
          onClick={() => setFilter("resolved")}
          count={resolvedCount}
        >
          {t.comments.resolved}
        </FilterTab>
      </div>

      {/* Comments list with independent scroll */}
      <div 
        className="flex-1 min-h-0 overflow-y-auto"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border) transparent",
        }}
      >
        <style>{`
          div[class*="overflow-y-auto"]::-webkit-scrollbar {
            width: 8px;
          }
          div[class*="overflow-y-auto"]::-webkit-scrollbar-track {
            background: transparent;
          }
          div[class*="overflow-y-auto"]::-webkit-scrollbar-thumb {
            background-color: var(--border);
            border-radius: 4px;
          }
          div[class*="overflow-y-auto"]::-webkit-scrollbar-thumb:hover {
            background-color: var(--muted-foreground);
          }
        `}</style>
        <div className="p-2 space-y-2">
          {sortedComments.length === 0 ? (
            <div className="text-center py-4" style={{ color: "var(--muted-foreground)" }}>
              <p className="text-sm">{t.comments.noComments}</p>
              <p className="text-xs mt-1">
                {t.comments.noCommentsHint}
              </p>
            </div>
          ) : (
            sortedComments.map(comment => (
              <CommentThread
                key={comment.id}
                comment={comment}
                currentUser={currentUser}
                isActive={activeCommentId === comment.id}
                isExpanded={expandedThreads.has(comment.id)}
                onToggleExpand={() => toggleThread(comment.id)}
                onSelect={() => handleSelectComment(comment.id)}
                onResolve={() => currentUser && resolveComment(comment.id, currentUser)}
                onReopen={() => reopenComment(comment.id)}
                onDelete={() => deleteComment(comment.id)}
                onReply={(content) => currentUser && replyToComment(comment.id, content, currentUser)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface FilterTabProps {
  children: React.ReactNode;
  active: boolean;
  count: number;
  onClick: () => void;
}

function FilterTab({ children, active, count, onClick }: FilterTabProps) {
  const theme = useEditorTheme();
  return (
    <button
      onClick={onClick}
      className="flex-1 px-3 py-2 text-sm font-medium transition-colors"
      style={{
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
        borderBottom: active ? `2px solid ${theme.primaryButton}` : "2px solid transparent",
        backgroundColor: "transparent",
      }}
    >
      {children}
      <span className="ml-1 text-xs opacity-60">({count})</span>
    </button>
  );
}

interface CommentThreadProps {
  comment: Comment;
  currentUser?: CommentAuthor;
  isActive: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  onResolve: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onReply: (content: string) => void;
}

function CommentThread({
  comment,
  currentUser,
  isActive,
  isExpanded,
  onToggleExpand,
  onSelect,
  onResolve,
  onReopen,
  onDelete,
  onReply,
}: CommentThreadProps) {
  const t = useTranslations();
  const theme = useEditorTheme();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState("");
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  const isResolved = comment.status === "resolved";
  const hasReplies = comment.replies && comment.replies.length > 0;
  const canModify = currentUser && comment.author.id === currentUser.id;

  useEffect(() => {
    if (showReplyInput && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [showReplyInput]);

  const handleSubmitReply = () => {
    if (replyText.trim()) {
      onReply(replyText.trim());
      setReplyText("");
      setShowReplyInput(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitReply();
    }
    if (e.key === "Escape") {
      setShowReplyInput(false);
      setReplyText("");
    }
  };

  return (
    <div
      className="rounded-lg border transition-all"
      data-panel-comment-id={comment.id}
      style={{
        borderColor: isActive ? theme.primaryButton : "var(--border)",
        backgroundColor: isActive ? theme.commentHighlightActive : "var(--background)",
        opacity: isResolved ? 0.7 : 1,
      }}
    >
      {/* Main comment */}
      <div 
        className="p-3 cursor-pointer"
        onClick={onSelect}
      >
        {/* Header with author and time */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
              style={{
                backgroundColor: theme.avatarBackground,
                color: theme.avatarText,
              }}
            >
              {comment.author.firstName?.[0] || comment.author.username[0].toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium">
                {comment.author.firstName
                  ? `${comment.author.firstName} ${comment.author.lastName || ""}`.trim()
                  : comment.author.username}
              </div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {formatTimeAgo(comment.createdAt)}
              </div>
            </div>
          </div>

          {/* Status badge */}
          {isResolved && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "rgba(34, 197, 94, 0.1)",
                color: "rgb(22, 163, 74)",
              }}
            >
              {t.comments.resolvedBadge}
            </span>
          )}
        </div>

        {/* Anchor text preview */}
        {comment.anchorText && (
          <div 
            className="text-xs mb-2 px-2 py-1 rounded border-l-2"
            style={{ 
              backgroundColor: "var(--muted)",
              borderLeftColor: theme.primaryButton,
              color: "var(--muted-foreground)",
            }}
          >
            "{comment.anchorText.length > 50 
              ? comment.anchorText.slice(0, 50) + "..." 
              : comment.anchorText}"
          </div>
        )}

        {/* Comment content */}
        <p className="text-sm" style={{ textDecoration: isResolved ? "line-through" : "none" }}>
          {comment.content}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
            {!isResolved ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); onResolve(); }}
                >
                  <Check className="h-3 w-3 mr-1" />
                  {t.comments.resolve}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); setShowReplyInput(true); }}
                >
                  <Reply className="h-3 w-3 mr-1" />
                  {t.comments.reply}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={(e) => { e.stopPropagation(); onReopen(); }}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                {t.comments.reopen}
              </Button>
            )}
          </div>
          {canModify && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-40 hover:opacity-100 transition-opacity"
              style={{ color: "var(--destructive)" }}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Reply input */}
      {showReplyInput && (
        <div className="px-3 pb-3">
          <div className="flex gap-2">
            <textarea
              ref={replyInputRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.comments.replyPlaceholder}
              className="flex-1 min-h-[60px] px-2 py-1.5 text-sm rounded border resize-none"
              style={{
                backgroundColor: "var(--background)",
                borderColor: "var(--border)",
              }}
            />
          </div>
          <div className="flex justify-end gap-1 mt-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7"
              onClick={() => { setShowReplyInput(false); setReplyText(""); }}
            >
              {t.comments.cancel}
            </Button>
            <Button 
              size="sm" 
              className="h-7"
              onClick={handleSubmitReply}
              disabled={!replyText.trim()}
              style={{ backgroundColor: theme.primaryButton, color: theme.primaryButtonText }}
            >
              <Send className="h-3 w-3 mr-1" />
              {t.comments.reply}
            </Button>
          </div>
        </div>
      )}

      {/* Replies */}
      {hasReplies && (
        <>
          <Separator />
          <div 
            className="px-3 py-2 cursor-pointer flex items-center gap-1 text-xs"
            style={{ color: "var(--muted-foreground)" }}
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {t.comments.repliesCount(comment.replies!.length)}
          </div>
          
          {isExpanded && (
            <div className="px-3 pb-3 space-y-2">
              {comment.replies!.map(reply => (
                <ReplyItem key={reply.id} reply={reply} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface ReplyItemProps {
  reply: CommentReply;
}

function ReplyItem({ reply }: ReplyItemProps) {
  return (
    <div 
      className="pl-4 border-l-2"
      style={{ borderLeftColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div 
          className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
          style={{ 
            backgroundColor: "rgba(156, 163, 175, 0.2)",
            color: "rgb(107, 114, 128)",
          }}
        >
          {reply.author.firstName?.[0] || reply.author.username[0].toUpperCase()}
        </div>
        <span className="text-xs font-medium">
          {reply.author.firstName 
            ? `${reply.author.firstName} ${reply.author.lastName || ""}`.trim()
            : reply.author.username}
        </span>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {formatTimeAgo(reply.createdAt)}
        </span>
      </div>
      <p className="text-sm ml-7">{reply.content}</p>
    </div>
  );
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  
  return date.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export default CommentsPanel;

