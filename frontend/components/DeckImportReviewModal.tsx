"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isCommanderFormatString } from "@/lib/deck/formatRules";
import { parseDeckTextWithZones } from "@/lib/deck/parseDeckText";

type ImportSource = "paste" | "url" | "csv";
type ApplyMode = "merge" | "replace";
type ReviewZone = "mainboard" | "sideboard";

type ReviewRow = {
  id: string;
  originalName: string;
  name: string;
  qty: number;
  zone: ReviewZone;
  selected: boolean;
  suggestions: string[];
};

type ImageInfo = { small?: string; normal?: string };

export default function DeckImportReviewModal({
  deckId,
  format,
  open,
  onClose,
  onDone,
}: {
  deckId: string;
  format?: string | null;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [source, setSource] = useState<ImportSource>("paste");
  const [applyMode, setApplyMode] = useState<ApplyMode>("merge");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [images, setImages] = useState<Record<string, ImageInfo>>({});
  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"input" | "review">("input");

  const isCommander = isCommanderFormatString(format || "commander");
  const selectedRows = useMemo(() => rows.filter((row) => row.selected && row.qty > 0 && row.name.trim()), [rows]);
  const selectedTotal = useMemo(
    () => selectedRows.reduce((sum, row) => sum + Math.max(1, Math.floor(Number(row.qty) || 1)), 0),
    [selectedRows],
  );
  const sideboardTotal = useMemo(
    () => selectedRows.filter((row) => row.zone === "sideboard").reduce((sum, row) => sum + row.qty, 0),
    [selectedRows],
  );

  useEffect(() => {
    if (!open) {
      setSource("paste");
      setApplyMode("merge");
      setUrl("");
      setText("");
      setFileName("");
      setRows([]);
      setImages({});
      setBusy(false);
      setMatching(false);
      setError(null);
      setPhase("input");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  if (!open) return null;

  function renderDeckText(list: ReviewRow[]): string {
    const normalized = list
      .map((row) => ({
        name: row.name.trim(),
        qty: Math.max(1, Math.floor(Number(row.qty) || 1)),
        zone: row.zone === "sideboard" ? "sideboard" : "mainboard",
      }))
      .filter((row) => row.name);

    if (isCommander) {
      return normalized.map((row) => `${row.qty} ${row.name}`).join("\n");
    }

    const main = normalized.filter((row) => row.zone !== "sideboard");
    const side = normalized.filter((row) => row.zone === "sideboard");
    const out = ["Mainboard", ...main.map((row) => `${row.qty} ${row.name}`)];
    if (side.length) out.push("", "Sideboard", ...side.map((row) => `${row.qty} ${row.name}`));
    return out.join("\n");
  }

  function parsePreview(rawText: string): ReviewRow[] {
    const parsed = parseDeckTextWithZones(rawText, { isCommanderFormat: isCommander });
    const byKey = new Map<string, ReviewRow>();
    for (const entry of parsed) {
      const name = String(entry.name || "").trim();
      if (!name) continue;
      const zone: ReviewZone = entry.zone === "sideboard" && !isCommander ? "sideboard" : "mainboard";
      const key = `${zone}::${name.toLowerCase()}`;
      const qty = Math.max(1, Math.floor(Number(entry.qty) || 1));
      const existing = byKey.get(key);
      if (existing) existing.qty += qty;
      else {
        byKey.set(key, {
          id: `${zone}-${byKey.size}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          originalName: name,
          name,
          qty,
          zone,
          selected: true,
          suggestions: [],
        });
      }
    }
    return Array.from(byKey.values());
  }

  async function loadImages(names: string[]) {
    const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
    if (!uniqueNames.length) {
      setImages({});
      return;
    }
    try {
      const res = await fetch("/api/cards/batch-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: uniqueNames }),
      });
      const json = await res.json().catch(() => ({}));
      const next: Record<string, ImageInfo> = {};
      (json?.data || []).forEach((card: { name?: string; image_uris?: ImageInfo }) => {
        if (card?.name && card?.image_uris) next[card.name] = card.image_uris;
      });
      setImages(next);
    } catch {
      setImages({});
    }
  }

  async function matchNames(baseRows: ReviewRow[]) {
    const names = Array.from(new Set(baseRows.map((row) => row.name).filter(Boolean)));
    if (!names.length) return baseRows;
    setMatching(true);
    try {
      const results: Record<string, { suggestion?: string; all?: string[] }> = {};
      for (let i = 0; i < names.length; i += 100) {
        const batch = names.slice(i, i + 100);
        const res = await fetch("/api/cards/fuzzy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: batch }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.results) Object.assign(results, json.results);
      }

      return baseRows.map((row) => {
        const result = results[row.name] || {};
        const all = Array.isArray(result.all) ? result.all.filter(Boolean) : [];
        const suggestions = Array.from(new Set([result.suggestion, ...all, row.name].filter(Boolean) as string[]));
        return {
          ...row,
          name: result.suggestion || row.name,
          suggestions,
        };
      });
    } finally {
      setMatching(false);
    }
  }

  async function previewText(rawText: string) {
    const trimmed = rawText.trim();
    if (!trimmed) {
      setError("Paste or upload a decklist first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const parsedRows = parsePreview(trimmed);
      if (!parsedRows.length) throw new Error("No cards found in that import.");
      const matchedRows = await matchNames(parsedRows);
      setRows(matchedRows);
      setPhase("review");
      await loadImages(matchedRows.map((row) => row.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function previewUrl() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a Moxfield or Archidekt URL first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/decks/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.deckText) throw new Error(json?.error || "Could not read that deck URL.");
      setText(String(json.deckText || ""));
      await previewText(String(json.deckText || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that deck URL.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    const raw = await file.text();
    setText(raw);
    await previewText(raw);
  }

  function updateRow(index: number, patch: Partial<ReviewRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function changeQty(index: number, delta: number) {
    setRows((current) =>
      current.flatMap((row, i) => {
        if (i !== index) return [row];
        const nextQty = Math.max(0, Math.floor(Number(row.qty) || 0) + delta);
        return nextQty <= 0 ? [] : [{ ...row, qty: nextQty }];
      }),
    );
  }

  async function applyImport() {
    if (!selectedRows.length) {
      setError("Select at least one card to import.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const deckText = renderDeckText(selectedRows);
      const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckText, importMode: applyMode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not import cards into this deck.");
      window.dispatchEvent(new Event("deck:changed"));
      router.refresh();
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  const sourceButtonClass = (active: boolean) =>
    `rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
      active
        ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
        : "border-transparent text-neutral-400 hover:bg-neutral-900 hover:text-white"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-import-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-cyan-500/30 bg-neutral-950 shadow-2xl shadow-cyan-950/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_34%),linear-gradient(135deg,rgba(88,28,135,0.3),rgba(8,47,73,0.18),rgba(0,0,0,0.2))] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                Deck import
              </div>
              <h2 id="deck-import-title" className="text-xl font-black text-white">
                Review import
              </h2>
              <p className="mt-1 max-w-xl text-sm text-neutral-300">
                Paste a list, load a public deck URL, or upload CSV. Review the parsed rows before changing this deck.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-neutral-700 bg-black/30 px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 grid gap-2 rounded-xl border border-neutral-800 bg-black/35 p-1 sm:grid-cols-3">
            {(["paste", "url", "csv"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setSource(item);
                  setError(null);
                }}
                className={sourceButtonClass(source === item)}
              >
                {item === "paste" ? "Paste list" : item === "url" ? "Deck URL" : "CSV"}
              </button>
            ))}
          </div>

          {phase === "input" ? (
            <div className="space-y-4">
              {source === "paste" ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-amber-200">
                    Paste decklist or CSV rows
                  </label>
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.currentTarget.value)}
                    placeholder={"1 Sol Ring\n1 Arcane Signet\n\nSideboard\n2 Pyroblast"}
                    rows={11}
                    className="min-h-56 w-full resize-y rounded-lg border border-amber-500/35 bg-black/50 px-3 py-2 font-mono text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-amber-300"
                  />
                </div>
              ) : null}

              {source === "url" ? (
                <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-4">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">
                    Moxfield or Archidekt link
                  </label>
                  <input
                    value={url}
                    onChange={(event) => setUrl(event.currentTarget.value)}
                    placeholder="https://www.moxfield.com/decks/... or https://archidekt.com/decks/..."
                    className="w-full rounded-lg border border-cyan-500/40 bg-black/50 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-cyan-300"
                  />
                </div>
              ) : null}

              {source === "csv" ? (
                <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-200">CSV import</div>
                  <p className="mb-3 text-sm text-neutral-300">
                    Upload a deck or collection CSV. ManaTap will use the same card-name and quantity parser as text imports.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv,.txt,text/plain"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-400 disabled:opacity-50"
                  >
                    {busy ? "Reading..." : fileName ? "Choose another file" : "Choose CSV"}
                  </button>
                  {fileName ? <span className="ml-3 text-sm text-violet-100">{fileName}</span> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
                  <p className="text-xs text-neutral-500">Selected total</p>
                  <p className="font-mono text-lg text-white">{selectedTotal}</p>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
                  <p className="text-xs text-neutral-500">Unique rows</p>
                  <p className="font-mono text-lg text-white">{selectedRows.length}</p>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
                  <p className="text-xs text-neutral-500">Sideboard</p>
                  <p className="font-mono text-lg text-white">{sideboardTotal}</p>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
                  <p className="text-xs text-neutral-500">Mode</p>
                  <p className="font-mono text-sm text-white">{applyMode === "merge" ? "Merge" : "Replace"}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: true })))}
                  className="rounded border border-neutral-700 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: false })))}
                  className="rounded border border-neutral-700 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
                >
                  Clear
                </button>
                {matching ? <span className="px-2 py-1.5 text-xs text-cyan-200">Matching card names...</span> : null}
              </div>

              <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-neutral-800 bg-black/25">
                {rows.map((row, index) => {
                  const image = images[row.name] || images[row.originalName];
                  const imageSrc = image?.small || image?.normal;
                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[auto_34px_minmax(0,1fr)_auto] items-center gap-3 border-b border-neutral-900 px-3 py-2 last:border-b-0 hover:bg-neutral-900/60"
                    >
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(event) => updateRow(index, { selected: event.currentTarget.checked })}
                        className="h-4 w-4 accent-cyan-400"
                        aria-label={`Select ${row.name}`}
                      />
                      <div className="h-11 w-8 overflow-hidden rounded bg-neutral-800">
                        {imageSrc ? (
                          <img src={imageSrc} alt={row.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[8px] text-neutral-600">...</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        {row.suggestions.length > 1 ? (
                          <select
                            value={row.name}
                            onChange={(event) => updateRow(index, { name: event.currentTarget.value })}
                            className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm font-semibold text-white outline-none focus:border-cyan-400"
                          >
                            {row.suggestions.map((suggestion) => (
                              <option key={suggestion} value={suggestion}>
                                {suggestion}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={row.name}
                            onChange={(event) => updateRow(index, { name: event.currentTarget.value })}
                            className="w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm font-semibold text-white outline-none focus:border-cyan-400"
                          />
                        )}
                        <div className="mt-1 flex gap-2 text-[11px] text-neutral-500">
                          {row.originalName.toLowerCase() !== row.name.toLowerCase() ? (
                            <span>matched from {row.originalName}</span>
                          ) : (
                            <span>{row.suggestions.length ? "matched" : "parsed"}</span>
                          )}
                          {!isCommander && row.zone === "sideboard" ? <span>Sideboard</span> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => changeQty(index, -1)}
                          className="h-7 w-7 rounded border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-red-500/60 hover:text-red-300"
                          title={row.qty <= 1 ? "Remove row" : "Remove one"}
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono text-xs text-neutral-200">{row.qty}</span>
                        <button
                          type="button"
                          onClick={() => changeQty(index, 1)}
                          className="h-7 w-7 rounded border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-emerald-500/60 hover:text-emerald-300"
                          title="Add one"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error ? (
            <div className="mt-4 rounded-lg border border-red-500/35 bg-red-950/35 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex flex-shrink-0 flex-col gap-3 border-t border-neutral-800 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-xl border border-neutral-800 bg-black/35 p-1">
            {(["merge", "replace"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setApplyMode(mode)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  applyMode === mode
                    ? mode === "merge"
                      ? "bg-emerald-500 text-white"
                      : "bg-red-500 text-white"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                }`}
              >
                {mode === "merge" ? "Merge into deck" : "Replace current deck"}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            {phase === "review" ? (
              <button
                type="button"
                onClick={() => {
                  setPhase("input");
                  setError(null);
                }}
                disabled={busy}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-50"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-50"
            >
              Cancel
            </button>
            {phase === "input" ? (
              <button
                type="button"
                onClick={source === "url" ? previewUrl : () => previewText(text)}
                disabled={busy || source === "csv"}
                className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-black text-black transition-colors hover:bg-cyan-300 disabled:opacity-60"
              >
                {busy ? "Parsing..." : "Preview import"}
              </button>
            ) : (
              <button
                type="button"
                onClick={applyImport}
                disabled={busy || selectedRows.length === 0}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
              >
                {busy ? "Importing..." : `Import ${selectedTotal} cards`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
