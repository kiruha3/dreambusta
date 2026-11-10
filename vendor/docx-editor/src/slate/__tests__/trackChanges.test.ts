import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEditor, Node } from "slate";
import { withReact } from "slate-react";
import { withHistory } from "slate-history";
import { withTrackChanges, applyLLMSuggestion } from "../trackChanges";
import type { TrackChangesEditor } from "../trackChanges";
import type { CustomText } from "../types";

// Регрессия для bug #48: дублирование текста в редакторе правок.
// Проверяем идемпотентность apply, корректность reject и отсутствие
// дубля при сценарии apply → reject → apply.

function createTestEditor(): TrackChangesEditor {
  const editor = withTrackChanges(withReact(withHistory(createEditor())));
  editor.children = [
    { type: "paragraph", children: [{ text: "before foo after" }] },
  ] as any;
  return editor;
}

function getTextNodes(editor: TrackChangesEditor): CustomText[] {
  const nodes: CustomText[] = [];
  for (const [node] of Node.texts(editor)) {
    nodes.push(node as CustomText);
  }
  return nodes;
}

function serializeText(editor: TrackChangesEditor): string {
  return getTextNodes(editor)
    .map((n) => n.text)
    .join("");
}

describe("trackChanges — applyLLMSuggestion", () => {
  it.each(["before", "after"] as const)("inserts a paragraph %s the anchor block", (position) => {
    const editor = createTestEditor();

    const result = applyLLMSuggestion(editor, {
      id: `insert-${position}`, type: "text_addition", position, description: "Add paragraph",
      original_text: "foo", content: "Inserted paragraph",
    });

    expect(result.success).toBe(true);
    expect(editor.children.map(node => Node.string(node))).toEqual(position === "before"
      ? ["Inserted paragraph", "before foo after"]
      : ["before foo after", "Inserted paragraph"]);
  });

  it("rejects malformed external replacement nodes without editing the document", () => {
    const editor = createTestEditor();
    editor.children = [{ type: "paragraph", uid: "target", children: [{ text: "Original" }] }];
    const snapshot = structuredClone(editor.children);

    const result = applyLLMSuggestion(editor, {
      id: "invalid-node", type: "node_replacement", uid: "target", action: "insert_after", description: "Invalid node",
      new_node: { type: "paragraph", children: [{ invalid: "missing text" }] },
    });

    expect(result.success).toBe(false);
    expect(editor.children).toEqual(snapshot);
  });

  it("creates exactly one tracked change for text_replacement", () => {
    const editor = createTestEditor();
    const result = applyLLMSuggestion(editor, {
      id: "s1",
      type: "text_replacement",
      original_text: "foo",
      content: "bar",
    } as any);

    expect(result.success).toBe(true);
    expect(editor.getTrackedChanges()).toHaveLength(1);

    const nodes = getTextNodes(editor);
    const deleteNode = nodes.find(
      (n) => n.trackedChange?.changeType === "delete",
    );
    const insertNode = nodes.find(
      (n) => n.trackedChange?.changeType === "insert",
    );

    expect(deleteNode?.text).toBe("foo");
    expect(deleteNode?.trackedChange?.changeId).toBe("s1");
    expect(insertNode?.text).toBe("bar");
    expect(insertNode?.trackedChange?.changeId).toBe("s1");
  });

  it("is idempotent: re-apply with the same id is a no-op", () => {
    const editor = createTestEditor();
    const suggestion = {
      id: "s1",
      type: "text_replacement",
      original_text: "foo",
      content: "bar",
    } as any;

    applyLLMSuggestion(editor, suggestion);
    const snapshotAfterFirst = JSON.parse(JSON.stringify(editor.children));

    const result = applyLLMSuggestion(editor, suggestion);
    expect(result.success).toBe(true);
    expect(editor.getTrackedChanges()).toHaveLength(1);
    expect(editor.children).toEqual(snapshotAfterFirst);
  });
});

