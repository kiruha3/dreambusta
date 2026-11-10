import React from "react";
import { DocxEditor } from "./components/DocxEditor";
import "./App.css";

function App() {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <DocxEditor
        showFileUpload={true}
        style={{ flex: 1 }}
      />
    </div>
  );
}

export default App;
