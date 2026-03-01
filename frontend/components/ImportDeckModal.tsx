"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Modal from "@/components/Modal";
import { capture } from "@/lib/ph";

type ImportDeckModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: (deckId: string) => void;
};

type UnrecognizedCard = {
  originalName: string;
  qty: number;
  suggestions: string[];
  selectedFix: string | null; // null means skip/remove
};

const FORMATS: Array<{ value: string; label: string }> = [
  { value: "Commander", label: "Commander (EDH)" },
  { value: "Modern", label: "Modern (60-card)" },
  { value: "Pioneer", label: "Pioneer (60-card)" },
  { value: "Standard", label: "Standard (60-card)" },
  { value: "Other", label: "Other / Unknown" },
];

const PLANS: Array<{ value: "Optimized" | "Budget"; label: string }> = [
  { value: "Optimized", label: "Optimized" },
  { value: "Budget", label: "Budget" },
];

type ImportMode = "paste" | "csv" | "csv-batch";

export default function ImportDeckModal({ open, onClose, onImported }: ImportDeckModalProps) {
  const [importMode, setImportMode] = useState<ImportMode>("paste");
  const [title, setTitle] = useState("Imported Deck");
  const [deckText, setDeckText] = useState("");
  const [format, setFormat] = useState<string>("Commander");
  const [plan, setPlan] = useState<"Optimized" | "Budget">("Optimized");
  const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [csvProgress, setCsvProgress] = useState(0);
  const [batchResults, setBatchResults] = useState<Array<{ title: string; success: boolean; error?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Pre-import validation state
  const [showFixModal, setShowFixModal] = useState(false);
  const [unrecognizedCards, setUnrecognizedCards] = useState<UnrecognizedCard[]>([]);
  const [validatedDeckText, setValidatedDeckText] = useState<string>("");
  const [validationStatus, setValidationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
      setDeckText("");
      setTitle("Imported Deck");
      setFormat("Commander");
      setPlan("Optimized");
      setCurrency("USD");
      setImportMode("paste");
      setCsvStatus(null);
      setCsvProgress(0);
      setShowFixModal(false);
      setUnrecognizedCards([]);
      setValidatedDeckText("");
      setValidationStatus(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open]);

  const cardCount = useMemo(() => {
    if (!deckText.trim()) return 0;
    return deckText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => !!line && !line.startsWith("#") && !line.startsWith("//")).length;
  }, [deckText]);

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  // Complete the import with validated/fixed deck text
  const completeImport = useCallback(async (finalDeckText: string) => {
    const payload = {
      title: title.trim() || "Imported Deck",
      deckText: finalDeckText.trim(),
      format: format === "Other" ? undefined : format,
      plan,
      currency,
    };

    try {
      capture("deck_import_attempted", {
        format: payload.format || "Other",
        plan: payload.plan,
        card_count: cardCount,
        mode: importMode,
      });
    } catch {}

    try {
      const res = await fetch("/api/decks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.id) {
        throw new Error(json?.error || res.statusText || "Failed to import deck");
      }

      try {
        capture("deck_import_completed", {
          format: payload.format || "Other",
          plan: payload.plan,
          card_count: cardCount,
          mode: importMode,
        });
      } catch {}

      onImported(String(json.id));
    } catch (err: any) {
      setBusy(false);
      setError(err?.message || "Import failed");
    }
  }, [title, format, plan, currency, cardCount, importMode, onImported]);

  // Apply fixes and complete import
  const handleApplyFixes = useCallback(() => {
    // Build the fixed deck text
    const lines = validatedDeckText.split(/\r?\n/);
    const fixedLines: string[] = [];
    
    // Create a map of original names to their fixes
    const fixMap = new Map<string, string | null>();
    unrecognizedCards.forEach(card => {
      fixMap.set(card.originalName.toLowerCase(), card.selectedFix);
    });
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        fixedLines.push(line);
        continue;
      }
      
      // Parse line to get card name
      const match = trimmed.match(/^(\d+)\s*[xX]?\s+(.+)$/) || 
                    trimmed.match(/^(.+?)\s+[xX]\s*(\d+)$/) ||
                    trimmed.match(/^(.+?)\s*,\s*(\d+)$/);
      
      let qty = 1;
      let name = trimmed;
      
      if (match) {
        if (/^\d+$/.test(match[1])) {
          qty = parseInt(match[1], 10) || 1;
          name = match[2].trim();
        } else {
          name = match[1].trim();
          qty = parseInt(match[2], 10) || 1;
        }
      }
      
      // Check if this card needs fixing
      const lowerName = name.toLowerCase();
      if (fixMap.has(lowerName)) {
        const fix = fixMap.get(lowerName);
        if (fix === null) {
          // Skip this card (user chose to remove it)
          continue;
        } else {
          // Use the fixed name
          fixedLines.push(`${qty} ${fix}`);
        }
      } else {
        // No fix needed, keep original
        fixedLines.push(line);
      }
    }
    
    const finalDeckText = fixedLines.join('\n');
    setShowFixModal(false);
    completeImport(finalDeckText);
  }, [validatedDeckText, unrecognizedCards, completeImport]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (importMode === "paste" && !deckText.trim()) {
      setError("Paste a decklist first.");
      return;
    }
    if (importMode === "csv" && !deckText.trim()) {
      setError("Upload a CSV file first.");
      return;
    }
    if (importMode === "csv-batch") {
      setError("Use the file input to upload CSV file for batch import.");
      return;
    }

    setBusy(true);
    setError(null);
    setValidationStatus("Validating card names...");

    try {
      // First validate and get unrecognized cards
      const validateRes = await fetch("/api/deck/parse-and-fix-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckText: deckText.trim() }),
      });

      const validateJson = await validateRes.json().catch(() => ({}));
      setValidationStatus(null);
      
      if (!validateRes.ok || !validateJson?.ok) {
        throw new Error(validateJson?.error || "Failed to validate cards");
      }

      const items = validateJson.items || [];
      
      if (items.length > 0) {
        // There are unrecognized cards - show the fix modal
        setUnrecognizedCards(items.map((item: any) => ({
          originalName: item.originalName,
          qty: item.qty || 1,
          suggestions: item.suggestions || [],
          selectedFix: item.suggestions?.[0] || null, // Default to first suggestion
        })));
        setValidatedDeckText(deckText.trim());
        setShowFixModal(true);
        setBusy(false);
        return;
      }

      // No unrecognized cards - complete the import directly
      // Use the corrected cards from the API (properly capitalized)
      const correctedCards = validateJson.cards || [];
      const correctedDeckText = correctedCards
        .map((c: any) => `${c.qty} ${c.name}`)
        .join('\n');
      
      await completeImport(correctedDeckText || deckText.trim());
    } catch (err: any) {
      setBusy(false);
      setValidationStatus(null);
      setError(err?.message || "Validation failed");
    }
  }

  async function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    setCsvStatus("Reading CSV file...");
    setCsvProgress(10);

    try {
      // Step 1: Parse CSV
      setCsvStatus("Parsing CSV...");
      setCsvProgress(20);
      const text = await file.text();
      const parseRes = await fetch("/api/collections/parse-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const parseJson = await parseRes.json();
      if (!parseRes.ok || !parseJson?.ok) {
        throw new Error(parseJson?.error || "Failed to parse CSV");
      }

      const parsedCards = parseJson.rows || [];
      if (parsedCards.length === 0) {
        throw new Error("No cards found in CSV file");
      }

      // Step 2: Fuzzy match cards
      setCsvStatus(`Matching ${parsedCards.length} cards with Scryfall...`);
      setCsvProgress(40);
      const cardNames = parsedCards.map((c: any) => c.name);
      
      // Process in batches of 100 (API limit)
      const batchSize = 100;
      const allResults: any[] = [];
      for (let i = 0; i < cardNames.length; i += batchSize) {
        const batch = cardNames.slice(i, i + batchSize);
        const matchRes = await fetch("/api/collections/fuzzy-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: batch }),
        });

        const matchJson = await matchRes.json();
        if (!matchRes.ok || !matchJson?.ok) {
          throw new Error(matchJson?.error || "Failed to match cards");
        }

        allResults.push(...(matchJson.results || []));
        setCsvProgress(40 + Math.floor((i / cardNames.length) * 40));
      }

      // Step 3: Build decklist from matched cards
      setCsvStatus("Building decklist...");
      setCsvProgress(90);
      const deckLines: string[] = [];
      let matchedCount = 0;
      let notFoundCount = 0;

      for (let i = 0; i < parsedCards.length; i++) {
        const card = parsedCards[i];
        const matchResult = allResults[i] || {};
        const qty = card.qty || 1;

        if (matchResult.matchStatus === "notfound" || !matchResult.suggestedName) {
          // Use original name if not found
          deckLines.push(`${qty} ${card.name}`);
          notFoundCount++;
        } else {
          deckLines.push(`${qty} ${matchResult.suggestedName}`);
          matchedCount++;
        }
      }

      const finalDeckText = deckLines.join("\n");
      setDeckText(finalDeckText);
      setCsvStatus(`Matched ${matchedCount} cards${notFoundCount > 0 ? `, ${notFoundCount} not found` : ""}`);
      setCsvProgress(100);

      // Auto-submit after a brief delay to show status
      setTimeout(async () => {
        setCsvStatus(null);
        setCsvProgress(0);
        
        // Create deck with matched cards
        const payload = {
          title: title.trim() || "Imported Deck",
          deckText: finalDeckText.trim(),
          format: format === "Other" ? undefined : format,
          plan,
          currency,
        };

        try {
          capture("deck_import_attempted", {
            format: payload.format || "Other",
            plan: payload.plan,
            card_count: parsedCards.length,
            mode: "csv",
          });
        } catch {}

        try {
          const res = await fetch("/api/decks/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json?.ok || !json?.id) {
            throw new Error(json?.error || res.statusText || "Failed to import deck");
          }

          try {
            capture("deck_import_completed", {
              format: payload.format || "Other",
              plan: payload.plan,
              card_count: parsedCards.length,
              mode: "csv",
            });
          } catch {}

          onImported(String(json.id));
        } catch (err: any) {
          setBusy(false);
          setError(err?.message || "Import failed");
        }
      }, 1500);
    } catch (err: any) {
      setBusy(false);
      setError(err?.message || "CSV import failed");
      setCsvStatus(null);
      setCsvProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <Modal open={open} title="Import Deck" onClose={handleClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Import Mode Toggle */}
        <div className="flex gap-2 border-b border-neutral-800 pb-2">
          <button
            type="button"
            onClick={() => setImportMode("paste")}
            disabled={busy}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              importMode === "paste"
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
          >
            Paste Decklist
          </button>
          <button
            type="button"
            onClick={() => setImportMode("csv")}
            disabled={busy}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              importMode === "csv"
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
          >
            Upload CSV (Single)
          </button>
          <button
            type="button"
            onClick={() => setImportMode("csv-batch")}
            disabled={busy}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              importMode === "csv-batch"
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
          >
            Batch Import CSV
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-neutral-400" htmlFor="import-deck-name">
            Deck name
          </label>
          <input
            id="import-deck-name"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            placeholder="Imported Deck"
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-neutral-400" htmlFor="import-deck-format">
              Format
            </label>
            <select
              id="import-deck-format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-neutral-400" htmlFor="import-deck-plan">
              Plan
            </label>
            <select
              id="import-deck-plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value as "Optimized" | "Budget")}
              disabled={busy}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {PLANS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-neutral-400" htmlFor="import-deck-currency">
            Currency
          </label>
          <select
            id="import-deck-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="USD">USD – US Dollar</option>
            <option value="EUR">EUR – Euro</option>
            <option value="GBP">GBP – British Pound</option>
            <option value="CAD">CAD – Canadian Dollar</option>
            <option value="AUD">AUD – Australian Dollar</option>
          </select>
        </div>

        {importMode === "paste" ? (
          <div className="space-y-1">
            <label className="text-xs text-neutral-400" htmlFor="import-deck-text">
              Decklist
            </label>
            <textarea
              id="import-deck-text"
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              disabled={busy}
              rows={8}
              placeholder={"1 Sol Ring\n1 Arcane Signet\n2 Counterspell\n...\n\nTip: copy from Moxfield/Archidekt export or type \"4 Lightning Bolt\" style lines."}
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
            />
            <div className="text-[11px] text-neutral-500">
              {cardCount > 0 ? `Detected ${cardCount} card ${cardCount === 1 ? "entry" : "entries"}.` : "Supports numbers like \"3 Command Tower\" or raw card-per-line lists."}
            </div>
          </div>
        ) : importMode === "csv" ? (
          <div className="space-y-1">
            <label className="text-xs text-neutral-400" htmlFor="import-deck-csv">
              CSV File (Single Deck)
            </label>
            <input
              ref={fileInputRef}
              id="import-deck-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileChange}
              disabled={busy}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-500 focus:border-blue-500 focus:outline-none"
            />
            <div className="text-[11px] text-neutral-500">
              Supports CSV with headers (name, qty) or loose format. Cards will be automatically matched to Scryfall.
            </div>
            {csvStatus && (
              <div className="space-y-1">
                <div className="text-xs text-blue-400">{csvStatus}</div>
                {csvProgress > 0 && csvProgress < 100 && (
                  <div className="w-full bg-neutral-800 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${csvProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {deckText && (
              <div className="mt-2 p-2 rounded border border-neutral-700 bg-neutral-900/50 max-h-32 overflow-y-auto">
                <div className="text-xs text-neutral-400 mb-1">Preview ({cardCount} cards):</div>
                <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-mono">
                  {deckText.split("\n").slice(0, 10).join("\n")}
                  {deckText.split("\n").length > 10 && "\n..."}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs text-neutral-400" htmlFor="import-deck-csv-batch">
              CSV File (Multiple Decks - title, commander, decklist format)
            </label>
            <input
              ref={fileInputRef}
              id="import-deck-csv-batch"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                
                setBusy(true);
                setError(null);
                setBatchResults([]);
                setCsvStatus("Processing CSV file...");
                setCsvProgress(0);
                
                try {
                  const formData = new FormData();
                  formData.append("file", file);
                  
                  setCsvProgress(25);
                  setCsvStatus("Uploading and parsing CSV...");
                  
                  const res = await fetch("/api/decks/import-csv-batch", {
                    method: "POST",
                    body: formData,
                  });
                  
                  const json = await res.json();
                  if (!res.ok || !json?.ok) {
                    throw new Error(json?.error || "Batch import failed");
                  }
                  
                  setCsvProgress(75);
                  setCsvStatus(`Processing ${json.summary?.total || 0} decks...`);
                  
                  setBatchResults(json.results || []);
                  setCsvProgress(100);
                  setCsvStatus(
                    `Complete! ${json.summary?.successful || 0} imported, ${json.summary?.failed || 0} failed`
                  );
                  
                  // Close modal after 2 seconds if all succeeded
                  if (json.summary?.failed === 0) {
                    setTimeout(() => {
                      onClose();
                      if (json.results?.[0]?.deckId) {
                        onImported(json.results[0].deckId);
                      }
                    }, 2000);
                  }
                } catch (err: any) {
                  setError(err?.message || "Batch import failed");
                  setCsvStatus(null);
                  setCsvProgress(0);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-500 focus:border-blue-500 focus:outline-none"
            />
            <div className="text-[11px] text-neutral-500">
              CSV format: title, commander, decklist (supports multiple decks)
            </div>
            {csvStatus && (
              <div className="mt-3 space-y-1">
                <div className="text-xs text-blue-400">{csvStatus}</div>
                {csvProgress > 0 && csvProgress < 100 && (
                  <div className="w-full bg-neutral-800 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${csvProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {batchResults.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto space-y-1">
                {batchResults.map((result, idx) => (
                  <div
                    key={idx}
                    className={`text-xs p-2 rounded ${
                      result.success
                        ? "bg-green-900/30 text-green-300 border border-green-700"
                        : "bg-red-900/30 text-red-300 border border-red-700"
                    }`}
                  >
                    {result.success ? "✓" : "✗"} {result.title}
                    {result.error && `: ${result.error}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {validationStatus && (
          <div className="rounded-lg border border-blue-500/60 bg-blue-900/20 px-3 py-2 text-xs text-blue-200 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {validationStatus}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/60 bg-red-900/20 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (importMode === "paste" && !deckText.trim()) || (importMode === "csv" && csvProgress > 0 && csvProgress < 100) || importMode === "csv-batch"}
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-emerald-500 hover:to-blue-500 disabled:opacity-50"
          >
            {busy 
              ? (validationStatus ? "Validating…" : importMode === "csv" && csvProgress > 0 && csvProgress < 100 ? "Matching cards…" : "Importing…") 
              : importMode === "csv-batch" 
                ? "Upload CSV file above"
                : "Import Deck"
            }
          </button>
        </div>
      </form>

      {/* Fix Unrecognized Cards Modal */}
      <Modal 
        open={showFixModal} 
        title="Fix Unrecognized Cards" 
        onClose={() => {
          setShowFixModal(false);
          setBusy(false);
        }}
      >
        <div className="space-y-4">
          <div className="text-sm text-neutral-300">
            <span className="text-amber-400 font-medium">{unrecognizedCards.length} cards</span> couldn&apos;t be matched to our database.
            Select the correct card or remove from your deck.
          </div>

          <div className="max-h-80 overflow-y-auto space-y-3 pr-2">
            {unrecognizedCards.map((card, idx) => (
              <div key={idx} className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">
                      {card.qty}x <span className="text-amber-300">{card.originalName}</span>
                    </div>
                    {card.suggestions.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        <div className="text-xs text-neutral-400">Did you mean:</div>
                        <div className="flex flex-wrap gap-1">
                          {card.suggestions.slice(0, 5).map((suggestion, sIdx) => (
                            <button
                              key={sIdx}
                              type="button"
                              onClick={() => {
                                const updated = [...unrecognizedCards];
                                updated[idx].selectedFix = suggestion;
                                setUnrecognizedCards(updated);
                              }}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                card.selectedFix === suggestion
                                  ? "bg-emerald-600 text-white"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                              }`}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-neutral-500">No suggestions found</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...unrecognizedCards];
                      updated[idx].selectedFix = updated[idx].selectedFix === null ? updated[idx].suggestions[0] || null : null;
                      setUnrecognizedCards(updated);
                    }}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      card.selectedFix === null
                        ? "bg-red-600 text-white"
                        : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                    }`}
                  >
                    {card.selectedFix === null ? "Removing" : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-700 pt-4">
            <div className="flex items-center justify-between text-xs text-neutral-400 mb-3">
              <span>
                {unrecognizedCards.filter(c => c.selectedFix !== null).length} cards will be fixed, {" "}
                {unrecognizedCards.filter(c => c.selectedFix === null).length} will be removed
              </span>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowFixModal(false);
                  setBusy(false);
                }}
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-white transition-colors hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyFixes}
                className="rounded-lg bg-gradient-to-r from-emerald-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-emerald-500 hover:to-blue-500"
              >
                Apply Fixes & Import
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}

