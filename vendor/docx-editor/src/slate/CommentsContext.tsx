import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Editor, Text, Transforms, Node } from "slate";
import type { CommentMark, CommentStatus, CommentAuthor, CommentReply, Comment } from "./types";

export interface CommentsContextValue {
  // Comments extracted from editor content
  comments: Comment[];
  activeCommentId: string | null;
  showCommentsPanel: boolean;
  
  // Editor reference for extracting/modifying comments
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
  
  // Actions that modify the editor content directly
  resolveComment: (commentId: string, resolvedBy: CommentAuthor) => void;
  reopenComment: (commentId: string) => void;
  deleteComment: (commentId: string) => void;
  replyToComment: (commentId: string, content: string, author: CommentAuthor) => void;
  
  setActiveCommentId: (id: string | null) => void;
  setShowCommentsPanel: (show: boolean) => void;
  toggleCommentsPanel: () => void;
  
  // Navigation between comments
  navigateNextComment: () => void;
  navigatePrevComment: () => void;
  
  // Extract comments from editor content
  extractComments: () => Comment[];
  // Force re-extraction of comments (e.g. after adding a comment mark directly)
  refreshComments: () => void;
}

const CommentsContext = createContext<CommentsContextValue | null>(null);

export interface CommentsProviderProps {
  children: React.ReactNode;
  currentUser?: CommentAuthor;
}

// Extract comment from CommentMark to Comment format
function markToComment(mark: CommentMark, anchorText: string): Comment {
  return {
    id: mark.commentId,
    content: mark.content || "",
    author: mark.author || { id: 0, username: "Unknown" },
    createdAt: mark.createdAt || new Date().toISOString(),
    anchorText,
    status: mark.status || "open",
    resolvedBy: mark.resolvedBy,
    resolvedAt: mark.resolvedAt,
    replies: mark.replies?.map(r => ({
      id: r.id,
      content: r.content,
      author: r.author,
      createdAt: r.createdAt,
      anchorText: "",
      status: "open" as CommentStatus,
      replies: [],
    })) || [],
  };
}

