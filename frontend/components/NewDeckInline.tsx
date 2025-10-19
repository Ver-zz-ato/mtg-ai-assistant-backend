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
    <div className="flex items-center gap-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !busy && title.trim() && create()}
        placeholder="Enter deck name..."
        className="rounded-lg border-2 border-neutral-700 focus:border-blue-500 bg-black/40 px-4 py-2 outline-none text-sm transition-colors"
        aria-label="New deck name"
        autoFocus
      />
      <button 
        onClick={create} 
        disabled={busy || !title.trim()} 
        className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold shadow-lg transition-all text-sm"
      >
        {busy ? "Creating…" : "✨ Create Deck"}
      </button>
    </div>
  );
}
