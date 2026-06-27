"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EligibleSavedDeckSelect from "@/components/tools/EligibleSavedDeckSelect";
import { ToolInfoRail } from "@/components/tools/ToolInfoRail";
import { useAuth } from "@/lib/auth-context";
import { useEligibleSavedDecks } from "@/hooks/useEligibleSavedDecks";
import { countAiWorkshopDeckCards } from "@/lib/deck/ai-workshop-deck-text";
import type { AnalyzeFormat } from "@/lib/deck/formatRules";
import { deckFormatStringToAnalyzeFormat } from "@/lib/deck/formatRules";
import { getAiDeckHalfwayMinimumCards, getSavedDeckTargetCount } from "@/lib/deck/tool-deck-eligibility";

type Mode = "saved" | "paste";
type Suggestion = {
  card: string;
  qty: number;
  zone: "mainboard" | "sideboard";
  role?: string;
  reason?: string;
  priority?: "high" | "medium" | "low";
  confidence?: number;
  estimatedUsd?: number;
  ownership?: "owned" | "missing" | "unknown";
};

const FORMATS: AnalyzeFormat[] = ["Commander", "Modern", "Pioneer", "Standard", "Pauper"];
const EXAMPLE_SUGGESTIONS: Suggestion[] = [
  {
    card: "Path to Exile",
    qty: 1,
    zone: "mainboard",
    role: "Efficient removal",
    reason: "Adds a cheap answer that keeps the deck from folding to one resolved threat.",
    priority: "high",
  },
  {
    card: "Esper Sentinel",
    qty: 1,
    zone: "mainboard",
    role: "Card draw",
    reason: "Improves early-game resource flow without pushing the curve up.",
    priority: "medium",
  },
  {
    card: "Bojuka Bog",
    qty: 1,
    zone: "mainboard",
    role: "Graveyard interaction",
    reason: "Covers a common weakness while still occupying a land slot.",
    priority: "medium",
  },
];

function normalizeQty(qty: number): number {
  return Math.max(1, Math.floor(Number(qty) || 1));
}

function suggestionKey(row: Pick<Suggestion, "card" | "zone">): string {
  return `${row.zone || "mainboard"}::${row.card.trim().toLowerCase()}`;
}

function renderSuggestionsText(rows: Suggestion[]): string {
  const main = rows.filter((row) => row.zone !== "sideboard");
  const side = rows.filter((row) => row.zone === "sideboard");
  const out = main.map((row) => `${normalizeQty(row.qty)} ${row.card}`);
  if (side.length) out.push("", "Sideboard", ...side.map((row) => `${normalizeQty(row.qty)} ${row.card}`));
  return out.join("\n");
}

function looksLikeSupportedDeckUrl(value: string): boolean {
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return false;
  return /(?:moxfield\.com|archidekt\.com)/i.test(text);
}

