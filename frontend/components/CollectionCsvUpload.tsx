// components/CollectionCsvUpload.tsx
"use client";
import { useState, useRef } from "react";
import { capture } from "@/lib/ph";
import { trackCollectionImportWorkflow } from '@/lib/analytics-workflow';

export default function CollectionCsvUpload({ collectionId, onDone }: { collectionId: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{added:number;updated:number;skipped:string[];total:number;parser?:any} | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onPick() {
    trackCollectionImportWorkflow('started');
    inputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      trackCollectionImportWorkflow('abandoned', { current_step: 2, abandon_reason: 'no_file' });
      return;
    }
    
    const { toast } = await import('@/lib/toast-client');
    
    trackCollectionImportWorkflow('file_selected', { file_name: file.name, file_size: file.size });
    setBusy(true);
    setReport(null);
    setProgress(0);
    setStatusText('Preparing upload...');
    
    try {
      // If collectionId is 'prompt', create a new collection from filename
      let targetCollectionId = collectionId;
      
      if (collectionId === 'prompt') {
        setProgress(10);
        setStatusText('Creating new collection...');
        
        // Extract collection name from filename
        const collectionName = file.name.replace(/\.csv$/i, '').replace(/[_-]/g, ' ').trim() || 'Imported Collection';
        
        const createRes = await fetch('/api/collections/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: collectionName }),
        });
        
        const createJson = await createRes.json();
        if (!createRes.ok || !createJson?.ok) {
          throw new Error(createJson?.error || 'Failed to create collection');
        }
        
        targetCollectionId = createJson.id; // API returns { ok: true, id: "..." }
        console.log('Created new collection:', targetCollectionId, collectionName);
      }
      
      setProgress(25); // File selected
      setStatusText('Uploading file...');
      const fd = new FormData();
      fd.append("file", file);
      fd.append("collectionId", targetCollectionId);
      
      setProgress(50); // Uploading
      setStatusText('Processing cards...');
      trackCollectionImportWorkflow('uploaded');
      const res = await fetch("/api/collections/upload-csv", { method: "POST", body: fd });
      setProgress(75); // Processing
      const json = await res.json();
      
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      
      setProgress(90);
      setStatusText('Finalizing...');
      setReport(json.report);
      trackCollectionImportWorkflow('completed', { 
        cards_added: json.report.added,
        cards_updated: json.report.updated,
        total_processed: json.report.total 
      });
      
      setProgress(100);
      setStatusText('Complete!');
      toast(`✅ Collection imported! ${json.report.added + json.report.updated} cards processed.`, 'success');
      
      // Small delay then redirect
      setTimeout(() => {
        if (collectionId === 'prompt') {
          // Navigate to the new collection
          window.location.href = `/collections/${targetCollectionId}`;
        } else {
          // Force refresh to show new cards
          window.location.reload();
        }
      }, 1000);
      
      onDone?.(); // notify parent to reload list
      // Broadcast as safety: another tab or nested component can listen
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("collection:csv-imported", { detail: { collectionId: targetCollectionId } }));
        try { capture("collection_imported"); } catch {}
      }
    } catch (e: any) {
      trackCollectionImportWorkflow('abandoned', { current_step: 3, abandon_reason: 'upload_failed' });
      toast(e?.message || "Upload failed", 'error');
      setBusy(false);
      setStatusText('');
      setProgress(0);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
        <button onClick={onPick} disabled={busy} className="text-xs border rounded px-2 py-1 min-w-[100px]">
          {busy ? (
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              {Math.round(progress)}%
            </span>
          ) : (
            "Import CSV"
          )}
        </button>
        {report && !busy && (
          <span className="text-xs text-muted-foreground">
            Imported {report.added + report.updated}/{report.total}
            {report.skipped?.length ? ` • skipped ${report.skipped.length}` : ""}
          </span>
        )}
        {busy && statusText && (
          <span className="text-xs text-gray-400 animate-pulse">{statusText}</span>
        )}
      </div>
      
      {/* Progress bar */}
      {busy && (
        <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-blue-600 to-purple-600 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      
      {/* Format detection notice */}
      {report?.parser?.detectedFormat && (
        <div className="text-xs text-green-400">
          ✓ Detected {report.parser.detectedFormat.replace(/-/g, ' ')} format
        </div>
      )}
      
      {/* Supported formats info */}
      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer hover:text-gray-300">Supported formats</summary>
        <div className="mt-1 space-y-1 pl-4">
          <div>• TCGPlayer exports</div>
          <div>• CardKingdom exports</div>
          <div>• Moxfield exports</div>
          <div>• Archidekt exports</div>
          <div>• Generic CSV (name, quantity columns)</div>
          <div>• Plain text (e.g., "2 Lightning Bolt")</div>
        </div>
      </details>
    </div>
  );
}
