import type React from "react";
import { Editor, Element, Transforms } from "slate";
import { ReactEditor } from "slate-react";

export const IMAGE_DRAG_TYPE = "application/x-dreamagent-image";

/** Move the existing Slate block so resizing, alt text, UID and undo are preserved. */
export function moveDroppedImage(editor: Editor & ReactEditor, event: React.DragEvent): boolean {
  const uid = event.dataTransfer.getData(IMAGE_DRAG_TYPE);
  if (!uid) return false;
  event.preventDefault();
  event.stopPropagation();
  const entry = [...Editor.nodes(editor, { at: [], match: node => Element.isElement(node) && node.type === "image" && node.uid === uid })][0];
  if (!entry) return true;
  const range = ReactEditor.findEventRange(editor, event);
  const target = range.anchor.path[0];
  if (target === undefined) return true;
  Transforms.moveNodes(editor, { at: entry[1], to: [target] });
  ReactEditor.focus(editor);
  return true;
}
