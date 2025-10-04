// components/CollectionCsvUpload.tsx
"use client";
import { useState, useRef } from "react";
import { capture } from "@/lib/ph";
import { trackCollectionImportWorkflow } from '@/lib/analytics-workflow';

export default function CollectionCsvUpload({ collectionId, onDone }: { collectionId: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{added:number;updated:number;skipped:string[];total:number} | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onPick() {
    trackCollectionImportWorkflow('started');
    inputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      trackCollectionImportWorkflow('abandoned', { current_step: 2, abandon_reason: 'no_file' });
      return;
    }
    
    trackCollectionImportWorkflow('file_selected', { file_name: file.name, file_size: file.size });
    setBusy(true);
    setReport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("collectionId", collectionId);
      
      trackCollectionImportWorkflow('uploaded');
      const res = await fetch("/api/collections/upload-csv", { method: "POST", body: fd });
      const json = await res.json();
      
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      
      setReport(json.report);
      trackCollectionImportWorkflow('completed', { 
        cards_added: json.report.added,
        cards_updated: json.report.updated,
        total_processed: json.report.total 
      });
      
      onDone?.(); // notify parent to reload list
      // Broadcast as safety: another tab or nested component can listen
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("collection:csv-imported", { detail: { collectionId } }));
        try { capture("collection_imported"); } catch {}
      }
    } catch (e: any) {
      trackCollectionImportWorkflow('abandoned', { current_step: 3, abandon_reason: 'upload_failed' });
      alert(e?.message || "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
      <button onClick={onPick} disabled={busy} className="text-xs border rounded px-2 py-1">
        {busy ? "Uploading…" : "Upload CSV"}
      </button>
      {report && (
        <span className="text-xs text-muted-foreground">
          Imported {report.added + report.updated}/{report.total}
          {report.skipped?.length ? ` • skipped ${report.skipped.length}` : ""}
        </span>
      )}
    </div>
  );
}
