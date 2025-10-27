// components/ExportCollectionCSV.tsx
"use client";
import { useState } from "react";

type Props = { collectionId: string; filename?: string; small?: boolean };

export default function ExportCollectionCSV({ collectionId, filename = "collection.csv", small }: Props) {
  const [busy, setBusy] = useState(false);

  async function onExport() {
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      const items: Array<{ name: string; qty: number }> = (json.items || json.cards || []).map((x: any) => ({
        name: String(x.name),
        qty: Number(x.qty ?? 0),
      }));

      const head: string[] = ["Name", "Qty"];
      const body: string[][] = items.map((i) => [i.name, String(i.qty)]);
      const rows: string[][] = [head, ...body];

      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const csv: string = rows.map((r: string[]) => r.map((v: string) => esc(v)).join(",")).join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
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
