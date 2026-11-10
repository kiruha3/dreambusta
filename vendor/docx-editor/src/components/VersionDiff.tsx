import React, { useMemo, memo } from "react";
import { Descendant, Text } from "slate";
import type { Version } from "./SlateEditor";

// Shared props for both diff views
interface DiffViewProps {
  leftVersion: Version | null;
  rightVersion: Version | null;
  currentContent: Descendant[];
  onClose: () => void;
}

// Extract plain text lines from Slate content
function extractLines(content: Descendant[]): string[] {
  const lines: string[] = [];
  
  function processNode(node: any): string {
    if (Text.isText(node)) {
      return node.text;
    }
    if (node.children) {
      const childTexts = node.children.map(processNode).join("");
      if (node.type === "paragraph" || node.type === "list-item") {
        lines.push(childTexts);
      } else if (node.type === "table-cell") {
        lines.push(`[Cell: ${childTexts}]`);
      } else {
        return childTexts;
      }
    }
    return "";
  }
  
  content.forEach(processNode);
  return lines;
}

// Word-level inline diff for modified lines
interface InlineDiffPart {
  type: "unchanged" | "added" | "removed";
  text: string;
}

function computeInlineDiff(oldText: string, newText: string): InlineDiffPart[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const result: InlineDiffPart[] = [];
  
  // Simple LCS-based word diff
  const lcs = longestCommonSubsequence(oldWords, newWords);
  
  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;
  
  while (oldIdx < oldWords.length || newIdx < newWords.length) {
    if (lcsIdx < lcs.length && oldIdx < oldWords.length && oldWords[oldIdx] === lcs[lcsIdx]) {
      // Check if new also matches
      if (newIdx < newWords.length && newWords[newIdx] === lcs[lcsIdx]) {
        result.push({ type: "unchanged", text: oldWords[oldIdx] });
        oldIdx++;
        newIdx++;
        lcsIdx++;
      } else {
        result.push({ type: "added", text: newWords[newIdx] });
        newIdx++;
      }
    } else if (lcsIdx < lcs.length && newIdx < newWords.length && newWords[newIdx] === lcs[lcsIdx]) {
      result.push({ type: "removed", text: oldWords[oldIdx] });
      oldIdx++;
    } else if (oldIdx < oldWords.length && newIdx < newWords.length) {
      result.push({ type: "removed", text: oldWords[oldIdx] });
      result.push({ type: "added", text: newWords[newIdx] });
      oldIdx++;
      newIdx++;
    } else if (oldIdx < oldWords.length) {
      result.push({ type: "removed", text: oldWords[oldIdx] });
      oldIdx++;
    } else {
      result.push({ type: "added", text: newWords[newIdx] });
      newIdx++;
    }
  }
  
  // Merge consecutive parts of same type
  const merged: InlineDiffPart[] = [];
  for (const part of result) {
    if (merged.length > 0 && merged[merged.length - 1].type === part.type) {
      merged[merged.length - 1].text += part.text;
    } else {
      merged.push({ ...part });
    }
  }
  
  return merged;
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return lcs;
}

// Extended diff line type with inline diff
interface DiffLine {
  type: "unchanged" | "added" | "removed" | "modified";
  text: string;
  inlineDiff?: InlineDiffPart[];
  oldText?: string;
}

