// components/CollectionCsvUpload.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { capture } from "@/lib/ph";
import { trackCollectionImportWorkflow } from '@/lib/analytics-workflow';
import CollectionImportPreview, {
  PreviewCard,
  ImportPreviewPhase,
  ImportConfirmOptions,
} from './CollectionImportPreview';
import { handleProStorageLimitPayload, showProStorageLimitPanel } from "@/lib/pro-storage-limit-ui";
import { trimCardsToFreeLimit, wouldExceedCollectionLimit } from "@/lib/pro-storage-limits";
import { useProStatus } from "@/components/ProContext";

type ImportMode = 'new' | 'existing';
type CollectionListRow = { id: string; name?: string };
type ParsedCollectionCard = { name: string; qty?: number };
type CollectionParseReport = { detectedFormat?: string } & Record<string, unknown>;
type FuzzyMatchResult = Pick<
  PreviewCard,
  'matchStatus' | 'suggestedName' | 'confidence' | 'scryfallData'
>;

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
  const [report, setReport] = useState<{added:number;updated:number;skipped:string[];total:number;parser?:CollectionParseReport} | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewPhase, setPreviewPhase] = useState<ImportPreviewPhase>('review');
  const [importSummary, setImportSummary] = useState<{
    added: number;
    updated: number;
    failed: number;
    skippedQty?: number;
  } | null>(null);
  const [previewCards, setPreviewCards] = useState<PreviewCard[]>([]);
  const [targetCollectionId, setTargetCollectionId] = useState<string>('');
  const [collectionName, setCollectionName] = useState<string>('');
  const [currentCollectionQty, setCurrentCollectionQty] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { isPro, loading: proLoading } = useProStatus();

  function sumSelectedQty(cards: PreviewCard[]): number {
    return cards.reduce((sum, card) => sum + (card.selected ? card.quantity : 0), 0);
  }

  async function loadCollectionQty(collectionId: string): Promise<number> {
    try {
      const res = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(collectionId)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) return 0;
      return (json.items || []).reduce(
        (sum: number, item: { qty?: number }) => sum + Math.max(0, Number(item.qty) || 0),
        0,
      );
    } catch {
      return 0;
    }
  }

  function notifyCollectionSizeLimitChoice(
    importQty: number,
    currentQty: number,
    importMode: 'merge' | 'overwrite' = 'merge',
  ) {
    if (proLoading || isPro) return;
    if (!wouldExceedCollectionLimit({ isPro, currentQty, importQty, importMode })) return;
    showProStorageLimitPanel(
      { code: "PRO_LIMIT_COLLECTION_SIZE" },
      { attempted: importQty, current: currentQty, importMode },
    );
  }

  useEffect(() => {
    const onOpen = () => { void onPick(); };
    window.addEventListener('open-collection-csv-import', onOpen);
    return () => window.removeEventListener('open-collection-csv-import', onOpen);
  }, []);

  async function onPick() {
    trackCollectionImportWorkflow('started');
    inputRef.current?.click();
  }

  async function preparePreviewFromText(text: string, collectionNameHint: string) {
    let actualCollectionId = collectionId;
    let actualCollectionName = '';

    if (mode === 'new' || collectionId === 'prompt') {
      setProgress(10);
      setStatusText('Creating new collection...');

      actualCollectionName = collectionNameHint.trim() || 'Imported Collection';

      const createRes = await fetch('/api/collections/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: actualCollectionName }),
      });

      const createJson = await createRes.json() as { ok?: boolean; id?: string; error?: string };
      if (await handleProStorageLimitPayload(createJson)) {
        throw new Error(createJson?.error || 'Collection limit reached');
      }
      if (!createRes.ok || !createJson?.ok || !createJson.id) {
        throw new Error(createJson?.error || 'Failed to create collection');
      }

      actualCollectionId = createJson.id;
      console.log('Created new collection:', actualCollectionId, actualCollectionName);
    } else {
      const colRes = await fetch(`/api/collections/list`);
      const colJson = await colRes.json() as { ok?: boolean; collections?: CollectionListRow[] };
      if (colRes.ok && colJson?.ok) {
        const found = colJson.collections?.find((c) => c.id === actualCollectionId);
        actualCollectionName = found?.name || '';
      }
    }

    setTargetCollectionId(actualCollectionId);
    setCollectionName(actualCollectionName);
    const existingQty = await loadCollectionQty(actualCollectionId);
    setCurrentCollectionQty(existingQty);

    setProgress(20);
    setStatusText('Parsing CSV...');
    const parseRes = await fetch('/api/collections/parse-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    const parseJson = await parseRes.json() as { ok?: boolean; error?: string; rows?: ParsedCollectionCard[] };
    if (!parseRes.ok || !parseJson?.ok) {
      throw new Error(parseJson?.error || 'Failed to parse CSV');
    }

    const parsedCards = parseJson.rows || [];
    if (!parsedCards.length) {
      throw new Error('No cards found in that list');
    }

    setProgress(40);
    setStatusText(`Verifying ${parsedCards.length} cards with Scryfall...`);

    const cardNames = parsedCards.map((c) => c.name);
    const results: FuzzyMatchResult[] = [];
    const matchBatchSize = 200;
    for (let i = 0; i < cardNames.length; i += matchBatchSize) {
      const batch = cardNames.slice(i, i + matchBatchSize);
      const matchRes = await fetch('/api/collections/fuzzy-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: batch }),
      });

      const matchJson = await matchRes.json() as { ok?: boolean; error?: string; results?: FuzzyMatchResult[] };
      if (!matchRes.ok || !matchJson?.ok) {
        throw new Error(matchJson?.error || 'Failed to verify cards');
      }

      results.push(...(matchJson.results || []));
      setProgress(40 + Math.floor((Math.min(i + matchBatchSize, cardNames.length) / cardNames.length) * 40));
    }

    const preview: PreviewCard[] = parsedCards.map((card, index) => {
      const matchResult = results[index] || {};
      const matchStatus = matchResult.matchStatus || 'notfound';
      return {
        originalName: card.name,
        quantity: card.qty || 1,
        matchStatus,
        suggestedName: matchResult.suggestedName,
        confidence: matchResult.confidence,
        selected: matchStatus !== 'notfound',
        scryfallData: matchResult.scryfallData,
      };
    });

    setPreviewCards(preview);
    setProgress(100);
    setStatusText('');
    setBusy(false);
    setPreviewPhase('review');
    setImportSummary(null);
    setShowPreview(true);

    const importQty = sumSelectedQty(preview);
    notifyCollectionSizeLimitChoice(importQty, existingQty, 'merge');
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
        
        const createJson = await createRes.json() as { ok?: boolean; id?: string; error?: string };
        if (await handleProStorageLimitPayload(createJson)) {
          throw new Error(createJson?.error || 'Collection limit reached');
        }
        if (!createRes.ok || !createJson?.ok || !createJson.id) {
          throw new Error(createJson?.error || 'Failed to create collection');
        }
        
        actualCollectionId = createJson.id;
        console.log('Created new collection:', actualCollectionId, actualCollectionName);
      } else {
        // Get collection name for existing collection
        const colRes = await fetch(`/api/collections/list`);
        const colJson = await colRes.json() as { ok?: boolean; collections?: CollectionListRow[] };
        if (colRes.ok && colJson?.ok) {
          const found = colJson.collections?.find((c) => c.id === actualCollectionId);
          actualCollectionName = found?.name || '';
        }
      }
      
      setTargetCollectionId(actualCollectionId);
      setCollectionName(actualCollectionName);
      const existingQty = await loadCollectionQty(actualCollectionId);
      setCurrentCollectionQty(existingQty);
      
      // Parse CSV
      setProgress(20);
      setStatusText('Parsing CSV...');
      const text = await file.text();
      const parseRes = await fetch('/api/collections/parse-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      
      const parseJson = await parseRes.json() as { ok?: boolean; error?: string; rows?: ParsedCollectionCard[] };
      if (!parseRes.ok || !parseJson?.ok) {
        throw new Error(parseJson?.error || 'Failed to parse CSV');
      }
      
      const parsedCards = parseJson.rows || [];
      
      // Fuzzy match cards with Scryfall
      setProgress(40);
      setStatusText(`Verifying ${parsedCards.length} cards with Scryfall...`);
      
      const cardNames = parsedCards.map((c) => c.name);
      const results: FuzzyMatchResult[] = [];
      const matchBatchSize = 200;
      for (let i = 0; i < cardNames.length; i += matchBatchSize) {
        const batch = cardNames.slice(i, i + matchBatchSize);
        const matchRes = await fetch('/api/collections/fuzzy-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: batch }),
        });
        
        const matchJson = await matchRes.json() as { ok?: boolean; error?: string; results?: FuzzyMatchResult[] };
        if (!matchRes.ok || !matchJson?.ok) {
          throw new Error(matchJson?.error || 'Failed to verify cards');
        }

        results.push(...(matchJson.results || []));
        setProgress(40 + Math.floor((Math.min(i + matchBatchSize, cardNames.length) / cardNames.length) * 40));
      }
      
      // Build preview cards
      const preview: PreviewCard[] = parsedCards.map((card, index) => {
        const matchResult = results[index] || {};
        const matchStatus = matchResult.matchStatus || 'notfound';
        return {
          originalName: card.name,
          quantity: card.qty || 1,
          matchStatus,
          suggestedName: matchResult.suggestedName,
          confidence: matchResult.confidence,
          selected: matchStatus !== 'notfound', // Auto-select found cards
          scryfallData: matchResult.scryfallData,
        };
      });
      
      setPreviewCards(preview);
      
      // Always show preview modal (same as deck import) — user reviews matches before importing
      setProgress(100);
      setStatusText('');
      setBusy(false);
      setPreviewPhase('review');
      setImportSummary(null);
      setShowPreview(true);

      const importQty = sumSelectedQty(preview);
      notifyCollectionSizeLimitChoice(importQty, existingQty, 'merge');
      
    } catch (e: unknown) {
      trackCollectionImportWorkflow('abandoned', { current_step: 3, abandon_reason: 'parse_failed' });
      toast(e instanceof Error ? e.message : "Upload failed", 'error');
      setBusy(false);
      setStatusText('');
      setProgress(0);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handlePastePreview() {
    const text = pasteText.trim();
    const { toast } = await import('@/lib/toast-client');
    if (!text) {
      toast('Paste a CSV list first', 'warning');
      return;
    }

    trackCollectionImportWorkflow('started', { source: 'paste' });
    trackCollectionImportWorkflow('file_selected', { source: 'paste', text_length: text.length });
    setBusy(true);
    setReport(null);
    setProgress(0);
    setStatusText('Parsing pasted list...');

    try {
      await preparePreviewFromText(text, 'Pasted Collection');
      setPasteOpen(false);
    } catch (e: unknown) {
      trackCollectionImportWorkflow('abandoned', { current_step: 3, abandon_reason: 'parse_failed', source: 'paste' });
      toast(e instanceof Error ? e.message : "Paste import failed", 'error');
      setBusy(false);
      setStatusText('');
      setProgress(0);
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

              const json = await res.json().catch(() => ({}));
              if (await handleProStorageLimitPayload(json, {
                attempted: card.quantity,
                current: currentCollectionQty,
                importMode: 'merge',
              })) return 'limit';
              return res.ok && json?.ok !== false ? 'added' : 'failed';
            } catch {
              return 'failed';
            }
          })
        );
        
        if (batchResults.includes('limit')) {
          setBusy(false);
          setPreviewPhase('review');
          return;
        }
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
      
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Import failed", 'error');
      setBusy(false);
      setStatusText('');
      setProgress(0);
    }
  }

  async function handleConfirmImport(
    selectedCards: PreviewCard[],
    importMode: 'merge' | 'overwrite',
    options?: ImportConfirmOptions,
  ) {
    const { toast } = await import('@/lib/toast-client');

    const currentQty = importMode === 'overwrite' ? 0 : currentCollectionQty;
    let cardsToImport = selectedCards;
    let skippedQty = 0;

    if (options?.capToFreeLimit) {
      const trimmed = trimCardsToFreeLimit(selectedCards, currentQty, importMode);
      cardsToImport = trimmed.cards;
      skippedQty = trimmed.skippedQty;
      if (cardsToImport.length === 0 || trimmed.importedQty <= 0) {
        toast('No room left in this collection on the free plan. Upgrade to Pro to add more cards.', 'warning');
        return;
      }
    } else if (
      !proLoading &&
      !isPro &&
      wouldExceedCollectionLimit({
        isPro,
        currentQty,
        importQty: sumSelectedQty(selectedCards),
        importMode,
      })
    ) {
      notifyCollectionSizeLimitChoice(sumSelectedQty(selectedCards), currentQty, importMode);
      return;
    }
    
    setBusy(true);
    setPreviewPhase('importing');
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
      setStatusText(`Importing ${cardsToImport.length} cards...`);
      
      let added = 0;
      let updated = 0;
      let failed = 0;
      const batchSize = 10;
      
      for (let i = 0; i < cardsToImport.length; i += batchSize) {
        const batch = cardsToImport.slice(i, i + batchSize);
        const batchProgress = 30 + ((i / cardsToImport.length) * 60);
        setProgress(batchProgress);
        setStatusText(`Importing cards ${i + 1}-${Math.min(i + batchSize, cardsToImport.length)} of ${cardsToImport.length}...`);
        
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
              
              const json = await res.json().catch(() => ({}));
              if (await handleProStorageLimitPayload(json, {
                attempted: sumSelectedQty(cardsToImport),
                current: importMode === 'overwrite' ? 0 : currentCollectionQty,
                importMode,
              })) return 'limit';
              if (res.ok && json?.ok !== false) return json.added ? 'added' : 'updated';
              return 'failed';
            } catch {
              return 'failed';
            }
          })
        );
        
        if (batchResults.includes('limit')) {
          setBusy(false);
          setPreviewPhase('review');
          return;
        }
        added += batchResults.filter(r => r === 'added').length;
        updated += batchResults.filter(r => r === 'updated').length;
        failed += batchResults.filter(r => r === 'failed').length;
      }
      
      setProgress(100);
      setStatusText('Complete!');
      setReport({ added, updated, skipped: [], total: cardsToImport.length });
      setImportSummary({ added, updated, failed, skippedQty: skippedQty > 0 ? skippedQty : undefined });
      setPreviewPhase('complete');
      setBusy(false);
      
      trackCollectionImportWorkflow('completed', { 
        cards_added: added,
        cards_updated: updated,
        cards_failed: failed,
        total_processed: cardsToImport.length,
        cards_skipped_free_cap: skippedQty,
      });
      
      const skippedNote = skippedQty > 0 ? ` ${skippedQty} skipped (free limit). Upgrade to Pro for the rest.` : '';
      toast(`✅ Import complete! ${added} added, ${updated} updated${failed > 0 ? `, ${failed} failed` : ''}.${skippedNote}`, 'success');
      
      // Small delay then redirect/reload
      setTimeout(() => {
        setShowPreview(false);
        setPreviewPhase('review');
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
      
    } catch (e: unknown) {
      trackCollectionImportWorkflow('abandoned', { current_step: 4, abandon_reason: 'import_failed' });
      toast(e instanceof Error ? e.message : "Import failed", 'error');
      setBusy(false);
      setPreviewPhase('review');
      setStatusText('');
      setProgress(0);
    }
  }

  function handleCancelPreview() {
    setShowPreview(false);
    setPreviewPhase('review');
    setImportSummary(null);
    setPreviewCards([]);
    trackCollectionImportWorkflow('abandoned', { current_step: 4, abandon_reason: 'preview_cancelled' });
  }

  const showHeaderProgress = busy && !showPreview;

  return (
    <>
      <div className="relative space-y-2">
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
          <button onClick={onPick} disabled={busy} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg min-w-[100px] disabled:opacity-50">
            {showHeaderProgress ? (
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
          <button
            type="button"
            onClick={() => setPasteOpen((open) => !open)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 text-xs font-medium transition-all disabled:opacity-50"
          >
            {pasteOpen ? 'Hide Paste' : 'Paste List'}
          </button>
          {report && !busy && (
            <span className="text-xs text-muted-foreground">
              Imported {report.added + report.updated}/{report.total}
              {report.skipped?.length ? ` • skipped ${report.skipped.length}` : ""}
            </span>
          )}
          {showHeaderProgress && statusText && (
            <span className="text-xs text-gray-400 animate-pulse">{statusText}</span>
          )}
          {!busy && (
            <span className="group relative inline-flex">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-xs font-bold text-neutral-300 hover:border-neutral-500 hover:text-white"
                aria-label="Supported import formats"
              >
                ?
              </button>
              <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-64 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-left text-xs leading-5 text-neutral-300 shadow-xl group-hover:block group-focus-within:block">
                TCGPlayer, CardKingdom, Moxfield, Archidekt, generic CSV with name/quantity columns, or plain text like &quot;2 Lightning Bolt&quot;.
              </span>
            </span>
          )}
        </div>
        
        {pasteOpen && (
          <div className="absolute right-0 top-full z-40 mt-2 w-[calc(100vw-2rem)] max-w-lg rounded-xl border border-amber-500/30 bg-neutral-950 p-3 shadow-2xl shadow-black/50">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-amber-200">
              Paste CSV or card list
            </label>
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.currentTarget.value)}
              placeholder={"Deck,Quantity,Card Name\nCloud,1,\"Cloud, Planet's Champion\"\nCloud,2,Coeurl"}
              rows={8}
              disabled={busy}
              className="min-h-44 w-full resize-y rounded-lg border border-amber-500/35 bg-black/50 px-3 py-2 font-mono text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-amber-300 disabled:opacity-60"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                disabled={busy}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePastePreview}
                disabled={busy || !pasteText.trim()}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-300 disabled:opacity-60"
              >
                {busy ? 'Parsing...' : 'Preview Import'}
              </button>
            </div>
          </div>
        )}

        {/* Progress bar - only while parsing file, not during modal import */}
        {showHeaderProgress && (
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
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <CollectionImportPreview
          cards={previewCards}
          collectionName={collectionName}
          onConfirm={handleConfirmImport}
          onCancel={handleCancelPreview}
          phase={previewPhase}
          progress={progress}
          statusText={statusText}
          importSummary={importSummary ?? undefined}
          isPro={isPro}
          proLoading={proLoading}
          currentCollectionQty={currentCollectionQty}
        />
      )}
    </>
  );
}
