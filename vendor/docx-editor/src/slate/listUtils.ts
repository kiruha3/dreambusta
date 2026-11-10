import { Editor, Transforms, Element as SlateElement, Path, Node } from "slate";
import type { ListItemElement, ParagraphElement, CustomElement } from "./types";

/**
 * Check if currently in a list
 */
export function isInList(editor: Editor): boolean {
  const [match] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === "list-item",
  });
  return !!match;
}

/**
 * Get current list type
 */
export function getCurrentListType(
  editor: Editor
): "bullet" | "numbered" | null {
  const [match] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === "list-item",
  });
  if (match) {
    const [node] = match;
    return (node as ListItemElement).listType;
  }
  return null;
}

/**
 * Toggle list (bullet or numbered)
 */
export function toggleList(
  editor: Editor,
  listType: "bullet" | "numbered"
): void {
  const isActive = getCurrentListType(editor) === listType;

  if (isActive) {
    // Convert list item back to paragraph
    Transforms.setNodes(
      editor,
      { type: "paragraph" } as Partial<CustomElement>,
      {
        match: (n) => SlateElement.isElement(n) && n.type === "list-item",
      }
    );
  } else {
    // Convert paragraph to list item or change list type
    const isInListItem = isInList(editor);

    if (isInListItem) {
      // Just change the list type
      Transforms.setNodes(
        editor,
        { listType, level: 0 } as Partial<ListItemElement>,
        {
          match: (n) => SlateElement.isElement(n) && n.type === "list-item",
        }
      );
    } else {
      // Convert paragraph to list item
      Transforms.setNodes<any>(
        editor,
        {
          type: "list-item",
          listType,
          level: 0,
        },
        {
          match: (n) => SlateElement.isElement(n) && n.type === "paragraph",
        }
      );
    }
  }
}

/**
 * Increase list item indentation (Tab in list)
 */
export function indentListItem(editor: Editor): boolean {
  const [match] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === "list-item",
  });

  if (match) {
    const [node, path] = match;
    const listItem = node as ListItemElement;
    const newLevel = Math.min((listItem.level || 0) + 1, 5); // Max 5 levels

    Transforms.setNodes(editor, { level: newLevel } as Partial<ListItemElement>, {
      at: path,
    });
    return true;
  }
  return false;
}

/**
 * Decrease list item indentation (Shift+Tab in list)
 */
export function outdentListItem(editor: Editor): boolean {
  const [match] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === "list-item",
  });

  if (match) {
    const [node, path] = match;
    const listItem = node as ListItemElement;
    const currentLevel = listItem.level || 0;

    if (currentLevel > 0) {
      Transforms.setNodes(
        editor,
        { level: currentLevel - 1 } as Partial<ListItemElement>,
        { at: path }
      );
    } else {
      // At level 0, convert back to paragraph
      Transforms.setNodes(
        editor,
        { type: "paragraph" } as Partial<CustomElement>,
        { at: path }
      );
    }
    return true;
  }
  return false;
}

/**
 * Handle Enter key in list
 */
export function handleListEnter(editor: Editor): boolean {
  const [match] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === "list-item",
  });

  if (match) {
    const [node, path] = match;
    const listItem = node as ListItemElement;
    const text = Node.string(node);

    if (text === "") {
      // Empty list item - convert to paragraph
      Transforms.setNodes(
        editor,
        { type: "paragraph" } as Partial<CustomElement>,
        { at: path }
      );
      return true;
    } else {
      // Split list item - create new one with same type/level
      Transforms.splitNodes(editor, { always: true });
      Transforms.setNodes(
        editor,
        {
          type: "list-item",
          listType: listItem.listType,
          level: listItem.level,
        } as ListItemElement
      );
      return true;
    }
  }
  return false;
}

/**
 * Handle Backspace at start of list item
 */
export function handleListBackspace(editor: Editor): boolean {
  const { selection } = editor;
  if (!selection) return false;

  const [match] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === "list-item",
  });

  if (match) {
    const [node, path] = match;
    const start = Editor.start(editor, path);

    // Check if cursor is at the start of the list item
    if (
      selection.anchor.offset === 0 &&
      Path.equals(selection.anchor.path.slice(0, -1), path)
    ) {
      const listItem = node as ListItemElement;
      const level = listItem.level || 0;

      if (level > 0) {
        // Decrease indentation
        outdentListItem(editor);
        return true;
      } else {
        // Convert to paragraph
        Transforms.setNodes(
          editor,
          { type: "paragraph" } as Partial<CustomElement>,
          { at: path }
        );
        return true;
      }
    }
  }
  return false;
}
