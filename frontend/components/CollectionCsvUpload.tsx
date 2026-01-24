// components/CollectionCsvUpload.tsx
"use client";
import { useState, useRef } from "react";
import { capture } from "@/lib/ph";
import { trackCollectionImportWorkflow } from '@/lib/analytics-workflow';
import CollectionImportPreview, { PreviewCard } from './CollectionImportPreview';

type ImportMode = 'new' | 'existing';

export default function CollectionCsvUpload({ 
  collectionId, 
  onDone, 
  mode = 'existing' 
}: { 
  collectionId: string; 
  onDone?: () => void; 
  mode?: ImportMode;
}) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{added:number;updated:number;skipped:string[];total:number;parser?:any} | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewCards, setPreviewCards] = useState<PreviewCard[]>([]);
  const [targetCollectionId, setTargetCollectionId] = useState<string>('');
  const [collectionName, setCollectionName] = useState<string>('');
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
    setStatusText('Parsing CSV...');
    
    try {
      let actualCollectionId = collectionId;
      let actualCollectionName = '';
      
      // For 'new' mode, always create a new collection from filename
      if (mode === 'new' || collectionId === 'prompt') {
        setProgress(10);
        setStatusText('Creating new collection...');
        
        // Extract collection name from filename
        actualCollectionName = file.name.replace(/\.csv$/i, '').replace(/[_-]/g, ' ').trim() || 'Imported Collection';
        
        const createRes = await fetch('/api/collections/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: actualCollectionName }),
        });
        
        const createJson = await createRes.json();
        if (!createRes.ok || !createJson?.ok) {
          throw new Error(createJson?.error || 'Failed to create collection');
        }
        
        actualCollectionId = createJson.id;
        console.log('Created new collection:', actualCollectionId, actualCollectionName);
      } else {
        // Get collection name for existing collection
        const colRes = await fetch(`/api/collections/list`);
        const colJson = await colRes.json();
        if (colRes.ok && colJson?.ok) {
          const found = colJson.collections.find((c: any) => c.id === actualCollectionId);
          actualCollectionName = found?.name || '';
        }
      }
      
      setTargetCollectionId(actualCollectionId);
      setCollectionName(actualCollectionName);
      
      // Parse CSV
      setProgress(20);
      setStatusText('Parsing CSV...');
      const text = await file.text();
      const parseRes = await fetch('/api/collections/parse-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      
      const parseJson = await parseRes.json();
      if (!parseRes.ok || !parseJson?.ok) {
        throw new Error(parseJson?.error || 'Failed to parse CSV');
      }
      
      const parsedCards = parseJson.rows || [];
      
      // Fuzzy match cards with Scryfall
      setProgress(40);
      setStatusText(`Verifying ${parsedCards.length} cards with Scryfall...`);
      
      const cardNames = parsedCards.map((c: any) => c.name);
      const matchRes = await fetch('/api/collections/fuzzy-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: cardNames }),
      });
      
      const matchJson = await matchRes.json();
      if (!matchRes.ok || !matchJson?.ok) {
        throw new Error(matchJson?.error || 'Failed to verify cards');
      }
      
      // Build preview cards
      const results = matchJson.results || [];
      const preview: PreviewCard[] = parsedCards.map((card: any, index: number) => {
        const matchResult = results[index] || {};
        return {
          originalName: card.name,
          quantity: card.qty || 1,
          matchStatus: matchResult.matchStatus || 'notfound',
          suggestedName: matchResult.suggestedName,
          confidence: matchResult.confidence,
          selected: matchResult.matchStatus !== 'notfound', // Auto-select found cards
          scryfallData: matchResult.scryfallData,
        };
      });
      
      setPreviewCards(preview);
      
      // If mode is 'new', skip preview and import directly
      if (mode === 'new') {
        // Auto-import all found cards (skip notfound ones)
        const foundCards = preview.filter(c => c.matchStatus !== 'notfound');
        await directImport(foundCards, actualCollectionId, actualCollectionName);
      } else {
        // Show preview modal for existing collection
        setProgress(100);
        setStatusText('');
        setBusy(false);
        setShowPreview(true);
      }
      
    } catch (e: any) {
      trackCollectionImportWorkflow('abandoned', { current_step: 3, abandon_reason: 'parse_failed' });
      toast(e?.message || "Upload failed", 'error');
      setBusy(false);
      setStatusText('');
      setProgress(0);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Direct import function (for 'new' mode)
  async function directImport(cards: PreviewCard[], collectionId: string, collectionName: string) {
    const { toast } = await import('@/lib/toast-client');
    
    setProgress(60);
    setStatusText(`Importing ${cards.length} cards...`);
    
    try {
      let added = 0;
      let failed = 0;
      const batchSize = 10;
      
      for (let i = 0; i < cards.length; i += batchSize) {
        const batch = cards.slice(i, i + batchSize);
        const batchProgress = 60 + ((i / cards.length) * 30);
        setProgress(batchProgress);
        setStatusText(`Importing cards ${i + 1}-${Math.min(i + batchSize, cards.length)} of ${cards.length}...`);
        
        const batchResults = await Promise.all(
          batch.map(async (card) => {
            try {
              // Use suggestedName if fuzzy match was found, otherwise use originalName
              // If user accepted suggestion, originalName was updated to suggestedName
              const finalName = card.matchStatus === 'fuzzy' && card.suggestedName 
                ? card.suggestedName 
                : card.originalName;
              
              const res = await fetch(`/api/collections/cards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  collectionId,
                  name: finalName,
                  qty: card.quantity,
                }),
              });
              
              return res.ok ? 'added' : 'failed';
            } catch {
              return 'failed';
            }
          })
        );
        
        added += batchResults.filter(r => r === 'added').length;
        failed += batchResults.filter(r => r === 'failed').length;
      }
      
      setProgress(100);
      setStatusText('Complete!');
      setReport({ added, updated: 0, skipped: [], total: cards.length });
      
      trackCollectionImportWorkflow('completed', { 
        cards_added: added,
        cards_failed: failed,
        total_processed: cards.length,
        mode: 'direct'
      });
      
      toast(`✅ Collection created! ${added} cards imported${failed > 0 ? `, ${failed} failed` : ''}.`, 'success');
      
      setTimeout(() => {
        window.location.href = `/collections/${collectionId}`;
      }, 1500);
      
      onDone?.();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("collection:csv-imported", { detail: { collectionId } }));
        try { capture("collection_imported"); } catch {}
      }
      
    } catch (e: any) {
      toast(e?.message || "Import failed", 'error');
      setBusy(false);
      setStatusText('');
      setProgress(0);
    }
  }

  async function handleConfirmImport(selectedCards: PreviewCard[], importMode: 'merge' | 'overwrite') {
    const { toast } = await import('@/lib/toast-client');
    
    setBusy(true);
    setShowPreview(false);
    setProgress(0);
    setStatusText('Importing cards...');
    
    try {
      // If overwrite mode, delete all existing cards first
      if (importMode === 'overwrite') {
        setProgress(10);
        setStatusText('Clearing collection...');
        const deleteRes = await fetch(`/api/collections/cards`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collectionId: targetCollectionId }),
        });
        if (!deleteRes.ok) {
          throw new Error('Failed to clear collection');
        }
      }
      
      // Import selected cards in batches
      setProgress(30);
      setStatusText(`Importing ${selectedCards.length} cards...`);
      
      let added = 0;
      let updated = 0;
      let failed = 0;
      const batchSize = 10;
      
      for (let i = 0; i < selectedCards.length; i += batchSize) {
        const batch = selectedCards.slice(i, i + batchSize);
        const batchProgress = 30 + ((i / selectedCards.length) * 60);
        setProgress(batchProgress);
        setStatusText(`Importing cards ${i + 1}-${Math.min(i + batchSize, selectedCards.length)} of ${selectedCards.length}...`);
        
        const batchResults = await Promise.all(
          batch.map(async (card) => {
            try {
              // Use suggestedName if fuzzy match was found, otherwise use originalName
              // If user accepted suggestion, originalName was updated to suggestedName
              const finalName = card.matchStatus === 'fuzzy' && card.suggestedName 
                ? card.suggestedName 
                : card.originalName;
              
              const res = await fetch(`/api/collections/cards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  collectionId: targetCollectionId,
                  name: finalName,
                  qty: card.quantity,
                }),
              });
              
              if (res.ok) {
                const json = await res.json();
                return json.added ? 'added' : 'updated';
              }
              return 'failed';
            } catch {
              return 'failed';
            }
          })
        );
        
        added += batchResults.filter(r => r === 'added').length;
        updated += batchResults.filter(r => r === 'updated').length;
        failed += batchResults.filter(r => r === 'failed').length;
      }
      
      setProgress(100);
      setStatusText('Complete!');
      setReport({ added, updated, skipped: [], total: selectedCards.length });
      
      trackCollectionImportWorkflow('completed', { 
        cards_added: added,
        cards_updated: updated,
        cards_failed: failed,
        total_processed: selectedCards.length 
      });
      
      toast(`✅ Import complete! ${added} added, ${updated} updated${failed > 0 ? `, ${failed} failed` : ''}.`, 'success');
      
      // Small delay then redirect/reload
      setTimeout(() => {
        if (collectionId === 'prompt') {
          window.location.href = `/collections/${targetCollectionId}`;
        } else {
          window.location.reload();
        }
      }, 1500);
      
      onDone?.();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("collection:csv-imported", { detail: { collectionId: targetCollectionId } }));
        try { capture("collection_imported"); } catch {}
      }
      
    } catch (e: any) {
      trackCollectionImportWorkflow('abandoned', { current_step: 4, abandon_reason: 'import_failed' });
      toast(e?.message || "Import failed", 'error');
      setBusy(false);
      setStatusText('');
      setProgress(0);
    }
  }

  function handleCancelPreview() {
    setShowPreview(false);
    setPreviewCards([]);
    trackCollectionImportWorkflow('abandoned', { current_step: 4, abandon_reason: 'preview_cancelled' });
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
          <button onClick={onPick} disabled={busy} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg min-w-[100px] disabled:opacity-50">
            {busy ? (
              <span className="flex items-center gap-1.5 justify-center">
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                {Math.round(progress)}%
              </span>
            ) : (
              <span className="flex items-center gap-1.5 justify-center">
                <span>📥</span>
                <span>{mode === 'new' ? "Import a New Collection" : "Import CSV"}</span>
              </span>
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

      {/* Preview Modal */}
      {showPreview && (
        <CollectionImportPreview
          cards={previewCards}
          collectionName={collectionName}
          onConfirm={handleConfirmImport}
          onCancel={handleCancelPreview}
        />
      )}
    </>
  );
}