// Simple diff algorithm with inline diff for modified lines
function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  
  let oldIdx = 0;
  let newIdx = 0;
  
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldLines[oldIdx];
    const newLine = newLines[newIdx];
    
    if (oldIdx >= oldLines.length) {
      result.push({ type: "added", text: newLine });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      result.push({ type: "removed", text: oldLine });
      oldIdx++;
    } else if (oldLine === newLine) {
      result.push({ type: "unchanged", text: oldLine });
      oldIdx++;
      newIdx++;
    } else {
      let foundInNew = newLines.indexOf(oldLine, newIdx);
      let foundInOld = oldLines.indexOf(newLine, oldIdx);
      
      if (foundInNew !== -1 && (foundInOld === -1 || foundInNew - newIdx <= foundInOld - oldIdx)) {
        while (newIdx < foundInNew) {
          result.push({ type: "added", text: newLines[newIdx] });
          newIdx++;
        }
      } else if (foundInOld !== -1) {
        while (oldIdx < foundInOld) {
          result.push({ type: "removed", text: oldLines[oldIdx] });
          oldIdx++;
        }
      } else {
        // Lines are different - compute inline diff
        const inlineDiff = computeInlineDiff(oldLine, newLine);
        result.push({ 
          type: "modified", 
          text: newLine, 
          inlineDiff,
          oldText: oldLine 
        });
        oldIdx++;
        newIdx++;
      }
    }
  }
  
  return result;
}

// Side-by-side diff line type with inline diff support
interface SideBySideLine {
  left: { type: "unchanged" | "removed" | "empty" | "modified"; text: string; inlineDiff?: InlineDiffPart[] } | null;
  right: { type: "unchanged" | "added" | "empty" | "modified"; text: string; inlineDiff?: InlineDiffPart[] } | null;
}

// Compute side-by-side diff with aligned lines and inline diff for modifications
function computeSideBySideDiff(oldLines: string[], newLines: string[]): SideBySideLine[] {
  const result: SideBySideLine[] = [];
  
  let oldIdx = 0;
  let newIdx = 0;
  
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldLines[oldIdx];
    const newLine = newLines[newIdx];
    
    if (oldIdx >= oldLines.length) {
      result.push({
        left: { type: "empty", text: "" },
        right: { type: "added", text: newLine },
      });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      result.push({
        left: { type: "removed", text: oldLine },
        right: { type: "empty", text: "" },
      });
      oldIdx++;
    } else if (oldLine === newLine) {
      result.push({
        left: { type: "unchanged", text: oldLine },
        right: { type: "unchanged", text: newLine },
      });
      oldIdx++;
      newIdx++;
    } else {
      let foundInNew = newLines.indexOf(oldLine, newIdx);
      let foundInOld = oldLines.indexOf(newLine, oldIdx);
      
      if (foundInNew !== -1 && (foundInOld === -1 || foundInNew - newIdx <= foundInOld - oldIdx)) {
        while (newIdx < foundInNew) {
          result.push({
            left: { type: "empty", text: "" },
            right: { type: "added", text: newLines[newIdx] },
          });
          newIdx++;
        }
      } else if (foundInOld !== -1) {
        while (oldIdx < foundInOld) {
          result.push({
            left: { type: "removed", text: oldLines[oldIdx] },
            right: { type: "empty", text: "" },
          });
          oldIdx++;
        }
      } else {
        // Lines are modified - compute inline diff
        const inlineDiff = computeInlineDiff(oldLine, newLine);
        result.push({
          left: { type: "modified", text: oldLine, inlineDiff: inlineDiff.filter(p => p.type !== "added") },
          right: { type: "modified", text: newLine, inlineDiff: inlineDiff.filter(p => p.type !== "removed") },
        });
        oldIdx++;
        newIdx++;
      }
    }
  }
  
  return result;
}

