'use client';

import { useRef, useState } from 'react';
import { AlertDialog } from 'radix-ui';
import { LoaderCircle, Trash2 } from 'lucide-react';
import type { BookSummary } from '@/lib/books';
import { readApiResponse } from '@/lib/api';

export function DeleteBookButton({ book, onDeleted }: { book: BookSummary; onDeleted: (book: BookSummary) => void }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);

  async function remove() {
    if (busy.current) return;
    busy.current = true;
    setDeleting(true);
    setError('');
    try {
      const response = await fetch('/api/books/' + book.id, { method: 'DELETE' });
      await readApiResponse(response);
      try { localStorage.removeItem('wbook:progress:' + book.id); } catch {}
      onDeleted(book);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить книгу. Попробуйте ещё раз.');
    } finally {
      busy.current = false;
      setDeleting(false);
    }
  }

  return <AlertDialog.Root open={open} onOpenChange={next => {
    if (busy.current) return;
    setOpen(next);
    setError('');
  }}>
    <AlertDialog.Trigger asChild>
      <button type="button" className="book-delete" aria-label={'Удалить книгу «' + book.title + '»'} title="Удалить книгу"><Trash2 size={17}/><span>Удалить</span></button>
    </AlertDialog.Trigger>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="delete-overlay"/>
      <AlertDialog.Content className="delete-dialog" aria-busy={deleting} onEscapeKeyDown={e => { if (busy.current) e.preventDefault(); }}>
        <span className="delete-dialog-icon" aria-hidden="true"><Trash2 size={24}/></span>
        <AlertDialog.Title>Удалить книгу?</AlertDialog.Title>
        <AlertDialog.Description>«{book.title}» будет удалена из общей библиотеки для всех читателей. Чтобы вернуть книгу, нужно будет загрузить файл заново.</AlertDialog.Description>
        {error && <p className="delete-error" role="alert">{error}</p>}
        <div className="delete-dialog-actions">
          <AlertDialog.Cancel className="delete-cancel" disabled={deleting}>Отмена</AlertDialog.Cancel>
          <button type="button" className="delete-confirm" disabled={deleting} onClick={() => void remove()}>{deleting ? <><LoaderCircle className="spin" size={17}/>Удаляем…</> : <><Trash2 size={17}/>{error ? 'Повторить удаление' : 'Удалить книгу'}</>}</button>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
