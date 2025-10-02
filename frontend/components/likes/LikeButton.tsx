"use client";
import React, { useEffect, useState } from "react";

import Tooltip from "@/components/Tooltip";

export default function LikeButton({ deckId }: { deckId: string }) {
  const [count, setCount] = useState<number>(0);
  const [liked, setLiked] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/decks/${deckId}/likes`, { cache: 'no-store' });
        const j = await r.json().catch(()=>({}));
        if (r.ok && j?.ok) { setCount(j.count||0); setLiked(!!j.liked); }
      } catch {}
    })();
  }, [deckId]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    if (busy) return; setBusy(true);
    try {
      const r = await fetch(`/api/decks/${deckId}/likes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle' }) });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j?.ok) { setCount(j.count||0); setLiked(!!j.liked); }
    } catch {}
    setBusy(false);
  }

  return (
    <Tooltip content={liked ? 'Unlike this deck' : 'Like this deck'}>
      <button onClick={toggle} disabled={busy} className={`text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700`}>
        ❤ <span className={liked ? 'text-red-400' : 'text-neutral-200'}>{count}</span>
      </button>
    </Tooltip>
  );
}
