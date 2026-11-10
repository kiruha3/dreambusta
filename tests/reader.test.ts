import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, splitFocus, speedForDrag, wordDelay, restoreProgress, remainingWordTime, fitFocusFont } from '../lib/reader.ts';

test('full text keeps paragraph indices and Cyrillic words', () => {
  const words = tokenize(['Привет, мир!', 'Новая строка.']);
  assert.deepEqual(words.map(w => [w.text, w.paragraph, w.index]), [['Привет,', 0, 0], ['мир!', 0, 1], ['Новая', 1, 2], ['строка.', 1, 3]]);
});
test('focus excludes punctuation and never loses Unicode characters', () => {
  for (const word of ['«Привет!»', 'your', 'я', '🙂', 'café', 'е\u0301лка', '—']) {
    const p = splitFocus(word);
    assert.equal(p.before + p.focus + p.after, word);
    assert.ok(p.focus.length);
  }
  assert.equal(splitFocus('«Привет!»').focus, 'и');
  assert.equal(splitFocus('е\u0301').focus, 'е\u0301');
});
test('dragging up increases speed, down decreases, boundaries clamp', () => {
  assert.equal(speedForDrag(300, -24), 325);
  assert.equal(speedForDrag(300, 24), 275);
  assert.equal(speedForDrag(300, 0), 300);
  assert.equal(speedForDrag(300, -10000), 1200);
  assert.equal(speedForDrag(300, 10000), 60);
});
test('punctuation and paragraphs get extra time', () => {
  assert.equal(wordDelay('слово', 300, false), 200);
  assert.ok(wordDelay('слово,', 300, false) > 200);
  assert.ok(wordDelay('слово.', 300, false) > wordDelay('слово,', 300, false));
  assert.ok(wordDelay('слово', 300, true) > 200);
});
test('continuous speed changes preserve elapsed word time instead of postponing it', () => {
  const started = 1000;
  assert.equal(remainingWordTime(200, started, 1000), 200);
  assert.equal(remainingWordTime(180, started, 1040), 140);
  assert.equal(remainingWordTime(160, started, 1080), 80);
  assert.equal(remainingWordTime(140, started, 1120), 20);
  assert.equal(remainingWordTime(130, started, 1160), 0);
});
test('long asymmetrical words fit both sides of a fixed central letter', () => {
  const size = fitFocusFont(300, 50, 20, 200, 80, 88);
  assert.ok((200 + 10) * size / 80 <= 150.01);
  assert.ok((50 + 10) * size / 80 <= 150.01);
  assert.equal(fitFocusFont(300, 0, 20, 0, 40, 64), 64);
  assert.ok(fitFocusFont(300, 100, 20, 2000, 80, 88) < 10);
});
test('invalid or stale saved progress cannot point outside the book', () => {
  assert.deepEqual(restoreProgress('{broken', 10), { index: 0, speed: 300 });
  assert.deepEqual(restoreProgress('{"index":999,"speed":9000}', 10), { index: 9, speed: 1200 });
  assert.deepEqual(restoreProgress('{"index":-1,"speed":null}', 10), { index: 0, speed: 300 });
});
