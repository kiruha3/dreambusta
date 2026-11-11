import test from "node:test";
import assert from "node:assert/strict";
import {
  detectChapters,
  resolveChapters,
  wordChapters,
  chapterAt,
} from "../lib/chapters.ts";
import { tokenize } from "../lib/reader.ts";
import { validateDocument } from "../lib/books.ts";

test("automatic chapters recognize numbered headings but not prose mentioning chapters", () => {
  const paragraphs = [
    "Предисловие",
    "Глава 1. Начало",
    "Мы обсудили главу 2.",
    "Глава 2 оказалась длинной.",
    "Часть II",
    "Chapter One: Arrival",
    "Глава вторая. Продолжение",
    "Эпилог",
  ];
  assert.deepEqual(
    detectChapters(paragraphs).map((c) => c.paragraph),
    [0, 1, 4, 5, 6, 7],
  );
});
test("native labels override heuristics, preserve intro and fall back when boundaries are invalid", () => {
  const paragraphs = [
    "Вступление",
    "Глава 1. Начало",
    "Текст",
    "Глава 2. Конец",
    "Конец",
  ];
  assert.deepEqual(
    resolveChapters(paragraphs, [{ title: "Родное название", paragraph: 3 }]),
    [
      { title: "Вступление", paragraph: 0 },
      { title: "Родное название", paragraph: 3 },
    ],
  );
  assert.deepEqual(
    resolveChapters(paragraphs, [{ title: "Вне книги", paragraph: 99 }]).map(
      (c) => c.paragraph,
    ),
    [0, 1, 3],
  );
});
test("custom marker is literal, starts a short paragraph and does not match the body or a longer word", () => {
  const paragraphs = [
    "Урок 1. Начало",
    "Текст содержит Урок 2",
    "Уроки на завтра",
    "Урок 2. Продолжение",
    "[Part] 1",
    "[Part] 2",
  ];
  assert.deepEqual(
    detectChapters(paragraphs, "Урок").map((c) => c.paragraph),
    [0, 3],
  );
  assert.deepEqual(
    detectChapters(paragraphs, "[Part]").map((c) => c.paragraph),
    [4, 5],
  );
  assert.deepEqual(detectChapters(paragraphs, "несуществующий"), []);
});
test("word ranges keep original word indices across chapter boundaries and empty paragraphs", () => {
  const tokens = tokenize([
    "Вступление",
    "Глава 1",
    "Первый текст",
    "",
    "Глава 2",
    "Конец",
  ]);
  const ranges = wordChapters(
    [
      { title: "Начало", paragraph: 0 },
      { title: "Один", paragraph: 1 },
      { title: "Два", paragraph: 4 },
    ],
    tokens,
  );
  assert.deepEqual(
    ranges.map((c) => [c.start, c.end]),
    [
      [0, 1],
      [1, 5],
      [5, 8],
    ],
  );
  assert.equal(chapterAt(ranges, 4), 1);
  assert.equal(chapterAt(ranges, 5), 2);
  assert.equal(tokens.slice(ranges[2].start, ranges[2].end)[0].index, 5);
});
test("normalization remaps chapter paragraphs when an earlier empty paragraph is removed", () => {
  const book = validateDocument({
    title: "Книга",
    author: "",
    paragraphs: ["  ", "Глава 1", "Текст", "\n", "Глава 2"],
    chapters: [
      { title: "Один", paragraph: 1 },
      { title: "Два", paragraph: 4 },
    ],
  });
  assert.deepEqual(book.chapters, [
    { title: "Один", paragraph: 0 },
    { title: "Два", paragraph: 2 },
  ]);
});
