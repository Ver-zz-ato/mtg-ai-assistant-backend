"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function ImportDeckModal({ open, onClose, onImported }: ImportDeckModalProps) {
  const [title, setTitle] = useState("Imported Deck");
  const [deckText, setDeckText] = useState("");
  const [format, setFormat] = useState<string>("Commander");
  const [plan, setPlan] = useState<"Optimized" | "Budget">("Optimized");
  const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
      setDeckText("");
      setTitle("Imported Deck");
      setFormat("Commander");
      setPlan("Optimized");
      setCurrency("USD");
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
    if (!deckText.trim()) {
      setError("Paste a decklist first.");
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
        });
      } catch {}

      onImported(String(json.id));
    } catch (err: any) {
      setBusy(false);
      setError(err?.message || "Import failed");
    }
  }

  return (
    <Modal open={open} title="Import Deck" onClose={handleClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
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
            disabled={busy || !deckText.trim()}
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-emerald-500 hover:to-blue-500 disabled:opacity-50"
          >
            {busy ? "Importing…" : "Import Deck"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

