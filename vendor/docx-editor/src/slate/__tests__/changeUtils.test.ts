import { describe, it, expect } from "vitest";
import { normalizeWhitespace, collapseWhitespace } from "../changeUtils";

describe("changeUtils — normalizeWhitespace", () => {
  it("collapses runs of whitespace into a single space", () => {
    expect(normalizeWhitespace("foo   bar")).toBe("foo bar");
    expect(normalizeWhitespace("foo\t\tbar")).toBe("foo bar");
    expect(normalizeWhitespace("foo\nbar")).toBe("foo bar");
    expect(normalizeWhitespace("foo \t\n bar")).toBe("foo bar");
  });

  it("removes pipe separators with surrounding whitespace", () => {
    expect(normalizeWhitespace("foo | bar")).toBe("foo bar");
    expect(normalizeWhitespace("foo|bar")).toBe("foo bar");
    expect(normalizeWhitespace("foo  |  bar")).toBe("foo bar");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeWhitespace("  foo bar  ")).toBe("foo bar");
    expect(normalizeWhitespace("\n\t foo \t\n")).toBe("foo");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeWhitespace("   ")).toBe("");
    expect(normalizeWhitespace("\t\n")).toBe("");
    expect(normalizeWhitespace("")).toBe("");
  });

  it("preserves single-space text unchanged", () => {
    expect(normalizeWhitespace("foo bar baz")).toBe("foo bar baz");
  });

  it("handles multiple pipe-separated fragments", () => {
    expect(normalizeWhitespace("a | b | c")).toBe("a b c");
  });
});

describe("changeUtils — collapseWhitespace", () => {
  it("collapses runs of whitespace but does NOT trim", () => {
    expect(collapseWhitespace("  foo   bar  ")).toBe(" foo bar ");
  });

  it("does NOT remove pipe separators", () => {
    expect(collapseWhitespace("foo | bar")).toBe("foo | bar");
  });

  it("preserves leading/trailing single spaces (positional integrity)", () => {
    // critical: использется в findTextAcrossNodes для построения
    // mapping normalized→original позиций; нельзя сдвигать индексы trim'ом
    expect(collapseWhitespace(" foo ")).toBe(" foo ");
    expect(collapseWhitespace("foo")).toBe("foo");
  });
});

describe("changeUtils — typography folding (умные кавычки/тире)", () => {
  // Баг #3: модель эмитит original_text с прямыми кавычками/дефисом, а в
  // документе (особенно DOCX юр-договоры) — « » " " и тире — /–. Без
  // типографической нормализации normalized-поиск не находит подстроку.
  it("folds curly/guillemet double quotes to straight in normalizeWhitespace", () => {
    expect(normalizeWhitespace("«договор»")).toBe('"договор"');
    expect(normalizeWhitespace("“договор”")).toBe('"договор"');
  });

  it("folds curly single quotes to straight", () => {
    expect(normalizeWhitespace("‘a’")).toBe("'a'");
  });

  it("folds em/en dashes to hyphen", () => {
    expect(normalizeWhitespace("a — b")).toBe("a - b");
    expect(normalizeWhitespace("a–b")).toBe("a-b");
  });

  it("makes model-straight and document-curly normalize EQUAL (root-cause fix)", () => {
    const fromModel = normalizeWhitespace('"договор" - важно');
    const fromDoc = normalizeWhitespace("«договор» — важно");
    expect(fromModel).toBe(fromDoc);
  });

  it("collapseWhitespace folds typography 1:1 (positional integrity сохраняется)", () => {
    expect(collapseWhitespace("«x»")).toBe('"x"');
    // 1:1 — длина не меняется, иначе сломается normToOrig mapping
    expect(collapseWhitespace("«x»").length).toBe("«x»".length);
  });
});
