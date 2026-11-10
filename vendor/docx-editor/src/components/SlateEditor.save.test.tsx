import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor, Transforms } from 'slate';
import { useSlate } from 'slate-react';
import { SlateEditor, type SlateEditorRef } from './SlateEditor';
import { DocxEditor } from './DocxEditor';

let editor: Editor;
vi.mock('./EditorToolbar', () => ({
  EditorToolbar: ({ onSave, hasUnsavedChanges }: { onSave: () => void; hasUnsavedChanges: boolean }) => {
    editor = useSlate();
    return <button onClick={onSave}>{hasUnsavedChanges ? 'dirty' : 'saved'}</button>;
  },
}));
const content = [{ type: 'paragraph', children: [{ text: 'Contract' }] }] as any;
function deferred() {
  let resolve!: (value?: boolean) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<boolean | void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function edit(text = ' edited') {
  await act(async () => {
    Transforms.select(editor, { path: [0, 0], offset: 0 });
    editor.insertText(text);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Slate save waits for backend acknowledgement', () => {
  it('acknowledges a retry requested by the host through the same save lifecycle', async () => {
    const ref = createRef<SlateEditorRef>();
    const save = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(true);
    render(<SlateEditor ref={ref} document={null} initialContent={content} onVersionSave={save} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await edit();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'dirty' })); });
    expect(ref.current?.hasUnsavedChanges()).toBe(true);
    expect(ref.current?.requestSave).toBeTypeOf('function');
    await act(async () => { expect(await ref.current?.requestSave('retry')).toBe(true); });
    expect(ref.current?.hasUnsavedChanges()).toBe(false);
    expect(screen.getByRole('button', { name: 'saved' })).toBeTruthy();
  });
  it('does not report cursor movement as an unsaved edit', async () => {
    render(<SlateEditor document={null} initialContent={content} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { Transforms.select(editor, { path: [0, 0], offset: 0 }); });
    expect(screen.getByRole('button', { name: 'saved' })).toBeTruthy();
  });

  it('propagates the asynchronous result through the public React editor', async () => {
    const pending = deferred();
    render(<DocxEditor showFileUpload={false} initialContent={content} onVersionSave={() => pending.promise} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'dirty' }));
    expect(screen.getByRole('button', { name: 'dirty' })).toBeTruthy();
    await act(async () => { pending.resolve(false); });
    expect(screen.getByRole('button', { name: 'dirty' })).toBeTruthy();
  });

  it('exposes live dirty before the debounced content event and keeps it on EDIT revoke', async () => {
    const pending = deferred();
    const ref = createRef<SlateEditorRef>();
    const save = () => pending.promise;
    const { rerender } = render(<SlateEditor ref={ref} document={null} initialContent={content} onVersionSave={save} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await edit();
    expect(ref.current?.hasUnsavedChanges()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'dirty' }));
    rerender(<SlateEditor ref={ref} document={null} initialContent={content} onVersionSave={save} readOnly />);
    await act(async () => { pending.resolve(true); });
    expect(ref.current?.hasUnsavedChanges()).toBe(true);
  });

  it('keeps dirty during a pending save and after rejection, then permits retry', async () => {
    const pending = deferred();
    const save = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(true);
    render(<SlateEditor document={null} initialContent={content} onVersionSave={save} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'dirty' }));
    expect(screen.getByRole('button', { name: 'dirty' })).toBeTruthy();
    await act(async () => { pending.reject(new Error('timeout')); });
    expect(screen.getByRole('button', { name: 'dirty' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'dirty' })); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'saved' })).toBeTruthy();
  });
  it('does not acknowledge edits made after the submitted snapshot', async () => {
    const pending = deferred();
    render(<SlateEditor document={null} initialContent={content} onVersionSave={() => pending.promise} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await edit('first');
    fireEvent.click(screen.getByRole('button', { name: 'dirty' }));
    await edit('second');
    await act(async () => { pending.resolve(true); });
    expect(screen.getByRole('button', { name: 'dirty' })).toBeTruthy();
  });
  it('keeps a failed acknowledgement dirty and suppresses duplicate pending saves', async () => {
    const pending = deferred();
    const save = vi.fn(() => pending.promise);
    render(<SlateEditor document={null} initialContent={content} onVersionSave={save} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'dirty' }));
    fireEvent.click(screen.getByRole('button', { name: 'dirty' }));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(false); });
    expect(screen.getByRole('button', { name: 'dirty' })).toBeTruthy();
  });
  it('does not let a previous content save clear a new document revision', async () => {
    const pending = deferred();
    const save = () => pending.promise;
    const { rerender } = render(<SlateEditor document={null} initialContent={content} onVersionSave={save} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'dirty' }));
    rerender(<SlateEditor document={null} initialContent={[{ type: 'paragraph', children: [{ text: 'Other document' }] }]} onVersionSave={save} />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await edit('new edit');
    await act(async () => { pending.resolve(true); });
    expect(screen.getByRole('button', { name: 'dirty' })).toBeTruthy();
  });
});
