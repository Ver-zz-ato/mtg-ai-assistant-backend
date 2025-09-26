'use client';
import React, { useState, useEffect } from 'react';
import { renameThread, deleteThread, linkThread } from '@/lib/threads';

export default function ThreadMenu({
  threadId,
  onChanged,
  onDeleted,
  deckId,
}: {
  threadId: string | null;
  onChanged?: () => void;
  onDeleted?: () => void;
  deckId?: string | null;
}) {
  const [busy, setBusy] = useState(false);

  async function doRename() {
    const t = prompt('Rename thread to:');
    if (!t || !threadId) return;
    setBusy(true);
    try {
      await renameThread(threadId, t);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!threadId) return;
    if (!confirm('Delete this thread?')) return;
    setBusy(true);
    try {
      await deleteThread(threadId);
      onDeleted?.();
    } finally {
      setBusy(false);
    }
  }

  async function doLink() {
    if (!threadId) return;
    const deck = prompt('Enter deck ID to link (UUID):', deckId || '');
    if (!deck) return;
    setBusy(true);
    try {
      await linkThread(threadId, deck);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  const [linked, setLinked] = useState<boolean>(!!deckId);

  // probe deck link if not provided
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (!threadId) { setLinked(false); return; }
      try {
        const r = await fetch('/api/chat/threads/get');
        const j = await r.json().catch(() => ({}));
        const one = (Array.isArray(j?.threads) ? j.threads : Array.isArray(j?.data) ? j.data : []).find((t:any)=>t.id===threadId);
        if (!cancelled) setLinked(!!one?.deck_id);
      } catch {}
    }
    probe();
    return () => { cancelled = true; };
  }, [threadId]);

  const disabled = !threadId || busy;

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <button className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50" onClick={doRename} disabled={disabled} data-testid="thread-action">
        Rename
      </button>
      <button className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50" onClick={doDelete} disabled={disabled} data-testid="thread-action">
        Delete
      </button>
      <button className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50" onClick={doLink} disabled={disabled} data-testid="thread-action" title={linked ? 'Change deck link' : 'Link to deck'}>
        {linked ? 'Change link' : 'Link deck'}
      </button>
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-neutral-700 ml-1" title={linked ? 'Deck linked' : 'No deck linked'}>
        <span className={linked ? 'text-green-400' : 'text-neutral-500'}>🔗</span>
        <span className="opacity-70">{linked ? 'linked' : 'not linked'}</span>
      </span>
    </div>
  );
}
