'use client';
import { useEffect, useState } from 'react';
import { Library } from '@/components/Library';
import { Reader } from '@/components/Reader';
import { demoBook, demoDocument } from '@/lib/demo';
import type { BookDocument, BookSummary } from '@/lib/books';
import { readApiResponse } from '@/lib/api';

export default function Home() {
  const [opened, setOpened] = useState<{book: BookSummary; document: BookDocument} | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function open(id: string, restore = false) {
    setError(''); setLoading(true);
    try {
      if (id === 'demo') setOpened({ book: demoBook, document: demoDocument });
      else {
        const response = await fetch('/api/books/' + id, { cache: 'no-store' });
        const data = await readApiResponse<{ book: BookSummary; document: BookDocument }>(response);
        setOpened(data);
      }
      if (!restore) history.pushState({reader:true}, '', '#read/' + id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось открыть книгу.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const onPop = () => { if (!location.hash.startsWith('#read/')) setOpened(null); };
    window.addEventListener('popstate', onPop);
    const id = location.hash.match(/^#read\/([a-f0-9]{64}|demo)$/)?.[1];
    if (id) void open(id, true);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return <>
    {opened ? <Reader key={opened.book.id} {...opened} onClose={() => { setOpened(null); history.replaceState(null, '', location.pathname); }} /> : <Library onOpen={open} />}
    {loading && <div className="loading-overlay" role="status"><span className="spinner"/>Открываем книгу…</div>}
    {error && <div className="toast" role="alert">{error}<button onClick={() => setError('')} aria-label="Закрыть сообщение">×</button></div>}
  </>;
}
