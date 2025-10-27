// components/CopyDecklistButton.tsx
"use client";
import { useState } from "react";

export default function CopyDecklistButton({ deckId, small, className }: { deckId: string; small?: boolean; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  async function onCopy() {
    setBusy(true); setOk(false);
    try {
      const res = await fetch(`/api/decks/${deckId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      let text: string = json.deck?.deck_text || "";
      if (!text?.trim() && Array.isArray(json.cards)) {
        text = json.cards.map((c: any) => `${c.qty} ${c.name}`).join("\n");
      }
      await navigator.clipboard.writeText(text || "");
      setOk(true);
      setTimeout(() => setOk(false), 1200);
    } catch (e) {
      console.error(e);
      alert("Copy failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={onCopy} disabled={busy} className={className || (small ? "text-xs underline" : "border rounded px-2 py-1 text-xs") }>
      {ok ? "Copied!" : busy ? "Copying…" : "Copy decklist"}
    </button>
  );
}
