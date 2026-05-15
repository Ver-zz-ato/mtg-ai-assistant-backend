"use client";
import { useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { emitDeckChanged } from "@/components/deckEvents";

type DeckCsvReport = {
  added: number;
  updated: number;
  skipped: string[];
  total: number;
  imported?: number;
  unrecognizedCards?: Array<{ originalName: string; qty: number; suggestions: string[] }>;
};

export default function DeckCsvUpload({ deckId, onDone, onFixNames }: { deckId: string; onDone?: () => void; onFixNames?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<DeckCsvReport | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showFixPrompt, setShowFixPrompt] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1400);
  }

  function pick() {
    inputRef.current?.click();
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setReport(null);
    setShowFixPrompt(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("deckId", deckId);
      const res = await fetch("/api/decks/upload-csv", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setReport(json.report || null);

      const unresolvedCount = Number(json.report?.unrecognizedCards?.length || 0);
      if (unresolvedCount > 0) {
        setShowFixPrompt(true);
        showToast(`${unresolvedCount} cards need attention!`);
      } else if (json.report?.skipped?.length > 0) {
        showToast(`Imported with ${json.report.skipped.length} database issue${json.report.skipped.length === 1 ? "" : "s"}.`);
      } else {
        showToast("CSV imported successfully!");
      }

      try { emitDeckChanged({ deckId }); } catch {}
      const url = `${pathname}?r=${Date.now()}`;
      try { router.replace(url); } catch {}
      try { router.refresh(); } catch {}

      onDone?.();
    } catch (err: any) {
      alert(err?.message || "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onChange} />
        <button onClick={pick} disabled={busy} className="text-xs border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 rounded px-2.5 py-1.5 transition-colors font-medium text-neutral-300 disabled:opacity-50">
          {busy ? "Importing..." : "Import deck from CSV"}
        </button>
        {report && !showFixPrompt && (
          <span className="text-xs text-muted-foreground">
            Imported {report.imported ?? report.added + report.updated}/{report.total}
          </span>
        )}
      </div>

      {showFixPrompt && report?.unrecognizedCards && report.unrecognizedCards.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-orange-500/60 bg-gradient-to-r from-orange-900/40 to-red-900/40 text-xs">
          <span className="text-orange-400 font-medium">
            {report.unrecognizedCards.length} card{report.unrecognizedCards.length !== 1 ? "s" : ""} couldn't be matched
          </span>
          {onFixNames ? (
            <button
              onClick={() => { setShowFixPrompt(false); onFixNames(); }}
              className="px-2 py-1 rounded bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-semibold transition-all hover:scale-105"
            >
              Fix now - Free!
            </button>
          ) : (
            <span className="text-orange-300">Use "Fix card names" button to resolve</span>
          )}
          <button onClick={() => setShowFixPrompt(false)} className="ml-auto text-orange-400/60 hover:text-orange-400">X</button>
        </div>
      )}

      {toast && (
        <span className="pointer-events-none absolute -bottom-8 right-0 rounded bg-black/80 text-white text-xs px-2 py-1 shadow">{toast}</span>
      )}
    </div>
  );
}