export function CommentsProvider({
  children,
  currentUser,
}: CommentsProviderProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [commentsVersion, setCommentsVersion] = useState(0);

  // Extract all comments from editor content
  const extractComments = useCallback((): Comment[] => {
    if (!editor) return [];

    const commentsMap = new Map<string, { mark: CommentMark; anchorText: string }>();

    // Traverse all text nodes and collect unique comments
    for (const [node, path] of Editor.nodes(editor, { at: [], match: Text.isText })) {
      const textNode = node as { text: string; comment?: CommentMark };
      if (textNode.comment) {
        const commentId = textNode.comment.commentId;
        const existing = commentsMap.get(commentId);
        if (existing) {
          // Append text to existing anchor text
          existing.anchorText += textNode.text;
        } else {
          commentsMap.set(commentId, {
            mark: textNode.comment,
            anchorText: textNode.text,
          });
        }
      }
    }

    // Convert to Comment array
    const comments: Comment[] = [];
    commentsMap.forEach(({ mark, anchorText }) => {
      comments.push(markToComment(mark, anchorText.slice(0, 100)));
    });

    // Sort by creation date (newest first)
    comments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return comments;
  }, [editor]);

  // Get comments (memoized based on version)
  const comments = useMemo(() => {
    // commentsVersion triggers re-extraction when editor changes
    return extractComments();
  }, [extractComments, commentsVersion]);

  // Helper to update comment marks in the editor
  const updateCommentMarks = useCallback((
    commentId: string, 
    updater: (mark: CommentMark) => CommentMark
  ) => {
    if (!editor) return;

    // Find all text nodes with this comment and update them
    for (const [node, path] of Editor.nodes(editor, { at: [], match: Text.isText })) {
      const textNode = node as { text: string; comment?: CommentMark };
      if (textNode.comment?.commentId === commentId) {
        const updatedMark = updater(textNode.comment);
        Transforms.setNodes(
          editor,
          { comment: updatedMark } as any,
          { at: path }
        );
      }
    }

    // Trigger re-extraction
    setCommentsVersion(v => v + 1);
  }, [editor]);

  // Resolve comment
  const resolveComment = useCallback((commentId: string, resolvedBy: CommentAuthor) => {
    updateCommentMarks(commentId, (mark) => ({
      ...mark,
      status: "resolved",
      resolvedBy,
      resolvedAt: new Date().toISOString(),
    }));
  }, [updateCommentMarks]);

  // Reopen comment
  const reopenComment = useCallback((commentId: string) => {
    updateCommentMarks(commentId, (mark) => ({
      ...mark,
      status: "open",
      resolvedBy: undefined,
      resolvedAt: undefined,
    }));
  }, [updateCommentMarks]);

  // Delete comment (remove the mark from text)
  const deleteComment = useCallback((commentId: string) => {
    if (!editor) return;

    // Remove comment mark from all text nodes with this comment
    for (const [node, path] of Editor.nodes(editor, { at: [], match: Text.isText })) {
      const textNode = node as { text: string; comment?: CommentMark };
      if (textNode.comment?.commentId === commentId) {
        Transforms.unsetNodes(editor, "comment", { at: path });
      }
    }

    // Clear active if it was this comment
    if (activeCommentId === commentId) {
      setActiveCommentId(null);
    }

    // Trigger re-extraction
    setCommentsVersion(v => v + 1);
  }, [editor, activeCommentId]);

  // Reply to comment
  const replyToComment = useCallback((commentId: string, content: string, author: CommentAuthor) => {
    const reply: CommentReply = {
      id: `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      author,
      createdAt: new Date().toISOString(),
    };

    updateCommentMarks(commentId, (mark) => ({
      ...mark,
      replies: [...(mark.replies || []), reply],
    }));
  }, [updateCommentMarks]);

  const toggleCommentsPanel = useCallback(() => {
    setShowCommentsPanel(prev => !prev);
  }, []);

  // Force re-extraction of comments from editor content
  const refreshComments = useCallback(() => {
    setCommentsVersion(v => v + 1);
  }, []);

  // Navigate to next comment (returns new comment id for caller to handle scroll)
  const navigateNextComment = useCallback(() => {
    if (comments.length === 0) return;
    
    const currentIndex = activeCommentId 
      ? comments.findIndex(c => c.id === activeCommentId)
      : -1;
    
    const nextIndex = currentIndex < comments.length - 1 ? currentIndex + 1 : 0;
    const nextComment = comments[nextIndex];
    
    if (nextComment) {
      setActiveCommentId(nextComment.id);
    }
  }, [comments, activeCommentId]);

  // Navigate to previous comment
  const navigatePrevComment = useCallback(() => {
    if (comments.length === 0) return;
    
    const currentIndex = activeCommentId 
      ? comments.findIndex(c => c.id === activeCommentId)
      : 0;
    
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : comments.length - 1;
    const prevComment = comments[prevIndex];
    
    if (prevComment) {
      setActiveCommentId(prevComment.id);
    }
  }, [comments, activeCommentId]);

  // Set editor reference — only bump version when editor actually changes
  const handleSetEditor = useCallback((newEditor: Editor | null) => {
    setEditor(prev => {
      if (prev === newEditor) return prev;
      if (newEditor !== null) {
        // Defer version bump to avoid setState-during-render
        setTimeout(() => setCommentsVersion(v => v + 1), 0);
      }
      return newEditor;
    });
  }, []);

  const value = useMemo<CommentsContextValue>(() => ({
    comments,
    activeCommentId,
    showCommentsPanel,
    editor,
    setEditor: handleSetEditor,
    resolveComment,
    reopenComment,
    deleteComment,
    replyToComment,
    setActiveCommentId,
    setShowCommentsPanel,
    toggleCommentsPanel,
    navigateNextComment,
    navigatePrevComment,
    extractComments,
    refreshComments,
  }), [
    comments,
    activeCommentId,
    showCommentsPanel,
    editor,
    handleSetEditor,
    resolveComment,
    reopenComment,
    deleteComment,
    replyToComment,
    toggleCommentsPanel,
    navigateNextComment,
    navigatePrevComment,
    extractComments,
    refreshComments,
  ]);

  return (
    <CommentsContext.Provider value={value}>
      {children}
    </CommentsContext.Provider>
  );
}

export function useCommentsContext() {
  const context = useContext(CommentsContext);
  if (!context) {
    throw new Error("useCommentsContext must be used within a CommentsProvider");
  }
  return context;
}

export function useOptionalCommentsContext() {
  return useContext(CommentsContext);
}
