import React, { useMemo, memo, useCallback, useRef } from "react";
import { List, type ListImperativeAPI, type RowComponentProps } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { Descendant } from "slate";
import type { PageConfig } from "../layout/types";
import type { CustomElement, CustomText } from "../slate/types";

interface VirtualizedReadOnlyDocumentProps {
  content: Descendant[];
  pageConfig: PageConfig | null;
  label: string;
  labelColor: string;
}

// Estimate height for different element types
function estimateElementHeight(element: CustomElement): number {
  switch (element.type) {
    case "paragraph":
      // Estimate based on text length and font size
      const textLength = getTextLength(element);
      const lineHeight = 24; // Approximate line height
      const charsPerLine = 80; // Approximate chars per line
      const lines = Math.max(1, Math.ceil(textLength / charsPerLine));
      const spacing = (element.spacing?.before || 0) + (element.spacing?.after || 0);
      return lines * lineHeight + spacing + 8;
    case "heading-one":
      return 60;
    case "heading-two":
      return 50;
    case "heading-three":
      return 40;
    case "table":
      // Estimate based on rows
      const rows = element.children?.length || 1;
      return rows * 40 + 24; // 40px per row + padding
    case "image":
      return (element.height || 200) + 16;
    case "bulleted-list":
    case "numbered-list":
      const items = element.children?.length || 1;
      return items * 28;
    case "block-quote":
      return 60;
    case "code-block":
      const codeLines = getTextLength(element) / 60;
      return Math.max(80, codeLines * 20);
    case "divider":
      return 48;
    default:
      return 32;
  }
}

// Get total text length in element
function getTextLength(element: any): number {
  if (!element) return 0;
  if (typeof element.text === "string") return element.text.length;
  if (element.children) {
    return element.children.reduce((sum: number, child: any) => sum + getTextLength(child), 0);
  }
  return 0;
}

// Simple text renderer for read-only display
function renderText(text: CustomText): React.ReactNode {
  const style: React.CSSProperties = {};
  
  if (text.fontFamily) style.fontFamily = text.fontFamily;
  if (text.fontSize) style.fontSize = `${text.fontSize}px`;
  if (text.color) style.color = text.color;
  if (text.backgroundColor) style.backgroundColor = text.backgroundColor;
  
  let content: React.ReactNode = text.text;
  
  if (text.bold) content = <strong>{content}</strong>;
  if (text.italic) content = <em>{content}</em>;
  if (text.underline) content = <u>{content}</u>;
  if (text.strikethrough) content = <s>{content}</s>;
  
  return <span style={style}>{content}</span>;
}

// Render children (text nodes)
function renderChildren(children: (CustomElement | CustomText)[]): React.ReactNode {
  return children.map((child, i) => {
    if ("text" in child) {
      return <React.Fragment key={i}>{renderText(child)}</React.Fragment>;
    }
    return <React.Fragment key={i}>{renderElementSimple(child)}</React.Fragment>;
  });
}

