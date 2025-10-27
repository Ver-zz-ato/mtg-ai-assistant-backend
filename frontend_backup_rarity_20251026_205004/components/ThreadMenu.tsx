'use client';
import React, { useState, useEffect } from 'react';
import { renameThread, deleteThread, linkThread } from '@/lib/threads';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function ThreadMenu({
  threadId,
  onChanged,
  onDeleted,
  onNewChat,
  deckId,
}: {
  threadId: string | null;
  onChanged?: () => void;
  onDeleted?: () => void;
  onNewChat?: () => void;
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

  const [linkMode, setLinkMode] = useState(false);
  const [linked, setLinked] = useState<boolean>(!!deckId);
  const [choices, setChoices] = useState<Array<{ id: string; title: string }>>([]);
  const [sel, setSel] = useState<string>("");

  async function openLink() {
    if (!threadId) return;
    setLinkMode(v => !v);
    if (choices.length === 0) {
      try {
        const sb = createBrowserSupabaseClient();
        const { data: userRes } = await sb.auth.getUser();
        const uid = userRes?.user?.id; if (!uid) return;
        const { data } = await sb.from('decks').select('id,title').eq('user_id', uid).order('created_at', { ascending: false });
        setChoices((data as any[])?.map(d => ({ id: d.id, title: d.title })) ?? []);
      } catch {}
    }
  }

  async function saveLink() {
    if (!threadId) return;
    setBusy(true);
    try {
      await linkThread(threadId, sel || null);
      setLinked(!!sel);
      setLinkMode(false);
      onChanged?.();
    } finally { setBusy(false); }
  }

  // probe deck link if not provided
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (!threadId) { setLinked(false); return; }
      try {
        const r = await fetch('/api/chat/threads/get', { cache: 'no-store' });
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
      <button className="px-3 py-1 rounded bg-green-700 hover:bg-green-600 text-white" onClick={onNewChat} data-testid="new-chat-button">
        New Chat
      </button>
      <button className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50" onClick={doRename} disabled={disabled} data-testid="thread-action">
        Rename
      </button>
      <button className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50" onClick={doDelete} disabled={disabled} data-testid="thread-action">
        Delete
      </button>
      <button className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50" onClick={openLink} disabled={disabled} data-testid="thread-action" title={linked ? 'Change link' : 'Link to deck'}>
        {linked ? 'Change link' : 'Link deck'}
      </button>
      {linkMode && (
        <div className="flex items-center gap-2">
          <select className="rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-xs" value={sel} onChange={(e)=>setSel(e.target.value)}>
            <option value="">— Unlink —</option>
            {choices.map(c => (<option key={c.id} value={c.id}>{c.title}</option>))}
          </select>
          <button className="px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white text-xs" onClick={saveLink} disabled={busy}>Save</button>
          <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs" onClick={()=>setLinkMode(false)} disabled={busy}>Cancel</button>
        </div>
      )}
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-neutral-700 ml-1" title={linked ? 'Deck linked' : 'No deck linked'}>
        <span className={linked ? 'text-green-400' : 'text-neutral-500'}>🔗</span>
        <span className="opacity-70">{linked ? 'linked' : 'not linked'}</span>
      </span>
    </div>
  );
}