export default function FinishDeckToolClient() {
  const { user, loading: authLoading } = useAuth();
  const { eligibleDecks, hiddenCount, loading: decksLoading } = useEligibleSavedDecks(user?.id, { incompleteOnly: true });
  const [mode, setMode] = useState<Mode>("paste");
  const [modeTouched, setModeTouched] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const selectedDeck = useMemo(
    () => eligibleDecks.find((deck) => deck.id === selectedDeckId) ?? null,
    [eligibleDecks, selectedDeckId],
  );
  const [format, setFormat] = useState<AnalyzeFormat>("Commander");
  const [commander, setCommander] = useState("");
  const [deckText, setDeckText] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [images, setImages] = useState<Record<string, { small?: string; normal?: string }>>({});
  const [copied, setCopied] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const activeFormat = selectedDeck && mode === "saved" ? deckFormatStringToAnalyzeFormat(selectedDeck.format) : format;
  const activeDeckText = mode === "saved" ? selectedDeck?.deckText ?? "" : deckText;
  const currentCount = useMemo(
    () => countAiWorkshopDeckCards(activeDeckText, activeFormat),
    [activeDeckText, activeFormat],
  );
  const selectedRows = suggestions.filter((row) => selected.has(suggestionKey(row)));
  const selectedTotal = selectedRows.reduce((sum, row) => sum + normalizeQty(row.qty), 0);
  const targetCount = getSavedDeckTargetCount(activeFormat);

  useEffect(() => {
    if (authLoading || modeTouched) return;
    setMode(user ? "saved" : "paste");
  }, [authLoading, modeTouched, user]);

  useEffect(() => {
    if (mode !== "saved") return;
    if (selectedDeckId && eligibleDecks.some((deck) => deck.id === selectedDeckId)) return;
    if (!eligibleDecks.length) {
      if (selectedDeckId) setSelectedDeckId("");
      return;
    }
    setSelectedDeckId(eligibleDecks[0]?.id || "");
  }, [eligibleDecks, mode, selectedDeckId]);

  useEffect(() => {
    if (!suggestions.length) return;
    const names = Array.from(new Set(suggestions.map((row) => row.card)));
    fetch("/api/cards/batch-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    })
      .then((res) => res.json())
      .then((json) => {
        const next: Record<string, { small?: string; normal?: string }> = {};
        (json?.data || []).forEach((card: { name: string; image_uris?: { small?: string; normal?: string } }) => {
          if (card?.name && card?.image_uris) next[card.name] = card.image_uris;
        });
        setImages(next);
      })
      .catch(() => {});
  }, [suggestions]);

  async function runSuggestions() {
    setError(null);
    setWarnings([]);
    setCopied(false);
    setHasStarted(true);
    if (mode === "saved" && !selectedDeckId) {
      setError("Pick a saved deck first, or switch to paste mode.");
      return;
    }
    if (mode === "paste" && !deckText.trim()) {
      setError("Paste a partial decklist first.");
      return;
    }
    setBusy(true);
    try {
      let workingDeckText = deckText.trim();
      let workingFormat = format;
      let workingCommander = commander.trim();
      if (mode === "paste" && looksLikeSupportedDeckUrl(workingDeckText)) {
        const res = await fetch("/api/decks/import-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: workingDeckText }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok || !json?.deckText) throw new Error(json?.error || "Could not read that deck link.");
        workingDeckText = String(json.deckText || "").trim();
        const detectedFormat = deckFormatStringToAnalyzeFormat(String(json.format || workingFormat));
        workingFormat = detectedFormat;
        workingCommander = String(json.commander || workingCommander || "").trim();
        setDeckText(workingDeckText);
        setFormat(detectedFormat);
        if (workingCommander) setCommander(workingCommander);
      }
      const body =
        mode === "saved"
          ? { deckId: selectedDeckId, format: activeFormat, maxSuggestions: 18 }
          : { deckText: workingDeckText, commander: workingCommander || undefined, format: workingFormat, maxSuggestions: 18 };
      const res = await fetch("/api/deck/finish-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not generate suggestions.");
      const rows: Suggestion[] = Array.isArray(json.suggestions)
        ? json.suggestions
            .map((row: any) => ({
              card: String(row.card || "").trim(),
              qty: normalizeQty(Number(row.qty || 1)),
              zone: row.zone === "sideboard" ? "sideboard" : "mainboard",
              role: typeof row.role === "string" ? row.role : undefined,
              reason: typeof row.reason === "string" ? row.reason : undefined,
              priority: row.priority,
              confidence: Number(row.confidence || 0),
              estimatedUsd: Number(row.estimatedUsd || 0) || undefined,
              ownership: row.ownership,
            }))
            .filter((row: Suggestion) => row.card)
        : [];
      setSuggestions(rows);
      setSelected(new Set(rows.map((row) => suggestionKey(row))));
      setWarnings(Array.isArray(json.warnings) ? json.warnings : []);
    } catch (e: any) {
      setError(e?.message || "Could not generate suggestions.");
      setSuggestions([]);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  function changeQty(index: number, delta: number) {
    setSuggestions((rows) =>
      rows.flatMap((row, i) => {
        if (i !== index) return [row];
        const nextQty = normalizeQty(row.qty) + delta;
        return nextQty <= 0 ? [] : [{ ...row, qty: nextQty }];
      }),
    );
  }

  async function addSelectedToDeck() {
    if (!selectedDeckId || selectedRows.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      for (const row of selectedRows) {
        const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(selectedDeckId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: row.card, qty: normalizeQty(row.qty), zone: row.zone }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || `Could not add ${row.card}.`);
      }
      window.dispatchEvent(new Event("deck:changed"));
      setSuggestions((rows) => rows.filter((row) => !selected.has(suggestionKey(row))));
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message || "Could not add selected cards.");
    } finally {
      setAdding(false);
    }
  }

  async function copySelected() {
    await navigator.clipboard.writeText(renderSuggestionsText(selectedRows.length ? selectedRows : suggestions));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="min-h-[calc(100vh-82px)] bg-[#050608] text-white">
      <section className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/tools" className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200">
              Tools
            </Link>
            <h1 className="mt-2 text-4xl font-black tracking-normal sm:text-5xl">Complete This Deck</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              Pick a half-built saved deck or paste a partial list. ManaTap suggests format-aware cards, then you choose what to add.
            </p>
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[0.9fr_1.1fr] xl:grid-cols-[0.82fr_1fr_320px]">
          <div className="rounded-xl border border-white/10 bg-zinc-950/75 p-4 shadow-2xl shadow-black/30">
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-neutral-800 bg-black/40 p-1">
              {(["saved", "paste"] as Mode[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setModeTouched(true);
                    setMode(tab);
                    setError(null);
                  }}
                  className={`rounded-md px-3 py-2 text-sm font-bold transition ${
                    mode === tab ? "bg-cyan-300 text-black" : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                  }`}
                >
                  {tab === "saved" ? "Saved deck" : "Paste list"}
                </button>
              ))}
            </div>

            {mode === "saved" ? (
              <div className="space-y-4">
                {authLoading || user ? (
                  <EligibleSavedDeckSelect
                    decks={eligibleDecks}
                    hiddenCount={hiddenCount}
                    loading={decksLoading}
                    value={selectedDeckId}
                    onChange={(id) => setSelectedDeckId(id)}
                    label="Partial saved decks"
                    emptyLabel="No eligible partial saved decks yet."
                    placeholder="Choose a deck to complete"
                    hiddenHint={`Decks below halfway (${getAiDeckHalfwayMinimumCards("Commander")}+ Commander / ${getAiDeckHalfwayMinimumCards("Standard")}+ other formats) or already complete (${getSavedDeckTargetCount("Commander")} Commander / ${getSavedDeckTargetCount("Standard")} other formats) are hidden.`}
                  />
                ) : (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                    Sign in to complete a saved deck, or use paste mode.
                  </div>
                )}
                {selectedDeck ? (
                  <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-3 text-sm text-cyan-100">
                    {selectedDeck.title}: {selectedDeck.cardCount}/{targetCount} main-deck cards, {activeFormat}.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-300">
                    Format
                    <select
                      value={format}
                      onChange={(event) => setFormat(event.currentTarget.value as AnalyzeFormat)}
                      className="mt-2 w-full rounded-lg border border-neutral-700 bg-black/50 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-300"
                    >
                      {FORMATS.map((fmt) => <option key={fmt}>{fmt}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-300">
                    Commander
                    <input
                      value={commander}
                      onChange={(event) => setCommander(event.currentTarget.value)}
                      placeholder="Optional for Commander"
                      className="mt-2 w-full rounded-lg border border-neutral-700 bg-black/50 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none placeholder:text-neutral-500 focus:border-cyan-300"
                    />
                  </label>
                </div>
                <textarea
                  value={deckText}
                  onChange={(event) => setDeckText(event.currentTarget.value)}
                  rows={16}
                  placeholder={"Paste a partial decklist or a public Moxfield/Archidekt link\n\n1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n\nSideboard\n2 Duress"}
                  className="w-full resize-y rounded-lg border border-neutral-700 bg-black/50 px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-neutral-600 focus:border-cyan-300"
                />
                <p className="text-xs text-neutral-500">
                  {currentCount}/{getSavedDeckTargetCount(format)} main-deck cards detected. Public Moxfield and Archidekt links are supported here too.
                </p>
              </div>
            )}

            {error ? <div className="mt-4 rounded-lg border border-red-500/35 bg-red-950/35 px-3 py-2 text-sm text-red-200">{error}</div> : null}
            <button
              type="button"
              onClick={() => void runSuggestions()}
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-500 px-4 py-3 text-sm font-black text-white hover:from-emerald-500 hover:to-cyan-400 disabled:opacity-60"
            >
              {busy ? "Finding cards..." : "Suggest Cards"}
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-zinc-950/75 p-4 shadow-2xl shadow-black/30">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black text-white">Suggestions</h2>
                <p className="text-xs text-neutral-500">
                  {suggestions.length ? `${selectedTotal} selected cards from ${suggestions.length} rows.` : "Run the tool to get card suggestions."}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void copySelected()}
                  disabled={!suggestions.length}
                  className="rounded-lg border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                {mode === "saved" ? (
                  <button
                    type="button"
                    onClick={() => void addSelectedToDeck()}
                    disabled={!selectedDeckId || adding || selectedRows.length === 0}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {adding ? "Adding..." : "Add selected"}
                  </button>
                ) : null}
              </div>
            </div>

            {warnings.length ? (
              <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100">
                {warnings.slice(0, 3).map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            ) : null}

            <div className="max-h-[650px] space-y-2 overflow-y-auto pr-1">
              {suggestions.length === 0 ? (
                hasStarted ? (
                  <div className="rounded-lg border border-neutral-800 bg-black/35 px-3 py-8 text-center text-sm text-neutral-500">
                    Suggestions will appear here.
                  </div>
                ) : (
                  <ExampleSuggestionsPreview />
                )
              ) : suggestions.map((row, index) => {
                const key = suggestionKey(row);
                const checked = selected.has(key);
                const image = images[row.card];
                return (
                  <div key={`${key}-${index}`} className="flex gap-3 rounded-lg border border-neutral-800 bg-black/30 p-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.currentTarget.checked) next.add(key);
                          else next.delete(key);
                          return next;
                        });
                      }}
                      className="mt-6 h-4 w-4 accent-cyan-300"
                    />
                    <div className="h-[68px] w-11 flex-shrink-0 overflow-hidden rounded bg-neutral-800">
                      {image?.small || image?.normal ? (
                        <img src={image.small || image.normal} alt={row.card} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[8px] text-neutral-600">...</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => changeQty(index, -1)}
                            className="h-7 w-7 rounded border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-red-500/60 hover:text-red-300"
                            title={normalizeQty(row.qty) <= 1 ? "Remove row" : "Remove one"}
                          >
                            -
                          </button>
                          <span className="w-7 text-center font-mono text-xs text-neutral-300">{normalizeQty(row.qty)}</span>
                          <button
                            type="button"
                            onClick={() => changeQty(index, 1)}
                            className="h-7 w-7 rounded border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-emerald-500/60 hover:text-emerald-300"
                          >
                            +
                          </button>
                        </div>
                        <p className="truncate text-sm font-bold text-white">{row.card}</p>
                        <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400">{row.zone}</span>
                      </div>
                      <p className="mt-1 text-xs text-cyan-200/80">{row.role || "Deck slot"}{row.priority ? ` / ${row.priority}` : ""}</p>
                      {row.reason ? <p className="mt-1 line-clamp-3 text-xs leading-5 text-neutral-400">{row.reason}</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="lg:col-span-2 xl:col-span-1 xl:sticky xl:top-24 xl:self-start">
            <FinishDeckSideRail />
          </aside>
        </div>
      </section>
    </main>
  );
}

function FinishDeckSideRail() {
  return (
    <ToolInfoRail
      title="Complete This Deck"
      description="Turn a half-built saved deck, pasted list, or public deck link into format-aware card suggestions you can edit before applying."
      accent="emerald"
      steps={[
        {
          title: "Choose the partial",
          body: "Saved decks appear only when they are between halfway and complete. Guests can start with paste or a public link.",
          tone: "cyan",
        },
        {
          title: "ManaTap reads the gaps",
          body: "The helper checks format, current count, mainboard, sideboard, and the deck's existing plan before suggesting cards.",
          tone: "emerald",
        },
        {
          title: "Review every add",
          body: "Suggestions stay selectable and editable, with priority labels, reasons, copy output, and add-selected for saved decks.",
          tone: "purple",
        },
      ]}
      carousel={[
        {
          kicker: "Example flow",
          title: "Commander at 58/100",
          body: "ManaTap prioritizes missing ramp, removal, draw, and finishers while keeping the commander's theme intact.",
          chips: ["58 cards", "Commander", "High priority first"],
          tone: "purple",
        },
        {
          kicker: "Example flow",
          title: "Modern at 46/60",
          body: "The tool fills curve holes, flags sideboard cards separately, and avoids changing the archetype unless you ask for it.",
          chips: ["46 cards", "Modern", "Sideboard aware"],
          tone: "cyan",
        },
        {
          kicker: "Example flow",
          title: "Moxfield or Archidekt link",
          body: "Paste a public link directly, review parsed rows, then copy suggestions or add selected cards to a saved deck.",
          chips: ["Public links", "Paste mode", "Editable rows"],
          tone: "amber",
        },
      ]}
      faq={[
        {
          q: "Why are some saved decks hidden?",
          a: "Decks below halfway are too incomplete for focused finishing, and complete decks belong in Deck Checker or AI Workshop instead.",
        },
        {
          q: "Can I paste Moxfield or Archidekt?",
          a: "Yes. Paste the public URL in the list tab and ManaTap will try to read the mainboard and sideboard from it.",
        },
        {
          q: "Does sideboard stay separate?",
          a: "Yes. Copied output and saved-deck adds keep sideboard suggestions in the sideboard zone.",
        },
      ]}
      related={[
        { href: "/tools/playstyle-quiz", label: "Playstyle Quiz", sub: "Pick a direction before filling slots", tone: "purple" },
        { href: "/mtg-deck-checker", label: "Deck Checker", sub: "Audit the finished list", tone: "cyan" },
        { href: "/ai-workshop", label: "AI Workshop", sub: "Refine a deck with instructions", tone: "amber" },
      ]}
    />
  );
}

function ExampleSuggestionsPreview() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-amber-300/25 bg-black/35 p-3">
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-[44%] w-[155%] -translate-x-1/2 -translate-y-1/2 -rotate-[24deg]">
          <div className="border-y-[3px] border-amber-200/90 bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
            <p className="text-center text-[11px] font-black uppercase tracking-[0.28em] text-zinc-950">
              Example preview
            </p>
          </div>
        </div>
      </div>
      <div className="relative opacity-[0.68] saturate-[0.55]">
        {EXAMPLE_SUGGESTIONS.map((row) => (
          <div key={row.card} className="mb-2 rounded-lg border border-neutral-800 bg-black/40 p-3 last:mb-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-white">{row.qty} {row.card}</p>
                <p className="mt-1 text-xs text-cyan-200/80">{row.role} / {row.priority}</p>
              </div>
              <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400">{row.zone}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-400">{row.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
