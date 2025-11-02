"use client";
import React from "react";
import { track } from "@/lib/analytics/track";
import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/hooks/useProStatus";

export default function PinDeckButton({ deckId, pinned, currentPinned }: { deckId: string; pinned: boolean; currentPinned: string[] }){
  const [busy, setBusy] = React.useState(false);
  const { user } = useAuth();
  const { isPro } = useProStatus();
  
  async function toggle(){
    if (busy) return;
    
    // Track UI click
    track('ui_click', {
      area: 'deck',
      action: 'pin',
      deckId: deckId,
    }, {
      userId: user?.id || null,
      isPro: isPro,
    });
    const next = new Set(currentPinned);
    if (pinned) { next.delete(deckId); }
    else {
      if (currentPinned.length >= 3 && !next.has(deckId)) { alert('You can pin up to 3 decks.'); return; }
      next.add(deckId);
    }
    setBusy(true);
    try{
      const r = await fetch('/api/profile/pins', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ pinned_deck_ids: Array.from(next) }) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Failed');
      window.location.reload();
    } catch(e:any){ alert(e?.message||'Failed to update pins'); } finally { setBusy(false); }
  }
  return (
    <button onClick={toggle} disabled={busy} title={pinned? 'Unpin':'Pin'} className={`text-xs px-2 py-1 rounded border ${pinned? 'border-amber-400 text-amber-300':'border-neutral-700 text-neutral-200'} hover:bg-neutral-900`}>
      {pinned? 'Pinned':'Pin'}
    </button>
  );
}