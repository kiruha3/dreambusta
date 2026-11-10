import { describe, it, expect } from "vitest";
import { createEditor } from "slate";
import {
  resolveFontFamily,
  setEditorDocDefaults,
  getActiveFontFamily,
  getActiveFontSize,
  clearDocumentDefaultsCache,
} from "../fontUtils";

describe("resolveFontFamily", () => {
  it("добавляет metric-compatible fallback для TNR", () => {
    const css = resolveFontFamily("Times New Roman");
    expect(css).toBeTruthy();
    expect(css).toContain("Times New Roman");
    expect(css).toContain("Liberation Serif");
    expect(css).toContain("serif");
  });

  it("работает case-insensitive по ключу fallback'а", () => {
    const lower = resolveFontFamily("times new roman");
    const upper = resolveFontFamily("TIMES NEW ROMAN");
    expect(lower).toContain("Liberation Serif");
    expect(upper).toContain("Liberation Serif");
  });

  it("добавляет Carlito как fallback для Calibri", () => {
    const css = resolveFontFamily("Calibri");
    expect(css).toContain("Carlito");
    expect(css).toContain("sans-serif");
  });

  it("оборачивает многословные имена в кавычки", () => {
    const css = resolveFontFamily("Courier New");
    expect(css).toMatch(/^"Courier New"/);
  });

  it("для неизвестного шрифта добавляет хотя бы sans-serif", () => {
    const css = resolveFontFamily("MyCustomFont");
    expect(css).toContain("MyCustomFont");
    expect(css).toContain("sans-serif");
  });

  it("undefined / пустая строка → undefined", () => {
    expect(resolveFontFamily(undefined)).toBeUndefined();
    expect(resolveFontFamily(null)).toBeUndefined();
    expect(resolveFontFamily("")).toBeUndefined();
    expect(resolveFontFamily("   ")).toBeUndefined();
  });
});

describe("setEditorDocDefaults / getDocumentDefaults", () => {
  it("editor.docDefaults перебивает fallback для пустого документа", () => {
    const editor = createEditor();
    editor.children = []; // полностью пустой
    // 14.667 px = 11pt — стандартный docDefault Word'а.
    setEditorDocDefaults(editor, { fontFamily: "Calibri", fontSize: 14.667 });

    // getActiveFontFamily вернёт editor-level default, а не FALLBACK_DEFAULTS.
    expect(getActiveFontFamily(editor)).toBe("Calibri");
    // getActiveFontSize конвертит px → pt и округляет → 11.
    expect(getActiveFontSize(editor)).toBe(11);
  });

  it("editor.docDefaults приоритетнее доминирующего шрифта в нодах", () => {
    const editor = createEditor();
    // В нодах доминирует Verdana, но docDefaults говорит Arial → берём Arial,
    // потому что это явный «default font» документа, а не эвристика.
    editor.children = [
      {
        type: "paragraph",
        children: [
          { text: "verdana", fontFamily: "Verdana", fontSize: 16 } as any,
        ],
      } as any,
    ];
    setEditorDocDefaults(editor, { fontFamily: "Arial", fontSize: 14.67 });
    expect(getActiveFontFamily(editor)).toBe("Arial");
  });

  it("сброс defaults через null возвращает к старому поведению", () => {
    const editor = createEditor();
    editor.children = [
      {
        type: "paragraph",
        children: [{ text: "arial", fontFamily: "Arial", fontSize: 16 } as any],
      } as any,
    ];
    setEditorDocDefaults(editor, { fontFamily: "Calibri", fontSize: 22 });
    expect(getActiveFontFamily(editor)).toBe("Calibri");

    setEditorDocDefaults(editor, null);
    clearDocumentDefaultsCache(editor);
    // Теперь возвращает доминирующий из нод.
    expect(getActiveFontFamily(editor)).toBe("Arial");
  });
});
