import React, { createRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor, Node, Transforms, type Descendant } from "slate";
import { HistoryEditor } from "slate-history";
import { useSlate } from "slate-react";
import { SlateEditor, type SlateEditorRef } from "./SlateEditor";
import type { ParagraphElement } from "../slate/types";

let editor: Editor & HistoryEditor;

// A context probe gives tests access to the real Slate instance and plugins.
vi.mock("./EditorToolbar", () => ({
  EditorToolbar: () => {
    editor = useSlate() as Editor & HistoryEditor;
    return null;
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const paragraph = (text: string): ParagraphElement => ({ type: "paragraph", children: [{ text }] });
const newVersion: Descendant[] = [paragraph("New contract version")];
const oldVersion: Descendant[] = [{
  type: "table", children: Array.from({ length: 4 }, (_, index) => ({
    type: "table-row", children: [{ type: "table-cell", children: [paragraph(`Row ${index + 1}`)] }],
  })),
}];

async function flushSlate() {
  await act(async () => { await Promise.resolve(); });
}

describe("SlateEditor content replacement", () => {
  it("loads a smaller version after the caret was in a removed table row", async () => {
    const ref = createRef<SlateEditorRef>();
    const { rerender } = render(<SlateEditor ref={ref} document={null} initialContent={oldVersion} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => {
      Transforms.select(editor, { path: [0, 3, 0, 0, 0], offset: 2 });
    });

    expect(() => rerender(<SlateEditor ref={ref} document={null} initialContent={newVersion} />)).not.toThrow();
    await flushSlate();

    expect(screen.getByText("New contract version")).toBeTruthy();
    expect(editor.selection).toBeNull();
    expect(ref.current?.getSelectedText()).toBeNull();
  });

  it("starts a new undo history and discards marks from the previous version", async () => {
    const { rerender } = render(<SlateEditor document={null} initialContent={[paragraph("Old contract")]} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 0 });
      Editor.addMark(editor, "bold", true);
      editor.insertText("Edited ");
    });
    expect(editor.history.undos.length).toBeGreaterThan(0);

    rerender(<SlateEditor document={null} initialContent={newVersion} />);
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(editor.marks).toBeNull();
    expect(editor.history).toEqual({ undos: [], redos: [] });
    await act(async () => { editor.undo(); });
    expect(Node.string(editor)).toBe("New contract version");

    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 0 });
      editor.insertText("Current ");
    });
    expect(Node.string(editor)).toBe("Current New contract version");
    await act(async () => { editor.undo(); });
    expect(Node.string(editor)).toBe("New contract version");
  });

  it("cancels a pending content callback from the old version", async () => {
    const onContentChange = vi.fn();
    const { rerender } = render(<SlateEditor document={null} initialContent={[paragraph("Old contract")]} onContentChange={onContentChange} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 0 });
      editor.insertText("Edited ");
    });

    rerender(<SlateEditor document={null} initialContent={newVersion} onContentChange={onContentChange} />);
    await act(async () => { vi.advanceTimersByTime(500); });

    expect(onContentChange).not.toHaveBeenCalled();
  });
});