// Inline header for diff views
const DiffHeader = memo(function DiffHeader({ 
  title, 
  subtitle,
  stats, 
  onClose 
}: { 
  title: string;
  subtitle: string;
  stats: { added: number; removed: number };
  onClose: () => void;
}) {
  return (
    <div style={{
      padding: "12px 16px",
      backgroundColor: "var(--background)",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderRadius: "8px 8px 0 0",
    }}>
      <div>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{title}</h3>
        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--muted-foreground)" }}>{subtitle}</p>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <span style={{ 
          padding: "3px 8px", 
          backgroundColor: "hsl(0 72% 51% / 0.2)", 
          color: "hsl(0 72% 51%)", 
          borderRadius: "4px", 
          fontSize: "12px",
          fontWeight: 500,
        }}>
          -{stats.removed}
        </span>
        <span style={{ 
          padding: "3px 8px", 
          backgroundColor: "hsl(142 76% 36% / 0.2)", 
          color: "hsl(142 76% 36%)", 
          borderRadius: "4px", 
          fontSize: "12px",
          fontWeight: 500,
        }}>
          +{stats.added}
        </span>
        <button
          onClick={onClose}
          style={{
            marginLeft: "8px",
            padding: "4px 12px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            backgroundColor: "var(--background)",
            cursor: "pointer",
            fontSize: "13px",
            color: "var(--foreground)",
          }}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
});

