// components/DeckCsvUpload.tsx
"use client";
import { useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { emitDeckChanged } from "@/components/deckEvents";

export default function DeckCsvUpload({ deckId, onDone }: { deckId: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{added:number;updated:number;skipped:string[];total:number} | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1400);
  }

  function pick() { inputRef.current?.click(); }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setReport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("deckId", deckId);
      const res = await fetch("/api/decks/upload-csv", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setReport(json.report || null);
      showToast("CSV imported");

      try { emitDeckChanged({ deckId }); } catch {}
      const url = `${pathname}?r=${Date.now()}`;
      try { router.replace(url); } catch {}
      try { router.refresh(); } catch {}

      onDone?.();
    } catch (e:any) {
      alert(e?.message || "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onChange} />
      <button onClick={pick} disabled={busy} className="text-xs border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 rounded px-2.5 py-1.5 transition-colors font-medium text-neutral-300 disabled:opacity-50">
        {busy ? "Importing…" : "Import deck from CSV"}
      </button>
      {report && (
        <span className="text-xs text-muted-foreground">
          Imported {report.added + report.updated}/{report.total}{report.skipped?.length ? ` • skipped ${report.skipped.length}` : ""}
        </span>
      )}
      {toast && (
        <span className="pointer-events-none absolute -bottom-8 right-0 rounded bg-black/80 text-white text-xs px-2 py-1 shadow">{toast}</span>
      )}
    </div>
  );
}
