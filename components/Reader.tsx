'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, ChevronDown, Hand, Maximize2, Minus, Pause, Play, Plus, RotateCcw, Settings2, X } from 'lucide-react';
import type { BookDocument, BookSummary } from '@/lib/books';
import { restoreProgress, speedForDrag, splitFocus, tokenize, wordDelay, remainingWordTime } from '@/lib/reader';
import { BookText } from './BookText';
import { FocusWord } from './FocusWord';

const fmt = new Intl.NumberFormat('ru-RU');
export function Reader({ book, document: doc, onClose }: { book: BookSummary; document: BookDocument; onClose: () => void }) {
  const tokens = useMemo(() => tokenize(doc.paragraphs), [doc]);
  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState(300);
  const [playing, setPlaying] = useState(false);
  const [holding, setHolding] = useState(false);
  const [finished, setFinished] = useState(false);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const [punctuation, setPunctuation] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordStartedAt = useRef<number | null>(null);
  const running = useRef(false);
  const pointer = useRef<{id: number; y: number; speed: number} | null>(null);
  const state = useRef({index, speed, completed:finished});
  state.current = {index, speed, completed:finished};
  const stop = useCallback(() => {
    running.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    wordStartedAt.current = null;
    pointer.current = null;
    setPlaying(false); setHolding(false);
  }, []);
  const save = useCallback(() => {
    try { localStorage.setItem('wbook:progress:' + book.id, JSON.stringify(state.current)); }
    catch { setStorageWarning('Браузер не разрешает сохранить место чтения.'); }
  }, [book.id]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('wbook:progress:' + book.id);
      const restored = restoreProgress(raw, tokens.length);
      setIndex(restored.index); setSpeed(restored.speed);
      try { setFinished(JSON.parse(raw || '{}').completed === true); } catch {}
    } catch { setStorageWarning('Браузер не разрешает сохранить место чтения.'); }
    setReady(true);
  }, [book.id, tokens.length]);
  useEffect(() => {
    if (!ready) return;
    if (!playing) save();
    const interval = setInterval(save, 2000);
    const leave = () => { stop(); save(); };
    const hidden = () => { if (window.document.hidden) leave(); };
    window.addEventListener('blur', leave);
    window.addEventListener('pagehide', leave);
    window.document.addEventListener('visibilitychange', hidden);
    return () => { clearInterval(interval); window.removeEventListener('blur', leave); window.removeEventListener('pagehide', leave); window.document.removeEventListener('visibilitychange', hidden); save(); };
  }, [ready, playing, save, stop]);
  useEffect(() => {
    if (!playing || !tokens.length || !ready) return;
    running.current = true;
    const token = tokens[index];
    const paragraphEnd = index === tokens.length - 1 || tokens[index + 1].paragraph !== token.paragraph;
    const now = performance.now();
    if (wordStartedAt.current === null) wordStartedAt.current = now;
    const interval = punctuation ? wordDelay(token.text, speed, paragraphEnd) : 60000 / speed;
    timer.current = setTimeout(() => {
      if (!running.current) return;
      if (index >= tokens.length - 1) { stop(); setFinished(true); }
      else { wordStartedAt.current = null; setIndex(value => value + 1); }
    }, remainingWordTime(interval, wordStartedAt.current, now));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [playing, index, speed, tokens, ready, punctuation, stop]);
  useEffect(() => () => { running.current = false; if (timer.current) clearTimeout(timer.current); }, []);
  const start = useCallback(() => { if (ready && !finished && tokens.length) { running.current = true; setPlaying(true); } }, [ready, finished, tokens.length]);
  const jump = useCallback((next: number) => { stop(); setFinished(false); setIndex(Math.max(0, Math.min(tokens.length - 1, next))); }, [stop, tokens.length]);
  useEffect(() => {
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (!!target.closest('input,textarea,select,button,a') || target.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (editable(e.target)) return;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) start(); }
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); setSpeed(v => Math.max(60, Math.min(1200, v + (e.code === 'ArrowUp' ? 25 : -25)))); }
      if (e.code === 'Escape') stop();
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); stop(); } };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [start, stop]);
  const token = tokens[index];
  const percent = finished ? 100 : Math.round(index / Math.max(1, tokens.length - 1) * 100);
  const remaining = Math.max(0, Math.ceil((tokens.length - index) / speed));
  const close = () => { stop(); save(); onClose(); };
  return <main className={'reader-shell ' + (playing ? 'is-playing' : '')}>
    <header className="reader-header"><button className="icon-button back-button" onClick={close} aria-label="Вернуться в библиотеку"><ArrowLeft size={20}/></button><div className="reader-book-title"><h1>{book.title}</h1><span>{book.author || book.format}</span></div><div className="reader-header-actions"><span className="reader-mode"><span/>В ФОКУСЕ</span><button className={'icon-button ' + (settings ? 'selected' : '')} onClick={() => { stop(); setSettings(!settings); }} aria-label="Настройки чтения"><Settings2 size={20}/></button></div></header>
    <div className="reader-progress"><div><span style={{width:percent + '%'}}/></div><input type="range" min={0} max={Math.max(0, tokens.length - 1)} value={index} aria-label="Позиция в книге" onChange={e => jump(Number(e.target.value))}/></div>
    <div className="reader-stats"><span className={'speed-badge ' + (holding ? 'adjusting' : '')}><span className="speed-dot"/><strong data-testid="speed">{speed}</strong> слов/мин</span><span data-testid="position">{fmt.format(index + 1)} <span>/ {fmt.format(tokens.length)}</span></span><span>~ {remaining} мин<span className="desktop-only"> до конца</span></span></div>
    <section className={'focus-stage ' + (holding ? 'is-holding' : '')} aria-label="Удерживайте здесь для чтения. Двигайте вверх быстрее, вниз медленнее." data-testid="focus-stage" onContextMenu={e => e.preventDefault()}
      onPointerDown={e => {
        if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || finished) return;
        e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
        pointer.current = { id:e.pointerId, y:e.clientY, speed };
        setHolding(true); start();
      }}
      onPointerMove={e => { if (pointer.current?.id === e.pointerId) setSpeed(speedForDrag(pointer.current.speed, e.clientY - pointer.current.y)); }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>
      <div className="stage-label">{finished ? 'ИСТОРИЯ ПРОЧИТАНА' : playing ? 'ТВОЙ РИТМ' : 'ОДНО СЛОВО ЗА ДРУГИМ'}<span className={playing ? 'pulse-dot' : ''}/></div>
      <div className="anchor-mark top"/>
      <FocusWord word={token?.text || ''}/>
      <div className="anchor-mark bottom"/>
      <div className="hold-hint">{finished ? <><Check size={16}/>Можно начать ещё раз или выбрать другую книгу</> : holding ? <><ArrowUp size={15}/>быстрее<span className="hint-divider"/><ArrowDown size={15}/>медленнее</> : <><Hand size={16}/>Прижми и удерживай, чтобы читать</>}</div>
      <div className="stage-corner left"/><div className="stage-corner right"/>
    </section>
    <div className="reader-controls"><button className="icon-button" onClick={() => jump(index - 10)} aria-label="Назад на 10 слов"><RotateCcw size={21}/><small>10</small></button><div className="playback-pill"><button onClick={() => setSpeed(v => Math.max(60, v - 25))} aria-label="Уменьшить скорость"><Minus size={21}/></button><button className="play-button" onClick={() => { if (finished) { jump(0); } else if (playing) stop(); else start(); }} aria-label={finished ? 'Начать заново' : playing ? 'Пауза' : 'Читать без удержания'}>{finished ? <RotateCcw size={25}/> : playing ? <Pause size={27} fill="currentColor"/> : <Play size={27} fill="currentColor"/>}</button><button onClick={() => setSpeed(v => Math.min(1200, v + 25))} aria-label="Увеличить скорость"><Plus size={22}/></button></div><span className="reader-percent">{percent}<small>%</small></span></div>
    {settings && <section className="settings-panel"><div><strong>Твой темп</strong><button className="icon-button" onClick={() => setSettings(false)} aria-label="Закрыть настройки"><X size={18}/></button></div><label>Скорость <b>{speed} слов/мин</b><input type="range" min={60} max={1200} step={5} value={speed} onChange={e => setSpeed(Number(e.target.value))}/></label><label className="check-setting"><input type="checkbox" checked={punctuation} onChange={e => setPunctuation(e.target.checked)}/><span>Паузы на знаках препинания</span></label><p>На компьютере: удерживай пробел для чтения, ↑ и ↓ меняют скорость.</p></section>}
    <section className="full-text-panel"><header><h2><BookOpen size={16}/>Полный текст<span>Нажми на слово, чтобы продолжить с него</span></h2><ChevronDown size={17}/></header><BookText tokens={tokens} index={index} playing={playing} onSelect={jump} onPause={stop}/></section>
    {storageWarning && <p className="storage-warning" role="status">{storageWarning}</p>}
    <footer className="reader-footer"><span>wbook<span>.</span></span><span>История продолжается в твоём темпе</span><span>{book.format}</span></footer>
  </main>;
}
