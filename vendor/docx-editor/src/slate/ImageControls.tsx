import React from "react";
import { Transforms } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import { useI18n } from "../i18n";
import type { ImageElement } from "./types";

/** Editing stays in Slate so undo, saving, and change tracking see each operation. */
export function ImageControls({ element }: { element: ImageElement }) {
  const editor = useSlateStatic();
  const { locale } = useI18n();
  const ru = locale === "ru";
  const path = () => ReactEditor.findPath(editor, element);
  const resize = (width: number) => {
    if (!Number.isFinite(width) || width < 20 || width > 4000) return;
    const height = Math.round(width * (element.height || 200) / (element.width || 300));
    Transforms.setNodes(editor, { width, height }, { at: path() });
  };
  return <div contentEditable={false} className="docx-image-controls" onMouseDown={event => event.stopPropagation()}
    style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: 8, background: "var(--background)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 6 }}>
    <label>{ru ? "Ширина" : "Width"} <input aria-label={ru ? "Ширина изображения" : "Image width"} type="number" min={20} max={4000} value={element.width || 300}
      style={{ width: 72, padding: 4, border: "1px solid var(--border)" }} onChange={event => resize(Number(event.target.value))} /></label>
    <label>{ru ? "Описание" : "Description"} <input aria-label={ru ? "Описание изображения" : "Image description"} value={element.alt || ""}
      style={{ width: 160, padding: 4, border: "1px solid var(--border)" }} onChange={event => Transforms.setNodes(editor, { alt: event.target.value }, { at: path() })} /></label>
    {(["left", "center", "right"] as const).map((align, index) => <button key={align} type="button"
      aria-label={(ru ? ["По левому краю", "По центру", "По правому краю"] : ["Align left", "Center", "Align right"])[index]}
      onMouseDown={event => { event.preventDefault(); Transforms.setNodes(editor, { align }, { at: path() }); }}>
      {(ru ? ["Слева", "Центр", "Справа"] : ["Left", "Center", "Right"])[index]}</button>)}
    <button type="button" onMouseDown={event => { event.preventDefault(); Transforms.removeNodes(editor, { at: path() }); }}>
      {ru ? "Удалить изображение" : "Delete image"}
    </button>
  </div>;
}