describe("trackChanges — rejectChangeById", () => {
  it("removes insert node and unsets delete node", () => {
    const editor = createTestEditor();
    applyLLMSuggestion(editor, {
      id: "s1",
      type: "text_replacement",
      original_text: "foo",
      content: "bar",
    } as any);

    const ok = editor.rejectChangeById("s1");

    expect(ok).toBe(true);
    expect(editor.hasChange("s1")).toBe(false);
    expect(serializeText(editor)).toBe("before foo after");
    expect(getTextNodes(editor).every((n) => !n.trackedChange)).toBe(true);
  });

  it("invokes onChangeRejected callback exactly once", () => {
    const editor = createTestEditor();
    const spy = vi.fn();
    editor.setOnChangeRejected(spy);

    applyLLMSuggestion(editor, {
      id: "s1",
      type: "text_replacement",
      original_text: "foo",
      content: "bar",
    } as any);
    editor.rejectChangeById("s1");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("s1");
  });

  it("returns false when changeId is unknown", () => {
    const editor = createTestEditor();
    expect(editor.rejectChangeById("unknown")).toBe(false);
  });
});

describe("trackChanges — bug #48 regression: re-apply after reject does not duplicate", () => {
  it("apply → reject → apply leaves exactly one tracked change", () => {
    const editor = createTestEditor();
    const suggestion = {
      id: "s1",
      type: "text_replacement",
      original_text: "foo",
      content: "bar",
    } as any;

    applyLLMSuggestion(editor, suggestion);
    expect(editor.getTrackedChanges()).toHaveLength(1);

    editor.rejectChangeById("s1");
    expect(editor.hasChange("s1")).toBe(false);
    expect(serializeText(editor)).toBe("before foo after");

    applyLLMSuggestion(editor, suggestion);
    expect(editor.getTrackedChanges()).toHaveLength(1);

    const nodes = getTextNodes(editor);
    const deletes = nodes.filter(
      (n) => n.trackedChange?.changeType === "delete",
    );
    const inserts = nodes.filter(
      (n) => n.trackedChange?.changeType === "insert",
    );

    expect(deletes).toHaveLength(1);
    expect(deletes[0].text).toBe("foo");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].text).toBe("bar");
  });

  it("does not duplicate when document has multiple occurrences of original_text and the first is already tracked", () => {
    // Симуляция корня бага: в документе есть два вхождения "foo", первый
    // имеет осиротевший trackedChange (был помечен предыдущим apply,
    // не очищен). Повторный apply с тем же id должен быть no-op,
    // не должен помечать второе вхождение.
    const editor = withTrackChanges(withReact(withHistory(createEditor())));
    editor.children = [
      {
        type: "paragraph",
        children: [
          {
            text: "foo",
            trackedChange: {
              changeId: "s1",
              changeType: "delete",
              timestamp: 1,
            },
          },
          { text: " and foo again" },
        ],
      },
    ] as any;

    const result = applyLLMSuggestion(editor, {
      id: "s1",
      type: "text_replacement",
      original_text: "foo",
      content: "bar",
    } as any);

    expect(result.success).toBe(true);
    // Только один changeId 's1' в документе, нет второго вхождения
    expect(editor.getTrackedChanges()).toHaveLength(1);
    const inserts = getTextNodes(editor).filter(
      (n) => n.trackedChange?.changeType === "insert",
    );
    expect(inserts).toHaveLength(0); // re-apply не должен ничего вставлять
  });
});

describe("trackChanges — acceptChangeById", () => {
  it("removes delete node and keeps insert as plain text", () => {
    const editor = createTestEditor();
    applyLLMSuggestion(editor, {
      id: "s1",
      type: "text_replacement",
      original_text: "foo",
      content: "bar",
    } as any);

    editor.acceptChangeById("s1");

    expect(editor.hasChange("s1")).toBe(false);
    expect(serializeText(editor)).toBe("before bar after");
    expect(getTextNodes(editor).every((n) => !n.trackedChange)).toBe(true);
  });
});

