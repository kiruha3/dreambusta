import React from "react";
import ReactDOM from "react-dom/client";
import { DocxEditor } from "./components/DocxEditor";
import "./App.css";

// Message types for iframe communication
interface EmbedMessage {
  type: 
    | "docx:load" 
    | "docx:setContent" 
    | "docx:getContent" 
    | "docx:save"
    | "docx:contentChanged"
    | "docx:saved"
    | "docx:ready"
    | "docx:error";
  payload?: any;
}

// Get config from URL params
const params = new URLSearchParams(window.location.search);
const showUpload = params.get("showUpload") !== "false";
const readOnly = params.get("readOnly") === "true";

// Communicate with parent window
function postToParent(message: EmbedMessage) {
  if (window.parent !== window) {
    window.parent.postMessage(message, "*");
  }
}

// Handle content changes
function handleContentChange(content: any) {
  postToParent({ type: "docx:contentChanged", payload: content });
}

// Handle save
function handleSave(content: any, comment?: string) {
  postToParent({ type: "docx:saved", payload: { content, comment } });
}

// Main App for embed mode
function EmbedApp() {
  const [content, setContent] = React.useState<any>(null);
  const editorRef = React.useRef<any>(null);

  // Listen for messages from parent
  React.useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const message = event.data as EmbedMessage;
      if (!message || !message.type) return;

      switch (message.type) {
        case "docx:load":
          // Load from file URL or blob
          if (message.payload?.url) {
            fetch(message.payload.url)
              .then(res => res.blob())
              .then(blob => {
                const file = new File([blob], "document.docx", { type: blob.type });
                editorRef.current?.loadDocx(file);
              })
              .catch(err => {
                postToParent({ type: "docx:error", payload: err.message });
              });
          }
          break;
          
        case "docx:setContent":
          setContent(message.payload);
          break;
          
        case "docx:getContent":
          const currentContent = editorRef.current?.getContent();
          postToParent({ type: "docx:contentChanged", payload: currentContent });
          break;
          
        case "docx:save":
          handleSave(editorRef.current?.getContent(), message.payload?.comment);
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    
    // Notify parent that editor is ready
    postToParent({ type: "docx:ready" });
    
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <DocxEditor
        ref={editorRef}
        initialContent={content}
        showFileUpload={showUpload}
        readOnly={readOnly}
        onContentChange={handleContentChange}
        onSave={handleSave}
        style={{ flex: 1 }}
      />
    </div>
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<EmbedApp />);


