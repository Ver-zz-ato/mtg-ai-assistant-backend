// components/ExportDeckCSV.tsx
"use client";
import { useState } from "react";
import { track } from "@/lib/analytics/track";
import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/hooks/useProStatus";

type Props = { deckId: string; filename?: string; small?: boolean; className?: string };

export default function ExportDeckCSV({ deckId, filename = "deck.csv", small, className }: Props) {
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const { isPro } = useProStatus();

  async function onExport() {
    // Track UI click
    track('ui_click', {
      area: 'deck',
      action: 'export',
      deckId: deckId,
      export_type: 'csv',
    }, {
      userId: user?.id || null,
      isPro: isPro,
    });
    setBusy(true);
    try {
      const res = await fetch(`/api/decks/${deckId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const title: string = json.deck?.title || "Deck";
      const commander: string = json.deck?.commander || "";
      const cards: any[] = json.cards || [];

      // Format decklist: commander first, then cards
      let decklistText = commander || "";
      for (const card of cards) {
        if (card.name.toLowerCase() !== commander.toLowerCase()) {
          decklistText += `\n${card.qty} ${card.name}`;
        }
      }

      // CSV format matching import format: title,commander,decklist
      const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
      const csv = `title,commander,decklist\n${esc(title)},${esc(commander)},${esc(decklistText)}`;

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `${title}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={onExport} disabled={busy} className={className || (small ? "text-xs underline" : "border rounded px-2 py-1 text-xs") }>
      {busy ? "Exporting…" : "Export CSV"}
    </button>
  );
}
