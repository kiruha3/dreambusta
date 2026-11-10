'use client';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Token } from '@/lib/reader';

type Row = { start: number; words: Token[]; paragraph: number };
export const BookText = memo(function BookText({ tokens, index, playing, onSelect, onPause }: { tokens: Token[]; index: number; playing: boolean; onSelect: (index: number) => void; onPause: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const programmaticScroll = useRef<number | null>(null);
  const lastMeasuredWidth = useRef(0);
  const [viewport, setViewport] = useState({ width: 600, height: 340, top: 0 });
  const [measured, setMeasured] = useState<Record<number,number>>({});
  const rows = useMemo(() => {
    const list: Row[] = [];
    for (const token of tokens) {
      const previous = list[list.length - 1];
      if (!previous || previous.words.length >= 90 || previous.paragraph !== token.paragraph) list.push({ start: token.index, words: [token], paragraph: token.paragraph });
      else previous.words.push(token);
    }
    return list;
  }, [tokens]);
  const offsets = useMemo(() => {
    const result = [0];
    const charsPerLine = Math.max(20, (viewport.width - 64) / 9.5);
    rows.forEach((row, i) => {
      const chars = row.words.reduce((n, w) => n + w.text.length + 1, 0);
      const estimated = Math.ceil(chars / charsPerLine) * 34 + 24;
      result.push(result[i] + (measured[i] ?? estimated));
    });
    return result;
  }, [rows, viewport.width, measured]);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const resize = new ResizeObserver(() => {
      setViewport(v => ({ ...v, width: element.clientWidth, height: element.clientHeight }));
      if (lastMeasuredWidth.current !== element.clientWidth) {
        lastMeasuredWidth.current = element.clientWidth;
        setMeasured({});
      }
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  const measureRow = useCallback((element: HTMLParagraphElement | null) => {
    if (!element) return;
    const i = Number(element.dataset.row);
    const height = Math.ceil(element.getBoundingClientRect().height);
    setMeasured(values => values[i] === height ? values : { ...values, [i]: height });
  }, []);
  let start = 0;
  while (start < rows.length - 1 && offsets[start + 1] < viewport.top - 400) start++;
  let end = start;
  while (end < rows.length && offsets[end] < viewport.top + viewport.height + 600) end++;
  useLayoutEffect(() => {
    const elements = container.current?.querySelectorAll<HTMLParagraphElement>('[data-row]');
    if (!elements) return;
    const resize = new ResizeObserver(entries => {
      for (const entry of entries) measureRow(entry.target as HTMLParagraphElement);
    });
    for (const element of elements) { measureRow(element); resize.observe(element); }
    return () => resize.disconnect();
  }, [viewport.width, start, end, measureRow, rows]);
  useEffect(() => { following.current = true; }, [index]);
  useEffect(() => { if (playing) following.current = true; }, [playing]);
  useEffect(() => {
    const scroller = container.current;
    if (!scroller || !following.current) return;
    const rowIndex = rows.findIndex((r, i) => index >= r.start && (i === rows.length - 1 || index < rows[i + 1].start));
    if (rowIndex < 0) return;
    const active = scroller.querySelector<HTMLElement>('[data-active="true"]');
    const scrollTo = (top: number) => {
      const target = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, top));
      programmaticScroll.current = target;
      scroller.scrollTop = target;
    };
    if (active) {
      const a = active.getBoundingClientRect(); const c = scroller.getBoundingClientRect();
      if (a.top < c.top + 24 || a.bottom > c.bottom - 30) scrollTo(scroller.scrollTop + a.top - c.top - scroller.clientHeight * .35);
    } else scrollTo(offsets[rowIndex] - 30);
  }, [index, rows, offsets, start, playing]);
  const manualScroll = () => { following.current = false; onPause(); };
  return <div className="book-text" ref={container} onScroll={e => {
    const top = e.currentTarget.scrollTop;
    const ownScroll = programmaticScroll.current !== null && Math.abs(top - programmaticScroll.current) < 2;
    programmaticScroll.current = null;
    if (!ownScroll) { following.current = false; onPause(); }
    setViewport(v => ({ ...v, top }));
  }} onWheel={manualScroll} onTouchStart={manualScroll} tabIndex={0} aria-label="Полный текст книги. Нажмите на слово, чтобы выбрать место.">
    <div className="virtual-text" style={{ height: (offsets[offsets.length - 1] || 0) + 40 }}>
      {rows.slice(start, end).map((row, n) => <p key={row.start} ref={measureRow} data-row={start + n} className="text-paragraph" style={{ top: offsets[start + n] }}>
        {row.words.map(word => <span key={word.index} data-word={word.index} data-active={word.index === index ? 'true' : undefined} className={word.index === index ? 'active-word' : ''} onClick={() => onSelect(word.index)}>{word.text}{' '}</span>)}
      </p>)}
    </div>
  </div>;
});
