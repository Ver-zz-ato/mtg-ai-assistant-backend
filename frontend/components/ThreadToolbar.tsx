'use client';

import { useRef } from 'react';
import { renameThread, deleteThread, linkThread } from '@/lib/threads';

type Props = {
  threadId: string | null | undefined;
  onChanged?: () => void;
};

export default function ThreadToolbar({ threadId, onChanged }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const ensure = () => {
    if (!threadId) {
      alert('No thread yet. Send a message first to create it.');
      return false;
    }
    return true;
  };

  const onRename = async () => {
    if (!ensure()) return;
    const title = prompt('New thread title?');
    if (!title) return;
    await renameThread(threadId as string, title).catch(e => alert(e.message));
    onChanged?.();
  };

  const onLink = async () => {
    if (!ensure()) return;
    const deckId = prompt('Deck ID to link (UUID). Leave empty to unlink.') || '';
    await linkThread(threadId as string, deckId.trim() || null).catch(e => alert(e.message));
    onChanged?.();
  };

  const onDelete = async () => {
    if (!ensure()) return;
    if (!confirm('Delete this thread? This cannot be undone.')) return;
    await deleteThread(threadId as string).catch(e => alert(e.message));
    onChanged?.();
  };

  const onExport = async () => {
    if (!ensure()) return;
    const res = await fetch('/api/chat/messages/list?threadId=' + threadId);
    const data = await res.json();
    if (!data?.ok) return alert(data?.error?.message || 'Failed to export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `thread-${threadId}.json`;
    a.click();
  };

  const onImportClick = () => fileRef.current?.click();

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    let data: any;
    try { data = JSON.parse(text); } catch { alert('Invalid JSON'); return; }
    const msgs = data?.messages;
    if (!Array.isArray(msgs) || msgs.length === 0) {
      alert('Expected { ok:true, messages:[...] } from a previous export');
      return;
    }
    if (!ensure()) return;
    // NOTE: server-side import endpoint not included; this is a placeholder UX.
    alert('Import file parsed. Add /api/chat/threads/import if you want server-side insert.');
  };

  const btn = 'px-2 py-1 rounded-md border border-gray-800 text-sm hover:bg-gray-800';
  const danger = 'px-2 py-1 rounded-md border border-red-800 text-sm text-red-300 hover:bg-red-900/20';

  return (
    <div className="flex items-center gap-2">
      <button className={btn} onClick={onRename} title="Rename this thread">Rename</button>
      <button className={btn} onClick={onLink} title="Link to a deck">Link deck to this chat</button>
      <button className={danger} onClick={onDelete} title="Delete this thread">Delete</button>
      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onImportFile} />
    </div>
  );
}
