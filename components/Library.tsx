'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Check, Cloud, FileText, LoaderCircle, Plus, Search, Upload, X } from 'lucide-react';
import { FORMATS } from '@/lib/books';
import type { BookSummary } from '@/lib/books';
import { restoreProgress } from '@/lib/reader';
import { readApiResponse } from '@/lib/api';
import { DeleteBookButton } from '@/components/DeleteBookButton';

const number = new Intl.NumberFormat('ru-RU');
const themes = ['coral', 'sage', 'lavender', 'sand', 'blue'];
function coverTheme(book: BookSummary) { return themes[Array.from(book.id).reduce((n, c) => n + c.charCodeAt(0), 0) % themes.length]; }
export function Library({ onOpen }: { onOpen:(id:string)=>void }) {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState('');
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Record<string,number>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const collectionHeading = useRef<HTMLHeadingElement>(null);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/books', { cache: 'no-store' });
      const data = await readApiResponse<{ books: BookSummary[] }>(response);
      setBooks(data.books);
      const p: Record<string, number> = {};
      for (const book of data.books as BookSummary[]) {
        try {
          const raw = localStorage.getItem('wbook:progress:' + book.id);
          if (raw) p[book.id] = Math.round(restoreProgress(raw, book.wordCount).index / Math.max(1, book.wordCount - 1) * 100);
        } catch {}
      }
      setProgress(p);
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить библиотеку.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  function bookDeleted(book: BookSummary) {
    setBooks(current => current.filter(item => item.id !== book.id));
    setProgress(current => {
      const next = { ...current };
      delete next[book.id];
      return next;
    });
    setMessage('«' + book.title + '» удалена из общей библиотеки');
    requestAnimationFrame(() => collectionHeading.current?.focus());
  }
  async function upload(files: FileList | File[]) {
    if (busy.current) return;
    busy.current = true; setError(''); setMessage('');
    let added = 0; const errors: string[] = [];
    for (const file of Array.from(files)) {
      setImporting(file.name);
      try {
        const { importBook } = await import('@/lib/import');
        const document = await importBook(file, step => setImporting(file.name + ' · ' + step));
        setImporting(file.name + ' · Сохраняем в библиотеку…');
        const form = new FormData(); form.append('file', file); form.append('document', JSON.stringify(document));
        const response = await fetch('/api/books', { method: 'POST', body: form });
        await readApiResponse(response);
        added++;
      } catch (e) { errors.push(file.name + ': ' + (e instanceof Error ? e.message : 'Не удалось прочитать файл.')); }
    }
    setImporting(''); busy.current = false;
    if (fileInput.current) fileInput.current.value = '';
    await refresh();
    if (errors.length) setError(errors.join('\n'));
    if (added) setMessage(added === 1 ? 'Книга добавлена в общую библиотеку' : `Добавлено книг: ${added}`);
  }
  const visible = books.filter(b => (b.title + ' ' + b.author).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
  const started = books.filter(b => progress[b.id] !== undefined && progress[b.id] < 100);
  return <div className="library-shell" onDragOver={e => { e.preventDefault(); if (!busy.current) setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="WBook, библиотека"><span className="brand-icon"><BookOpen size={23}/></span><span>wbook<span className="brand-dot">.</span></span></a>
      <div className="sidebar-label">ТВОЁ ПРОСТРАНСТВО</div>
      <a href="#library" className="nav-item active"><BookOpen size={19}/>Библиотека<span>{books.length}</span></a>
      <button className="nav-item" onClick={() => onOpen('demo')}><FileText size={19}/>Как это работает<ArrowUpRight size={15}/></button>
      <div className="sidebar-bottom"><div className="shared-mark"><Cloud size={18}/><span>Общая библиотека<small>Книги объединяют</small></span><i/></div><p>Твой темп.<br/>Твоё время для себя.</p><span className="version">WBOOK · ПЕРВАЯ ГЛАВА</span></div>
    </aside>
    <div className="library-main">
      <header className="topbar"><div className="mobile-brand"><BookOpen size={22}/>wbook<span>.</span></div><div className="breadcrumb">Моё пространство<span>/</span><strong>Библиотека</strong></div><span className="topbar-note"><span className="online-dot"/>Общая библиотека</span><span className="avatar" aria-label="Общая библиотека" title="Единая библиотека без аккаунтов">W</span></header>
      <main className="library-content" id="library">
        <div className="page-heading"><div><div className="eyebrow">МЕСТО ДЛЯ ХОРОШИХ ИСТОРИЙ</div><h1>Твоя библиотека<span>.</span></h1><p>Меньше отвлечений. Больше смысла в каждом слове.</p></div><button className="primary-button upload-top" onClick={() => fileInput.current?.click()} disabled={!!importing}><Plus size={19}/>Добавить книгу</button></div>
        <section className="intro-card">
          <div className="intro-copy"><span className="pill"><span/>ОДНО СЛОВО. ПОЛНОЕ ПОГРУЖЕНИЕ.</span><h2>Читай в своём<br/><em>ритме.</em></h2><p>Удерживай, чтобы читать.<br/>Двигай палец — управляй скоростью.</p><button className="text-button" onClick={() => onOpen('demo')}>Попробовать на примере<ArrowUpRight size={18}/></button></div>
          <div className="intro-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span className="art-plus one">+</span><span className="art-plus two">+</span><div className="preview-top"><span className="preview-dots">•••</span><span>В ФОКУСЕ</span><span>300</span></div><div className="art-word">вд<span>о</span>хновение<div className="word-tick top"/><div className="word-tick bottom"/></div><div className="preview-bottom"><span/><span>Только ты и история.</span><span/></div><span className="gesture-chip">↑ быстрее<span>·</span>↓ медленнее</span></div>
        </section>
        {started.length > 0 && !query && <button className="continue-card" onClick={() => onOpen(started[0].id)}><span className="continue-icon"><BookOpen size={20}/></span><span><small>ПРОДОЛЖИТЬ ЧТЕНИЕ</small><strong>{started[0].title}</strong></span><span className="continue-percent">{progress[started[0].id]}%</span><ArrowRight size={20}/></button>}
        <div className="collection-heading"><div><h2 ref={collectionHeading} tabIndex={-1}>Все книги <span>{books.length}</span></h2><p>Общая коллекция, личное путешествие</p></div><label className="search-field"><Search size={17}/><input aria-label="Найти книгу" placeholder="Название или автор" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={15}/></button>}</label></div>
        {message && <div className="notice success" role="status"><Check size={18}/>{message}<button onClick={() => setMessage('')} aria-label="Скрыть"><X size={16}/></button></div>}
        {error && <div className="notice error" role="alert"><span>{error}</span><button onClick={() => void refresh()}>Повторить</button></div>}
        {loading ? <div className="empty-state compact"><span className="spinner"/><p>Собираем книги на полку…</p></div> : <div className="book-grid">
          {visible.map(book => <article key={book.id} className="book-card">
            <button type="button" className="book-open" onClick={() => onOpen(book.id)} aria-label={'Открыть книгу «' + book.title + '»'}><div className={'book-cover ' + coverTheme(book)}><span className="cover-format">{book.format}</span><div className="cover-line"/><span className="cover-title">{book.title}</span><span className="cover-author">{book.author || 'История ждёт тебя'}</span><BookOpen className="cover-symbol" size={47} strokeWidth={1}/><span className="cover-read">Открыть книгу<ArrowUpRight size={19}/></span></div><div className="book-details"><h3>{book.title}</h3><p>{book.author || 'Автор не указан'}</p><div className="book-meta"><span>{number.format(book.wordCount)} слов</span><span>{Math.max(1, Math.ceil(book.wordCount / 300))} мин</span></div>{progress[book.id] !== undefined && <div className="book-progress"><span style={{width:progress[book.id] + '%'}}/></div>}</div></button>
            <DeleteBookButton book={book} onDeleted={bookDeleted}/>
          </article>)}
          {!query && <button className={'upload-card ' + (books.length === 0 ? 'first-upload' : '')} onClick={() => fileInput.current?.click()} disabled={!!importing}><span className="upload-circle">{importing ? <LoaderCircle className="spin" size={26}/> : <Plus size={27}/>}</span><h3>{importing ? 'Добавляем книгу' : books.length ? 'Ещё одна история' : 'Здесь начнётся твоя история'}</h3><p>{importing || 'Выбери файл или перетащи его сюда'}</p><span className="upload-action">{importing ? 'Подожди немного…' : 'Загрузить книгу'}{!importing && <ArrowUpRight size={16}/>}</span><small>EPUB · FB2 · PDF · TXT · DOCX · MOBI · AZW3</small></button>}
        </div>}
        {!loading && query && !visible.length && <div className="empty-state"><Search size={30}/><h3>Такой книги пока нет</h3><p>Попробуй другое название или имя автора.</p><button className="text-button" onClick={() => setQuery('')}>Показать все книги<ArrowRight size={17}/></button></div>}
        <footer className="library-footer"><span><BookOpen size={15}/>Одна библиотека. Тысячи новых мыслей.</span><span>Читай с удовольствием.</span></footer>
      </main>
    </div>
    <input ref={fileInput} className="visually-hidden" type="file" accept={FORMATS.map(f => '.' + f.toLowerCase()).join(',')} multiple onChange={e => { if (e.target.files) void upload(e.target.files); }}/>
    {dragging && <div className="drop-overlay"><Upload size={52}/><h2>Отпусти — и книга на полке</h2><p>Можно добавить несколько файлов сразу</p></div>}
    {importing && <div className="import-status" role="status"><LoaderCircle className="spin" size={20}/><div><strong>Добавляем в библиотеку</strong><span>{importing}</span></div></div>}
  </div>;
}