describe("trackChanges — getTrackedChanges() caching (P1.5)", () => {
  it("returns the same array reference for repeated calls without mutation", () => {
    const editor = createTestEditor();
    applyLLMSuggestion(editor, {
      id: "s1",
      type: "text_replacement",
      original_text: "foo",
      content: "bar",
    } as any);

    const first = editor.getTrackedChanges();
    const second = editor.getTrackedChanges();

    // Reference identity = кеш сработал.
    expect(second).toBe(first);
  });

  it("invalidates cache after a mutating transform", () => {
    const editor = createTestEditor();
    applyLLMSuggestion(editor, {
      id: "s1",
      type: "text_replacement",
      original_text: "foo",
      content: "bar",
    } as any);

    const first = editor.getTrackedChanges();
    expect(first).toHaveLength(1);

    // Reject => editor.children меняет ссылку => кеш инвалидируется.
    editor.rejectChangeById("s1");
    const second = editor.getTrackedChanges();

    expect(second).not.toBe(first);
    expect(second).toHaveLength(0);
  });

  it("invalidates cache after a second apply", () => {
    const editor = createTestEditor();
    applyLLMSuggestion(editor, {
      id: "s1",
      type: "text_replacement",
      original_text: "before",
      content: "BEFORE",
    } as any);

    const first = editor.getTrackedChanges();
    expect(first).toHaveLength(1);

    applyLLMSuggestion(editor, {
      id: "s2",
      type: "text_replacement",
      original_text: "after",
      content: "AFTER",
    } as any);

    const second = editor.getTrackedChanges();
    expect(second).not.toBe(first);
    expect(second).toHaveLength(2);
  });
});

// ─── P1.11: Regression suite for critical paths ───────────────────────────
// Это места, где Slate-плагин tracking ломается чаще всего. Добавляем
// проверки до того, как кто-то наступит на грабли.

describe("trackChanges — overlap правок", () => {
  it("apply трёх правок подряд → accept средней оставляет крайние нетронутыми", () => {
    const editor = withTrackChanges(withReact(withHistory(createEditor())));
    editor.children = [
      { type: "paragraph", children: [{ text: "alpha beta gamma delta" }] },
    ] as any;

    applyLLMSuggestion(editor, {
      id: "s-alpha",
      type: "text_replacement",
      original_text: "alpha",
      content: "ALPHA",
    } as any);
    applyLLMSuggestion(editor, {
      id: "s-beta",
      type: "text_replacement",
      original_text: "beta",
      content: "BETA",
    } as any);
    applyLLMSuggestion(editor, {
      id: "s-gamma",
      type: "text_replacement",
      original_text: "gamma",
      content: "GAMMA",
    } as any);

    expect(editor.getTrackedChanges()).toHaveLength(3);

    editor.acceptChangeById("s-beta");

    // Средняя принята → текст стал BETA, остальные две правки висят.
    expect(editor.hasChange("s-beta")).toBe(false);
    expect(editor.hasChange("s-alpha")).toBe(true);
    expect(editor.hasChange("s-gamma")).toBe(true);
    expect(serializeText(editor)).toContain("BETA");
    expect(serializeText(editor)).toContain("alpha"); // delete-нода ещё в документе
    expect(serializeText(editor)).toContain("gamma");
  });
});

describe("trackChanges — cross-paragraph и пустые документы", () => {
  it("findTextAcrossNodes находит текст через границу параграфов", () => {
    const editor = withTrackChanges(withReact(withHistory(createEditor())));
    editor.children = [
      { type: "paragraph", children: [{ text: "first paragraph end" }] },
      { type: "paragraph", children: [{ text: "second paragraph start" }] },
    ] as any;

    const result = applyLLMSuggestion(editor, {
      id: "s-cross",
      type: "text_replacement",
      original_text: "end second",
      content: "END SECOND",
    } as any);

    expect(result.success).toBe(true);
    expect(editor.hasChange("s-cross")).toBe(true);
  });

  it("apply на пустом документе для text_addition не падает", () => {
    const editor = withTrackChanges(withReact(withHistory(createEditor())));
    editor.children = [{ type: "paragraph", children: [{ text: "" }] }] as any;

    const result = applyLLMSuggestion(editor, {
      id: "s-empty",
      type: "text_addition",
      content: "Hello",
      position: "end",
    } as any);

    expect(result.success).toBe(true);
  });

  it("apply text_replacement на пустом документе возвращает success:false", () => {
    const editor = withTrackChanges(withReact(withHistory(createEditor())));
    editor.children = [{ type: "paragraph", children: [{ text: "" }] }] as any;

    const result = applyLLMSuggestion(editor, {
      id: "s-not-found",
      type: "text_replacement",
      original_text: "nonexistent text",
      content: "anything",
    } as any);

    expect(result.success).toBe(false);
  });
});

