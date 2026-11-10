import React, { useMemo, memo } from "react";
import { createEditor, Descendant } from "slate";
import { Slate, Editable, withReact } from "slate-react";
import { renderElement } from "../slate/elements";
import { renderLeaf } from "../slate/leaves";
import type { PageConfig } from "../layout/types";

interface ReadOnlyDocumentProps {
  content: Descendant[];
  pageConfig: PageConfig | null;
  label: string;
  labelColor: string;
}

export const ReadOnlyDocument = memo(function ReadOnlyDocument({ 
  content, 
  pageConfig,
  label,
  labelColor,
}: ReadOnlyDocumentProps) {
  // Create a fresh read-only editor for this view
  const editor = useMemo(() => withReact(createEditor()), []);
  
  // Update editor content when it changes
  useMemo(() => {
    editor.children = content.length > 0 ? content : [{ type: "paragraph", children: [{ text: "" }] }];
  }, [editor, content]);

  const pageStyle = useMemo(() => ({
    maxWidth: pageConfig ? `${pageConfig.width}px` : "800px",
    minHeight: "400px",
    backgroundColor: "white",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    padding: pageConfig 
      ? `${pageConfig.margins.top}px ${pageConfig.margins.right}px ${pageConfig.margins.bottom}px ${pageConfig.margins.left}px`
      : "40px",
    boxSizing: "border-box" as const,
    margin: "0 auto",
  }), [pageConfig]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Label */}
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
      
      {/* Document */}
      <div style={{ 
        flex: 1, 
        overflow: "auto", 
        padding: "20px",
        backgroundColor: "#e5e7eb",
      }}>
        <Slate editor={editor} initialValue={content}>
          <div style={pageStyle}>
            <Editable
              renderElement={renderElement}
              renderLeaf={renderLeaf}
              readOnly
              style={{
                minHeight: "200px",
                outline: "none",
                width: "100%",
              }}
            />
          </div>
        </Slate>
      </div>
    </div>
  );
});

export default ReadOnlyDocument;

