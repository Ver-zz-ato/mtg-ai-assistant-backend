"use client";
import React, { useEffect, useState } from "react";

import Tooltip from "@/components/Tooltip";
import { AUTH_MESSAGES, showAuthToast } from "@/lib/auth-messages";

export default function LikeButton({ deckId }: { deckId: string }) {
  const [count, setCount] = useState<number>(0);
  const [liked, setLiked] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/decks/${deckId}/likes`, { cache: 'no-store' });
        const j = await r.json().catch(()=>({}));
        if (r.ok && j?.ok) { 
          setCount(j.count||0); 
          setLiked(!!j.liked);
          // If we got a response with liked status, user is authenticated
          setIsAuthenticated(true);
        } else if (r.status === 401) {
          setIsAuthenticated(false);
        }
      } catch {}
    })();
  }, [deckId]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    if (busy) return;
    
    // Check if user is authenticated
    if (isAuthenticated === false) {
      await showAuthToast(AUTH_MESSAGES.LIKE_DECKS);
      return;
    }
    
    setBusy(true);
    try {
      const r = await fetch(`/api/decks/${deckId}/likes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle' }) });
      const j = await r.json().catch(()=>({}));
      if (r.status === 401) {
        await showAuthToast(AUTH_MESSAGES.LIKE_DECKS);
        setIsAuthenticated(false);
      } else if (r.ok && j?.ok) { 
        setCount(j.count||0); 
        setLiked(!!j.liked); 
      }
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
