// components/ExportDeckCSV.tsx
"use client";
import { useState } from "react";

type Props = { deckId: string; filename?: string; small?: boolean };

export default function ExportDeckCSV({ deckId, filename = "deck.csv", small }: Props) {
  const [busy, setBusy] = useState(false);

  async function onExport() {
    setBusy(true);
    try {
      const res = await fetch(`/api/decks/${deckId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const title = json.deck?.title || "Deck";
      const rows = [["Name", "Qty"], ...(json.cards || []).map((c: any) => [c.name, String(c.qty)])];
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
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
      console.error(e);
      alert("Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={onExport} disabled={busy} className={small ? "text-xs underline" : "border rounded px-2 py-1 text-xs"}>
      {busy ? "Exporting…" : "Export CSV"}
    </button>
  );
}
