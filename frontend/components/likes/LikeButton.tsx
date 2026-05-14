"use client";
import React, { useEffect, useState } from "react";

import Tooltip from "@/components/Tooltip";
import { AUTH_MESSAGES, showAuthToast } from "@/lib/auth-messages";
import { track } from "@/lib/analytics/track";
import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/hooks/useProStatus";

type BatchLikeResult = { count: number; liked: boolean; authenticated: boolean };
type BatchLikeResolve = (value: BatchLikeResult | null) => void;

const pendingLikeRequests = new Map<string, BatchLikeResolve[]>();
let pendingLikeTimer: ReturnType<typeof setTimeout> | null = null;

function fetchLikeSummary(deckId: string): Promise<BatchLikeResult | null> {
  return new Promise((resolve) => {
    const existing = pendingLikeRequests.get(deckId);
    if (existing) existing.push(resolve);
    else pendingLikeRequests.set(deckId, [resolve]);

    if (pendingLikeTimer) return;
    pendingLikeTimer = setTimeout(async () => {
      const batch = Array.from(pendingLikeRequests.entries());
      pendingLikeRequests.clear();
      pendingLikeTimer = null;

      const ids = batch.map(([id]) => id);
      try {
        const r = await fetch(`/api/decks/likes?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const authenticated = !!j?.authenticated;
        for (const [id, resolvers] of batch) {
          const item = j?.likes?.[id];
          const value = r.ok && j?.ok && item
            ? { count: Number(item.count || 0), liked: !!item.liked, authenticated }
            : null;
          resolvers.forEach((fn) => fn(value));
        }
      } catch {
        for (const [, resolvers] of batch) resolvers.forEach((fn) => fn(null));
      }
    }, 20);
  });
}

export default function LikeButton({ deckId }: { deckId: string }) {
  const [count, setCount] = useState<number>(0);
  const [liked, setLiked] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const { user } = useAuth();
  const { isPro } = useProStatus();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const summary = await fetchLikeSummary(deckId);
      if (cancelled || !summary) return;
      setCount(summary.count);
      setLiked(summary.liked);
      setIsAuthenticated(summary.authenticated);
    })();
    return () => { cancelled = true; };
  }, [deckId]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    if (busy) return;
    
    // Track UI click
    track('ui_click', {
      area: 'deck',
      action: 'like',
      deckId: deckId,
    }, {
      userId: user?.id || null,
      isPro: isPro,
    });
    
    // Check if user is authenticated
    if (isAuthenticated === false) {
      await showAuthToast(AUTH_MESSAGES.LIKE_DECKS);
      return;
    }
    
    // Optimistic update - instant UI feedback
    const previousLiked = liked;
    const previousCount = count;
    const newLiked = !liked;
    const newCount = newLiked ? count + 1 : count - 1;
    
    setLiked(newLiked);
    setCount(newCount);
    setBusy(true);
    
    try {
      const r = await fetch(`/api/decks/${deckId}/likes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle' }) });
      const j = await r.json().catch(()=>({}));
      
      if (r.status === 401) {
        // Revert on auth failure
        setLiked(previousLiked);
        setCount(previousCount);
        await showAuthToast(AUTH_MESSAGES.LIKE_DECKS);
        setIsAuthenticated(false);
      } else if (!r.ok || !j?.ok) {
        // Revert on error and keep optimistic state with retry option
        setLiked(previousLiked);
        setCount(previousCount);
        
        // Show toast with retry (using simple alert for now, can be enhanced)
        const retry = confirm(`Failed to ${newLiked ? 'like' : 'unlike'} deck. Retry?`);
        if (retry) {
          toggle(e); // Retry the action
        }
      } else {
        // Success - update with server values to ensure consistency
        setCount(j.count || 0);
        setLiked(!!j.liked);
      }
    } catch (err) {
      // Revert on network error
      setLiked(previousLiked);
      setCount(previousCount);
      
      const retry = confirm(`Network error. Retry?`);
      if (retry) {
        toggle(e);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tooltip content={liked ? 'Unlike this deck' : 'Like this deck'}>
      <button onClick={toggle} disabled={busy} className={`text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700`}>
        ❤ <span className={liked ? 'text-red-400' : 'text-neutral-200'}>{count}</span>
      </button>
    </Tooltip>
  );
}
