'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { fitFocusFont, splitFocus } from '@/lib/reader';

export function FocusWord({ word }: { word: string }) {
  const element = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(64);
  const focus = splitFocus(word);
  useLayoutEffect(() => {
    const target = element.current;
    if (!target) return;
    const measure = () => {
      const style = getComputedStyle(target);
      const width = target.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 12;
      const textWidth = (selector: string) => {
        const span = target.querySelector(selector)!;
        const range = document.createRange(); range.selectNodeContents(span);
        return range.getBoundingClientRect().width;
      };
      const next = fitFocusFont(width, textWidth('.word-before'), textWidth('.word-focus'), textWidth('.word-after'), parseFloat(style.fontSize), Math.min(88, target.clientWidth * .16));
      setFontSize(previous => Math.abs(previous - next) < .15 ? previous : next);
    };
    measure();
    const resize = new ResizeObserver(measure);
    // Observe the stage width; measuring the word itself on font-size changes
    // would introduce a resize feedback loop.
    if (target.parentElement) resize.observe(target.parentElement);
    return () => resize.disconnect();
  }, [word]);
  return <div ref={element} className="focus-word" data-testid="focus-word" style={{fontSize}}><span className="word-before">{focus.before}</span><span className="word-focus">{focus.focus}</span><span className="word-after">{focus.after}</span></div>;
}
