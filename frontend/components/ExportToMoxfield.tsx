// components/ExportToMoxfield.tsx
"use client";
import { useState } from "react";

export default function ExportToMoxfield({ deckId, className }: { deckId: string; className?: string }) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const res = await fetch(`/api/decks/${deckId}/export/moxfield`, { cache: "no-store" });
      const json = await res.json();
      
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      // Copy decklist to clipboard
      await navigator.clipboard.writeText(json.text || "");
      
      // Show success message
      alert(`✓ Decklist copied to clipboard!\n\nOpening Moxfield - create a new deck and paste the decklist there.`);
      
      // Open Moxfield homepage (users can navigate to create a deck and paste)
      window.open("https://www.moxfield.com", "_blank");
    } catch (e: any) {
      console.error(e);
      alert(`Export failed: ${e.message || "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={busy}
      className={className || "px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg border border-purple-500/50 flex items-center gap-2 disabled:opacity-50"}
    >
      <span>💎</span>
      <span>{busy ? "Copying..." : "Moxfield"}</span>
    </button>
  );
}


