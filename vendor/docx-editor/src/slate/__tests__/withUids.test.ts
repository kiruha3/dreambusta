/**
 * withUids: normalizeNode должен присваивать uid всем block-уровневым нодам.
 *
 * Регресс: в blockTypes значился "blockquote", а фактический тип элемента —
 * "block-quote" (types.ts) → цитаты, созданные в редакторе, оставались без
 * uid, и uid-зависимые механизмы (diff-подсветка, track changes targeting)
 * для них молча не работали.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createEditor, Editor, type Descendant } from "slate";
import { withUids, resetUidManager } from "../withUids";

function normalizeAll(initial: Descendant[]): Editor {
  const editor = withUids(createEditor());
  editor.children = initial;
  Editor.normalize(editor, { force: true });
  return editor;
}

type WithUid = { uid?: string; type?: string };

describe("withUids — normalizeNode", () => {
  beforeEach(() => {
    resetUidManager();
  });

  it("присваивает uid элементу block-quote", () => {
    const editor = normalizeAll([
      { type: "block-quote", children: [{ text: "цитата" }] } as Descendant,
    ]);
    const node = editor.children[0] as WithUid;
    expect(node.type).toBe("block-quote");
    expect(node.uid).toBeTruthy();
  });

  it("присваивает uid paragraph и image (smoke на список blockTypes)", () => {
    const editor = normalizeAll([
      { type: "paragraph", children: [{ text: "абзац" }] } as Descendant,
      {
        type: "image",
        src: "/a.png",
        width: 10,
        height: 10,
        children: [{ text: "" }],
      } as Descendant,
    ]);
    for (const node of editor.children as WithUid[]) {
      expect(node.uid).toBeTruthy();
    }
  });

  it("не перезаписывает существующий uid", () => {
    const editor = normalizeAll([
      {
        type: "block-quote",
        uid: "keep-me",
        children: [{ text: "цитата" }],
      } as Descendant,
    ]);
    expect((editor.children[0] as WithUid).uid).toBe("keep-me");
  });

  it("выдаёт уникальные uid разным нодам", () => {
    const editor = normalizeAll([
      { type: "paragraph", children: [{ text: "один" }] } as Descendant,
      { type: "block-quote", children: [{ text: "два" }] } as Descendant,
      { type: "paragraph", children: [{ text: "три" }] } as Descendant,
    ]);
    const uids = (editor.children as WithUid[]).map((n) => n.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });
});