describe("trackChanges — массовые операции", () => {
  it("rejectAllChanges очищает документ от всех правок", () => {
    const editor = withTrackChanges(withReact(withHistory(createEditor())));
    editor.children = [
      { type: "paragraph", children: [{ text: "one two three four" }] },
    ] as any;

    applyLLMSuggestion(editor, { id: "s1", type: "text_replacement", original_text: "one", content: "ONE" } as any);
    applyLLMSuggestion(editor, { id: "s2", type: "text_replacement", original_text: "two", content: "TWO" } as any);
    applyLLMSuggestion(editor, { id: "s3", type: "text_replacement", original_text: "three", content: "THREE" } as any);

    expect(editor.getTrackedChanges()).toHaveLength(3);

    editor.rejectAllChanges();

    expect(editor.getTrackedChanges()).toHaveLength(0);
    expect(serializeText(editor)).toBe("one two three four");
  });

  it("acceptAllChanges применяет все правки и снимает marks", () => {
    const editor = withTrackChanges(withReact(withHistory(createEditor())));
    editor.children = [
      { type: "paragraph", children: [{ text: "a b c" }] },
    ] as any;

    applyLLMSuggestion(editor, { id: "s1", type: "text_replacement", original_text: "a", content: "X" } as any);
    applyLLMSuggestion(editor, { id: "s2", type: "text_replacement", original_text: "c", content: "Z" } as any);

    editor.acceptAllChanges();

    expect(editor.getTrackedChanges()).toHaveLength(0);
    expect(serializeText(editor)).toBe("X b Z");
  });

  it("reject all → re-apply all (массовый сценарий) не дублирует", () => {
    const editor = withTrackChanges(withReact(withHistory(createEditor())));
    editor.children = [
      { type: "paragraph", children: [{ text: "x y z" }] },
    ] as any;

    const sx = { id: "sx", type: "text_replacement", original_text: "x", content: "X" } as any;
    const sy = { id: "sy", type: "text_replacement", original_text: "y", content: "Y" } as any;

    applyLLMSuggestion(editor, sx);
    applyLLMSuggestion(editor, sy);
    editor.rejectAllChanges();
    applyLLMSuggestion(editor, sx);
    applyLLMSuggestion(editor, sy);

    // Каждый suggestion.id даёт ровно один tracked change, дубль не возможен.
    expect(editor.getTrackedChanges()).toHaveLength(2);
  });
});

describe("trackChanges — длинный original_text", () => {
  it("apply text_replacement на 500+ символов проходит", () => {
    const longText = "lorem ".repeat(100).trim(); // 599 символов
    const editor = withTrackChanges(withReact(withHistory(createEditor())));
    editor.children = [
      { type: "paragraph", children: [{ text: `prefix ${longText} suffix` }] },
    ] as any;

    const result = applyLLMSuggestion(editor, {
      id: "s-long",
      type: "text_replacement",
      original_text: longText,
      content: "SHORT",
    } as any);

    expect(result.success).toBe(true);
    expect(editor.hasChange("s-long")).toBe(true);
  });
});

describe("trackChanges — typography-tolerant matching (баг #3)", () => {
  it("applies when model uses straight quotes/hyphen but doc has « » and em-dash", () => {
    const editor = withTrackChanges(withReact(withHistory(createEditor())));
    editor.children = [
      { type: "paragraph", children: [{ text: "Раздел «foo» — конец" }] },
    ] as any;

    const result = applyLLMSuggestion(editor, {
      id: "typo1",
      type: "text_replacement",
      original_text: '"foo" - конец', // прямые кавычки + дефис (как от модели)
      content: "bar",
    } as any);

    expect(result.success).toBe(true);
    expect(editor.hasChange("typo1")).toBe(true);
  });
});
