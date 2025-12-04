"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Modal from "@/components/Modal";
import { capture } from "@/lib/ph";

type ImportDeckModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: (deckId: string) => void;
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

type ImportMode = "paste" | "csv";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

    setBusy(true);
    setError(null);

    const payload = {
      title: title.trim() || "Imported Deck",
      deckText: deckText.trim(),
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
            Upload CSV
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
        ) : (
          <div className="space-y-1">
            <label className="text-xs text-neutral-400" htmlFor="import-deck-csv">
              CSV File
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
            disabled={busy || !deckText.trim() || (importMode === "csv" && csvProgress > 0 && csvProgress < 100)}
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-emerald-500 hover:to-blue-500 disabled:opacity-50"
          >
            {busy ? (importMode === "csv" && csvProgress > 0 && csvProgress < 100 ? "Matching cards…" : "Importing…") : "Import Deck"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

