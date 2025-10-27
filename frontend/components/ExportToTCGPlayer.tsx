// components/ExportToTCGPlayer.tsx
"use client";
import { useState } from "react";

export default function ExportToTCGPlayer({ deckId, className }: { deckId: string; className?: string }) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const res = await fetch(`/api/decks/${deckId}/export/tcgplayer`, { cache: "no-store" });
      const json = await res.json();
      
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      // Copy decklist to clipboard
      await navigator.clipboard.writeText(json.text || "");
      
      // Show success message
      alert(`✓ Decklist copied to clipboard!\n\nNow opening TCGPlayer where you can use the Mass Entry tool to paste it.`);
      
      // Open TCGPlayer mass entry (they'll need to navigate to it or we can link to the main shop)
      window.open("https://shop.tcgplayer.com/massentry", "_blank");
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
      className={className || "px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg border border-amber-500/50 flex items-center gap-2 disabled:opacity-50"}
    >
      <span>💎</span>
      <span>{busy ? "Copying..." : "TCGPlayer"}</span>
    </button>
  );
}


