import React, { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createEditor, type Descendant } from "slate";
import { Slate, withReact, ReactEditor } from "slate-react";
import { BubbleMenu } from "./BubbleMenu";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { SlateEditor, type SlateEditorRef } from "./SlateEditor";
import { VirtualizedReadOnlyDocument } from "./VirtualizedReadOnlyDocument";
import { DocxEditor } from "./DocxEditor";
import { VariablePopover } from "./VariablePopover";
import { I18nProvider } from "../i18n";

// jsdom has no viewport layout; exercise the real virtual list at a measured size.
vi.mock("react-virtualized-auto-sizer", () => ({
  default: ({ children }: { children: (size: { height: number; width: number }) => React.ReactNode }) =>
    children({ height: 600, width: 800 }),
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
  document.querySelectorAll("[data-test-selection]").forEach(node => node.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setDomSelection() {
  const anchor = document.createElement("span");
  anchor.dataset.testSelection = "true";
  anchor.textContent = "/";
  document.body.appendChild(anchor);
  const range = document.createRange();
  range.selectNodeContents(anchor);
  window.getSelection()?.addRange(range);
  range.getBoundingClientRect = () => new DOMRect(20, 20, 40, 20);
}

describe("library editor contracts", () => {
  it.each([
    ["Bullet List", "bullet"], ["Numbered List", "numbered"],
  ] as const)("BubbleMenu applies %s using the editor's list model", async (title, listType) => {
    setDomSelection();
    vi.spyOn(ReactEditor, "isFocused").mockReturnValue(true);
    vi.spyOn(ReactEditor, "toDOMNode").mockReturnValue(document.body);
    const editor = withReact(createEditor());
    editor.selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 3 } };
    render(<Slate editor={editor} initialValue={[{ type: "paragraph", children: [{ text: "abc" }] }]}>
      <BubbleMenu />
    </Slate>);

    await act(async () => { fireEvent.click(screen.getByTitle(title)); });

    expect(editor.children).toEqual([{
      type: "list-item", listType, level: 0, children: [{ text: "abc" }],
    }]);
  });

  it.each([
    ["Маркированный список", "bullet"], ["Нумерованный список", "numbered"],
  ] as const)("slash command %s inserts a flat list item", async (label, listType) => {
    setDomSelection();
    const editor = withReact(createEditor());
    editor.selection = { anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 1 } };
    render(<Slate editor={editor} initialValue={[{ type: "paragraph", children: [{ text: "/" }] }]}>
      <SlashCommandMenu />
    </Slate>);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: new RegExp(label) })); });

    expect(editor.children).toContainEqual({
      type: "list-item", listType, level: 0, children: [{ text: "" }],
    });
  });

  it("slash table command inserts editable paragraphs inside cells", async () => {
    setDomSelection();
    const editor = withReact(createEditor());
    editor.selection = { anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 1 } };
    render(<Slate editor={editor} initialValue={[{ type: "paragraph", children: [{ text: "/" }] }]}>
      <SlashCommandMenu />
    </Slate>);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Таблица/ })); });

    const table = editor.children.find(node => "type" in node && node.type === "table");
    expect(table).toEqual({
      type: "table", children: Array.from({ length: 3 }, () => ({
        type: "table-row", children: Array.from({ length: 3 }, () => ({
          type: "table-cell", children: [{ type: "paragraph", children: [{ text: "" }] }],
        })),
      })),
    });
  });

  it("acceptAllChanges returns the editor to normal mode", async () => {
    const ref = createRef<SlateEditorRef>();
    const onModeChange = vi.fn();
    render(<SlateEditor ref={ref} document={null} mode="redline" onModeChange={onModeChange}
      initialContent={[{ type: "paragraph", children: [{ text: "text" }] }]} />);

    await act(async () => { ref.current?.acceptAllChanges(); });

    expect(onModeChange).toHaveBeenCalledWith("normal");
  });

  it("scrollToVariable works when the parsed DOCX document is null", () => {
    const ref = createRef<SlateEditorRef>();
    const { container } = render(<SlateEditor ref={ref} document={null} mode="jinja"
      initialContent={[{ type: "paragraph", children: [{ text: "{{ company }}" }] }]} />);
    const variable = container.querySelector<HTMLElement>(".template-variable");
    expect(variable).not.toBeNull();
    if (!variable) throw new Error("template variable was not rendered");
    variable.scrollIntoView = vi.fn();

    expect(ref.current?.scrollToVariable("company")).toBe(true);

    expect(variable.classList.contains("variable-highlight")).toBe(true);
  });

  it("renders large comparison documents through react-window v2", () => {
    const content: Descendant[] = Array.from({ length: 60 }, (_, index) => ({
      type: "paragraph", children: [{ text: `Paragraph ${index}` }],
    }));
    render(<VirtualizedReadOnlyDocument content={content} pageConfig={null} label="Version" labelColor="blue" />);

    expect(screen.getByText("Paragraph 0")).toBeTruthy();
  });

  it("passes variable metadata from DocxEditor to the variable popover", () => {
    const { container } = render(<DocxEditor showFileUpload={false} mode="jinja"
      initialContent={[{ type: "paragraph", children: [{ text: "{{ company }}" }] }]}
      variableMetadata={{ company: { description: "Company legal name" } }} />);
    const variable = container.querySelector<HTMLElement>(".template-variable");
    if (!variable) throw new Error("template variable was not rendered");

    fireEvent.click(variable);

    expect(screen.getByText("Company legal name")).toBeTruthy();
  });

  it("uses the English locale for variable popovers", () => {
    render(<I18nProvider locale="en"><VariablePopover
      variable={{ key: "company", label: "Company", type: "text", position: { x: 20, y: 20 } }}
      onClose={() => {}} /></I18nProvider>);

    expect(screen.getByText("Template variable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.getByText("Text")).toBeTruthy();
  });
});
