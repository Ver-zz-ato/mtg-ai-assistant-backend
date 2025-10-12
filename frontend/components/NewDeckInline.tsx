// components/NewDeckInline.tsx
"use client";
import * as React from "react";
import { trackValueMomentReached, startSession, endSession } from '@/lib/analytics-enhanced';
import { trackFirstAction } from '@/lib/analytics-enhanced';

export default function NewDeckInline() {
  const [title, setTitle] = React.useState(""); 
  const [busy, setBusy] = React.useState(false);

  async function create() {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    
    // Start deck creation session tracking
    startSession('deck_creation');
    
    try {
      const res = await fetch("/api/decks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.id) throw new Error(json?.error || `HTTP ${res.status}`);
      
      // Track successful deck creation
      trackValueMomentReached('first_deck_created');
      trackFirstAction('deck_create', { deck_title: t });
      
      // End session successfully
      endSession('deck_creation', { 
        success: true, 
        deck_id: json.id,
        deck_title: t 
      });
      
      window.location.href = `/my-decks/${encodeURIComponent(json.id)}`;
    } catch (e:any) {
      // End session with failure
      endSession('deck_creation', { 
        success: false, 
        error: e?.message || 'unknown_error' 
      });
      
      alert(e?.message || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New deck name"
        className="rounded border border-neutral-700 bg-black/40 px-3 py-1 outline-none text-sm"
        aria-label="New deck name"
      />
      <button onClick={create} disabled={busy} className="text-sm underline underline-offset-4">
        {busy ? "Creating…" : "Create new deck"}
      </button>
    </div>
  );
}