// Simple element renderer (no Slate)
function renderElementSimple(element: CustomElement): React.ReactNode {
  const children = element.children ? renderChildren(element.children) : null;
  
  switch (element.type) {
    case "paragraph": {
      const style: React.CSSProperties = {
        textAlign: element.align || "left",
        marginTop: element.spacing?.before ? `${element.spacing.before}px` : undefined,
        marginBottom: element.spacing?.after ? `${element.spacing.after}px` : "8px",
        paddingLeft: element.indentLeft ? `${element.indentLeft}px` : undefined,
        paddingRight: element.indentRight ? `${element.indentRight}px` : undefined,
        textIndent: element.indentFirstLine ? `${element.indentFirstLine}px` : undefined,
      };
      return <p style={style}>{children}</p>;
    }
    case "heading-one":
      return <h1 style={{ fontSize: "2em", fontWeight: "bold", marginBottom: "0.67em" }}>{children}</h1>;
    case "heading-two":
      return <h2 style={{ fontSize: "1.5em", fontWeight: "bold", marginBottom: "0.83em" }}>{children}</h2>;
    case "heading-three":
      return <h3 style={{ fontSize: "1.17em", fontWeight: "bold", marginBottom: "1em" }}>{children}</h3>;
    case "bulleted-list":
      return <ul style={{ paddingLeft: "24px", listStyleType: "disc" }}>{children}</ul>;
    case "numbered-list":
      return <ol style={{ paddingLeft: "24px", listStyleType: "decimal" }}>{children}</ol>;
    case "list-item":
      return <li>{children}</li>;
    case "block-quote":
      return (
        <blockquote style={{ borderLeft: "3px solid var(--border)", paddingLeft: "16px", fontStyle: "italic", color: "var(--muted-foreground)" }}>
          {children}
        </blockquote>
      );
    case "code-block":
      return (
        <pre style={{ backgroundColor: "var(--muted)", padding: "16px", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.9em" }}>
          <code>{children}</code>
        </pre>
      );
    case "divider":
      return <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "24px 0" }} />;
    case "table":
      return (
        <div style={{ overflowX: "auto", maxWidth: "100%", marginBottom: "12px" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", backgroundColor: "var(--card)" }}>
            <tbody>{children}</tbody>
          </table>
        </div>
      );
    case "table-row":
      return <tr>{children}</tr>;
    case "table-cell":
      return (
        <td style={{ border: "1px solid var(--border)", padding: "8px", verticalAlign: "top" }}>
          {children}
        </td>
      );
    case "image":
      return (
        <div style={{ display: "flex", justifyContent: element.align === "center" ? "center" : element.align === "right" ? "flex-end" : "flex-start", margin: "8px 0" }}>
          <img src={element.src} alt={element.alt || "Image"} width={element.width} height={element.height} style={{ maxWidth: "100%" }} />
        </div>
      );
    default:
      return <div>{children}</div>;
  }
}

// Row component for virtualized list
function Row({ index, style, elements, ariaAttributes }: RowComponentProps<{
  elements: CustomElement[];
}>) {
  const element = elements[index];
  
  return (
    <div {...ariaAttributes} style={{ ...style, paddingLeft: "40px", paddingRight: "40px" }}>
      {renderElementSimple(element)}
    </div>
  );
}

export const VirtualizedReadOnlyDocument = memo(function VirtualizedReadOnlyDocument({ 
  content, 
  pageConfig,
  label,
  labelColor,
}: VirtualizedReadOnlyDocumentProps) {
  const listRef = useRef<ListImperativeAPI>(null);
  
  // Filter to only block-level elements
  const elements = useMemo(() => {
    return content.filter((node): node is CustomElement => "type" in node);
  }, [content]);
  
  // Create height cache
  const heightCache = useMemo(() => {
    const cache = new Map<number, number>();
    elements.forEach((el, i) => {
      cache.set(i, estimateElementHeight(el));
    });
    return cache;
  }, [elements]);
  
  const getItemSize = useCallback((index: number) => {
    return heightCache.get(index) || 32;
  }, [heightCache]);

  const pageStyle = useMemo(() => ({
    maxWidth: pageConfig ? `${pageConfig.width}px` : "800px",
    backgroundColor: "var(--background)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    margin: "0 auto",
  }), [pageConfig]);

  const itemData = useMemo(() => ({
    elements,
    pageStyle,
  }), [elements, pageStyle]);

  // For small documents, use simple rendering
  if (elements.length < 50) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{
          padding: "8px 16px",
          backgroundColor: labelColor,
          color: "white",
          fontWeight: 500,
          fontSize: "14px",
          textAlign: "center",
          flexShrink: 0,
        }}>
          {label}
        </div>
        
        <div style={{ 
          flex: 1, 
          overflow: "auto", 
          padding: "20px",
          backgroundColor: "var(--muted)",
        }}>
          <div style={{ ...pageStyle, padding: "40px", minHeight: "400px" }}>
            {elements.map((element, i) => (
              <React.Fragment key={i}>
                {renderElementSimple(element)}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // For large documents, use virtualization
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{
        padding: "8px 16px",
        backgroundColor: labelColor,
        color: "white",
        fontWeight: 500,
        fontSize: "14px",
        textAlign: "center",
        flexShrink: 0,
      }}>
        {label}
      </div>
      
      <div style={{ 
        flex: 1, 
        backgroundColor: "var(--muted)",
        padding: "20px",
      }}>
        <div style={{ ...pageStyle, height: "100%" }}>
          <AutoSizer>
            {({ height, width }) => (
              <List
                listRef={listRef}
                style={{ height, width }}
                defaultHeight={height}
                rowCount={elements.length}
                rowHeight={getItemSize}
                rowProps={itemData}
                rowComponent={Row}
                overscanCount={5}
              />
            )}
          </AutoSizer>
        </div>
      </div>
    </div>
  );
});

export default VirtualizedReadOnlyDocument;