// Side-by-side diff - inline component
export const SideBySideDiff = memo(function SideBySideDiff({
  leftVersion,
  rightVersion,
  currentContent,
  onClose,
}: DiffViewProps) {
  const { lines, stats } = useMemo(() => {
    const leftContent = leftVersion?.content || [];
    const rightContent = rightVersion?.content || currentContent;
    
    const oldLines = extractLines(leftContent);
    const newLines = extractLines(rightContent);
    const lines = computeSideBySideDiff(oldLines, newLines);
    
    const added = lines.filter(l => l.right?.type === "added" || l.right?.type === "modified").length;
    const removed = lines.filter(l => l.left?.type === "removed" || l.left?.type === "modified").length;

    return { lines, stats: { added, removed } };
  }, [leftVersion, rightVersion, currentContent]);

  const leftLabel = leftVersion 
    ? `${new Date(leftVersion.timestamp).toLocaleTimeString()} - ${leftVersion.description}`
    : "Пусто";
  
  const rightLabel = rightVersion 
    ? `${new Date(rightVersion.timestamp).toLocaleTimeString()} - ${rightVersion.description}`
    : "Текущий документ";

  const getLineStyle = (type: string) => {
    switch (type) {
      case "added":
        return { backgroundColor: "hsl(142 76% 36% / 0.15)", borderLeft: "3px solid hsl(142 76% 36%)" };
      case "removed":
        return { backgroundColor: "hsl(0 72% 51% / 0.15)", borderLeft: "3px solid hsl(0 72% 51%)" };
      case "modified":
        return { backgroundColor: "hsl(48 96% 53% / 0.2)", borderLeft: "3px solid hsl(48 96% 53%)" };
      case "empty":
        return { backgroundColor: "var(--muted)", borderLeft: "3px solid transparent" };
      default:
        return { backgroundColor: "var(--background)", borderLeft: "3px solid transparent" };
    }
  };

  // Render inline diff parts for side-by-side view
  const renderInlineParts = (parts: InlineDiffPart[] | undefined, fallbackText: string) => {
    if (!parts || parts.length === 0) return fallbackText || "(пусто)";
    return parts.map((part, i) => (
      <span
        key={i}
        style={{
          backgroundColor: part.type === "added" ? "hsl(142 76% 50% / 0.4)" : part.type === "removed" ? "hsl(0 84% 60% / 0.4)" : "transparent",
          color: part.type === "added" ? "hsl(142 76% 25%)" : part.type === "removed" ? "hsl(0 84% 30%)" : "inherit",
          textDecoration: part.type === "removed" ? "line-through" : "none",
          padding: part.type !== "unchanged" ? "1px 3px" : "0",
          borderRadius: "2px",
          fontWeight: part.type !== "unchanged" ? 500 : "inherit",
        }}
      >
        {part.text}
      </span>
    ));
  };

  return (
    <div style={{
      backgroundColor: "var(--card)",
      borderRadius: "8px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
    }}>
      <DiffHeader 
        title="Сравнение версий"
        subtitle={`${leftLabel} → ${rightLabel}`}
        stats={stats}
        onClose={onClose}
      />
      
      {/* Column headers */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{
          flex: 1,
          padding: "8px 12px",
          backgroundColor: "hsl(0 72% 51% / 0.1)",
          color: "hsl(0 72% 51%)",
          fontWeight: 500,
          fontSize: "12px",
          borderRight: "1px solid var(--border)",
        }}>
          {leftLabel}
        </div>
        <div style={{
          flex: 1,
          padding: "8px 12px",
          backgroundColor: "hsl(142 76% 36% / 0.1)",
          color: "hsl(142 76% 36%)",
          fontWeight: 500,
          fontSize: "12px",
        }}>
          {rightLabel}
        </div>
      </div>
      
      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ fontFamily: "monospace", fontSize: "13px", lineHeight: "1.5" }}>
          {lines.length === 0 ? (
            <p style={{ color: "#666", textAlign: "center", padding: "40px" }}>Нет данных для сравнения</p>
          ) : (
            lines.map((line, i) => (
              <div key={i} style={{ display: "flex", borderBottom: "1px solid hsl(240 6% 90% / 0.5)" }}>
                {/* Left side */}
                <div
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    borderRight: "1px solid var(--border)",
                    minHeight: "24px",
                    ...getLineStyle(line.left?.type || "empty"),
                  }}
                >
                  {line.left?.type !== "empty" && (
                    <>
                      <span style={{ color: "var(--muted-foreground)", marginRight: "8px", display: "inline-block", width: "14px" }}>
                        {line.left?.type === "removed" ? "−" : line.left?.type === "modified" ? "~" : ""}
                      </span>
                      {line.left?.type === "modified" && line.left?.inlineDiff
                        ? renderInlineParts(line.left.inlineDiff, line.left.text)
                        : (line.left?.text || "(пусто)")}
                    </>
                  )}
                </div>
                
                {/* Right side */}
                <div
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    minHeight: "24px",
                    ...getLineStyle(line.right?.type || "empty"),
                  }}
                >
                  {line.right?.type !== "empty" && (
                    <>
                      <span style={{ color: "var(--muted-foreground)", marginRight: "8px", display: "inline-block", width: "14px" }}>
                        {line.right?.type === "added" ? "+" : line.right?.type === "modified" ? "~" : ""}
                      </span>
                      {line.right?.type === "modified" && line.right?.inlineDiff
                        ? renderInlineParts(line.right.inlineDiff, line.right.text)
                        : (line.right?.text || "(пусто)")}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

// ============ Unified Diff (renders Slate structure with diff marks) ============

// Extract text from a Slate node
function extractTextFromNode(node: any): string {
  if (Text.isText(node)) return node.text;
  if (node.children) return node.children.map(extractTextFromNode).join("");
  return "";
}

// Create node signature for comparison
function nodeSignature(node: any): string {
  const type = node.type || "text";
  const text = extractTextFromNode(node);
  return `${type}:${text}`;
}

// Deep clone
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Mark all nodes with diffType
function markTree(node: any, diffType: "added" | "removed"): any {
  const result = deepClone(node);
  function mark(n: any) {
    n.diffType = diffType;
    if (n.children) n.children.forEach(mark);
  }
  mark(result);
  return result;
}

// Word-level diff for text
function diffTextNodes(oldText: string, newText: string): any[] {
  if (oldText === newText) return [{ text: oldText }];

  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const lcs = longestCommonSubsequence(oldWords, newWords);

  const ops: Array<{ type: "keep" | "add" | "remove"; word: string }> = [];
  let i = oldWords.length, j = newWords.length, k = lcs.length;

  // Build operations in reverse
  while (i > 0 || j > 0) {
    if (k > 0 && i > 0 && j > 0 && oldWords[i-1] === lcs[k-1] && newWords[j-1] === lcs[k-1]) {
      ops.unshift({ type: "keep", word: oldWords[i-1] });
      i--; j--; k--;
    } else if (j > 0 && (k === 0 || i === 0 || newWords[j-1] !== lcs[k-1])) {
      ops.unshift({ type: "add", word: newWords[j-1] });
      j--;
    } else if (i > 0) {
      ops.unshift({ type: "remove", word: oldWords[i-1] });
      i--;
    }
  }

  // Merge consecutive same-type
  const result: any[] = [];
  let current: { type: string; text: string } | null = null;

  for (const op of ops) {
    const diffType = op.type === "add" ? "added" : op.type === "remove" ? "removed" : null;
    const currentType = diffType || "keep";

    if (current && current.type === currentType) {
      current.text += op.word;
    } else {
      if (current) {
        result.push(current.type === "keep"
          ? { text: current.text }
          : { text: current.text, diffType: current.type });
      }
      current = { type: currentType, text: op.word };
    }
  }
  if (current) {
    result.push(current.type === "keep"
      ? { text: current.text }
      : { text: current.text, diffType: current.type });
  }

  return result;
}

// Count diff nodes in tree
function countDiffNodes(node: any): { added: number; removed: number } {
  let added = 0, removed = 0;

  if (node.diffType === "added") added++;
  else if (node.diffType === "removed") removed++;

  if (node.children) {
    for (const child of node.children) {
      const childCounts = countDiffNodes(child);
      added += childCounts.added;
      removed += childCounts.removed;
    }
  }
  return { added, removed };
}

// Check if node is a container (table, row) that needs recursive diff
function isContainerNode(node: any): boolean {
  return node.type === "table" || node.type === "table-row";
}

// Merge two nodes with inline diff (recursive for containers)
function mergeNodes(oldNode: any, newNode: any): { node: any | any[]; stats: { added: number; removed: number } } {
  if (nodeSignature(oldNode) === nodeSignature(newNode)) {
    return { node: deepClone(newNode), stats: { added: 0, removed: 0 } };
  }
  if (oldNode.type !== newNode.type) {
    return {
      node: [markTree(oldNode, "removed"), markTree(newNode, "added")],
      stats: { added: 1, removed: 1 }
    };
  }

  // For container nodes (table, table-row), recursively merge children
  if (isContainerNode(oldNode) && oldNode.children && newNode.children) {
    const result = { ...newNode, children: [] as any[] };
    let totalStats = { added: 0, removed: 0 };

    const { nodes: mergedChildren, stats: childStats } = mergeContentRecursive(oldNode.children, newNode.children);
    result.children = mergedChildren;
    totalStats.added += childStats.added;
    totalStats.removed += childStats.removed;

    return { node: result, stats: totalStats };
  }

  // For leaf blocks (paragraph, cell, etc), do text diff
  const result = deepClone(newNode);
  let stats = { added: 0, removed: 0 };

  if (result.children && oldNode.children) {
    const oldText = extractTextFromNode(oldNode);
    const newText = extractTextFromNode(newNode);
    if (oldText !== newText) {
      result.children = diffTextNodes(oldText, newText);
      stats = countDiffNodes(result);
    }
  }
  return { node: result, stats };
}

// Merge content arrays (recursive)
function mergeContentRecursive(oldNodes: any[], newNodes: any[]): { nodes: any[]; stats: { added: number; removed: number } } {
  const result: any[] = [];
  let added = 0, removed = 0;

  const oldSigs = oldNodes.map(nodeSignature);
  const newSigs = newNodes.map(nodeSignature);

  // LCS for node matching
  const m = oldNodes.length, n = newNodes.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldSigs[i-1] === newSigs[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }

  // Backtrack
  type Op = { type: "keep" | "add" | "remove" | "modify"; oldIdx?: number; newIdx?: number };
  const ops: Op[] = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldSigs[i-1] === newSigs[j-1]) {
      ops.unshift({ type: "keep", oldIdx: i-1, newIdx: j-1 });
      i--; j--;
    } else if (i > 0 && j > 0 && (oldNodes[i-1] as any).type === (newNodes[j-1] as any).type) {
      ops.unshift({ type: "modify", oldIdx: i-1, newIdx: j-1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.unshift({ type: "add", newIdx: j-1 });
      j--;
    } else {
      ops.unshift({ type: "remove", oldIdx: i-1 });
      i--;
    }
  }

  // Build result
  for (const op of ops) {
    if (op.type === "keep") {
      result.push(deepClone(newNodes[op.newIdx!]));
    } else if (op.type === "add") {
      result.push(markTree(newNodes[op.newIdx!], "added"));
      added++;
    } else if (op.type === "remove") {
      result.push(markTree(oldNodes[op.oldIdx!], "removed"));
      removed++;
    } else if (op.type === "modify") {
      const { node: merged, stats: mergeStats } = mergeNodes(oldNodes[op.oldIdx!], newNodes[op.newIdx!]);
      if (Array.isArray(merged)) {
        result.push(...merged);
      } else {
        result.push(merged);
      }
      added += mergeStats.added;
      removed += mergeStats.removed;
    }
  }

  return { nodes: result, stats: { added, removed } };
}

// Count all changes in a tree of nodes
function countAllChanges(nodes: any[]): { added: number; removed: number } {
  let added = 0, removed = 0;
  for (const node of nodes) {
    const counts = countDiffNodes(node);
    added += counts.added;
    removed += counts.removed;
  }
  return { added, removed };
}

// Public wrapper
function mergeContent(oldNodes: Descendant[], newNodes: Descendant[]): { nodes: any[]; stats: { added: number; removed: number } } {
  const { nodes } = mergeContentRecursive(oldNodes, newNodes);
  // Recount all changes from the final tree for accuracy
  const stats = countAllChanges(nodes);
  return { nodes, stats };
}

// Render a Slate node as React elements
function renderSlateNode(node: any, key: number | string): React.ReactNode {
  // Text node
  if (node.text !== undefined) {
    const style: React.CSSProperties = {};
    if (node.bold) style.fontWeight = "bold";
    if (node.italic) style.fontStyle = "italic";
    if (node.underline) style.textDecoration = "underline";

    // Diff styling
    if (node.diffType === "added") {
      style.backgroundColor = "rgba(34, 197, 94, 0.2)";
      style.borderBottom = "2px solid rgb(34, 197, 94)";
      style.padding = "0 2px";
      style.borderRadius = "2px";
    } else if (node.diffType === "removed") {
      style.backgroundColor = "rgba(239, 68, 68, 0.2)";
      style.textDecoration = "line-through";
      style.color = "rgb(185, 28, 28)";
      style.padding = "0 2px";
      style.borderRadius = "2px";
    }

    return <span key={key} style={style}>{node.text}</span>;
  }

  // Element node
  const children = (node.children || []).map((child: any, i: number) => renderSlateNode(child, i));

  // Block diff styling
  const blockStyle: React.CSSProperties = {};
  if (node.diffType === "added") {
    blockStyle.backgroundColor = "rgba(34, 197, 94, 0.1)";
    blockStyle.borderLeft = "3px solid rgb(34, 197, 94)";
    blockStyle.paddingLeft = "8px";
    blockStyle.marginLeft = "-11px";
  } else if (node.diffType === "removed") {
    blockStyle.backgroundColor = "rgba(239, 68, 68, 0.1)";
    blockStyle.borderLeft = "3px solid rgb(239, 68, 68)";
    blockStyle.paddingLeft = "8px";
    blockStyle.marginLeft = "-11px";
  }

  // Table diff styling (without margin/padding that would break layout)
  const tableDiffStyle: React.CSSProperties = {};
  if (node.diffType === "added") {
    tableDiffStyle.backgroundColor = "rgba(34, 197, 94, 0.1)";
  } else if (node.diffType === "removed") {
    tableDiffStyle.backgroundColor = "rgba(239, 68, 68, 0.1)";
  }

  switch (node.type) {
    case "paragraph":
      return <p key={key} style={{ margin: "8px 0", ...blockStyle }}>{children}</p>;
    case "heading-one":
      return <h1 key={key} style={{ fontSize: "1.5em", fontWeight: "bold", margin: "16px 0", ...blockStyle }}>{children}</h1>;
    case "heading-two":
      return <h2 key={key} style={{ fontSize: "1.25em", fontWeight: "bold", margin: "12px 0", ...blockStyle }}>{children}</h2>;
    case "heading-three":
      return <h3 key={key} style={{ fontSize: "1.1em", fontWeight: "600", margin: "8px 0", ...blockStyle }}>{children}</h3>;
    case "bulleted-list":
      return <ul key={key} style={{ listStyle: "disc", paddingLeft: "24px", margin: "8px 0", ...blockStyle }}>{children}</ul>;
    case "numbered-list":
      return <ol key={key} style={{ listStyle: "decimal", paddingLeft: "24px", margin: "8px 0", ...blockStyle }}>{children}</ol>;
    case "list-item":
      return <li key={key} style={{ margin: "4px 0", ...blockStyle }}>{children}</li>;
    case "blockquote":
      return <blockquote key={key} style={{ borderLeft: "4px solid #ccc", paddingLeft: "16px", margin: "8px 0", fontStyle: "italic", ...blockStyle }}>{children}</blockquote>;
    case "table":
      return (
        <table key={key} style={{ width: "100%", borderCollapse: "collapse", margin: "16px 0", fontSize: "14px", border: node.diffType ? `2px solid ${node.diffType === "added" ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}` : undefined }}>
          <tbody>{children}</tbody>
        </table>
      );
    case "table-row":
      return <tr key={key} style={{ ...tableDiffStyle }}>{children}</tr>;
    case "table-cell":
      return (
        <td key={key} style={{
          border: "1px solid #ddd",
          padding: "8px 12px",
          ...tableDiffStyle,
          borderColor: node.diffType === "added" ? "rgb(34, 197, 94)" : node.diffType === "removed" ? "rgb(239, 68, 68)" : "#ddd"
        }}>
          {children}
        </td>
      );
    default:
      return <div key={key} style={blockStyle}>{children}</div>;
  }
}

// Unified Diff component (renders Slate structure with diff marks)
export const UnifiedDiff = memo(function UnifiedDiff({
  leftVersion,
  rightVersion,
  currentContent,
  onClose,
}: DiffViewProps) {
  const { mergedNodes, stats } = useMemo(() => {
    const leftContent = leftVersion?.content || [];
    const rightContent = rightVersion?.content || currentContent;
    const { nodes, stats } = mergeContent(leftContent, rightContent);
    return { mergedNodes: nodes, stats };
  }, [leftVersion, rightVersion, currentContent]);

  const leftLabel = leftVersion
    ? `${new Date(leftVersion.timestamp).toLocaleTimeString()} - ${leftVersion.description}`
    : "Пусто";

  const rightLabel = rightVersion
    ? `${new Date(rightVersion.timestamp).toLocaleTimeString()} - ${rightVersion.description}`
    : "Текущий документ";

  return (
    <div style={{
      backgroundColor: "var(--card)",
      borderRadius: "8px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
    }}>
      <DiffHeader
        title="Сравнение версий"
        subtitle={`${leftLabel} → ${rightLabel}`}
        stats={stats}
        onClose={onClose}
      />

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          {mergedNodes.length === 0 ? (
            <p style={{ color: "var(--muted-foreground)", textAlign: "center", padding: "40px" }}>
              Нет данных для сравнения
            </p>
          ) : (
            mergedNodes.map((node, i) => renderSlateNode(node, i))
          )}
        </div>
      </div>
    </div>
  );
});

export default SideBySideDiff;
