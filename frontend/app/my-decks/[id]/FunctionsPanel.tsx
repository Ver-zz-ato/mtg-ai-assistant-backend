"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ExportDropdown from "@/components/ExportDropdown";
import DeckCsvUpload from "@/components/DeckCsvUpload";
import RecomputeButton from "./RecomputeButton";
import FixNamesModal from "./FixNamesModal";
import DeckVersionHistory from "@/components/DeckVersionHistory";

type ImportMode = "url" | "paste" | "csv";

export default function FunctionsPanel({
  deckId,
  isPro,
}: {
  deckId: string;
  isPublic: boolean;
  isPro: boolean;
  format?: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(true);
  const [allPanelsHidden, setAllPanelsHidden] = React.useState(false);
  const [fixOpen, setFixOpen] = React.useState(false);
  const [urlOpen, setUrlOpen] = React.useState(false);
  const [urlValue, setUrlValue] = React.useState("");
  const [pasteValue, setPasteValue] = React.useState("");
  const [importMode, setImportMode] = React.useState<ImportMode>("url");
  const [urlBusy, setUrlBusy] = React.useState(false);
  const [urlError, setUrlError] = React.useState<string | null>(null);

  const focusBuildAssistant = (eventName: string) => {
    window.dispatchEvent(new Event(eventName));
    document.getElementById("build-assistant-panel")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const runReanalysis = () => {
    window.dispatchEvent(new Event("analyzer:run"));
  };

  const actionBase = "rounded-lg border bg-black/30 px-3 py-2 text-center text-sm font-semibold transition-colors";
  const aiScanClass = `${actionBase} border-violet-500/50 text-violet-100 hover:bg-violet-500/15 hover:border-violet-300/80`;
  const aiFinishClass = `${actionBase} border-pink-500/50 text-pink-100 hover:bg-pink-500/15 hover:border-pink-300/80`;
  const aiWorkshopClass = `${actionBase} border-indigo-500/50 text-indigo-100 hover:bg-indigo-500/15 hover:border-indigo-300/80`;
  const aiCompareClass = `${actionBase} border-sky-500/50 text-sky-100 hover:bg-sky-500/15 hover:border-sky-300/80`;
  const quickReanalyseClass = `${actionBase} border-cyan-500/50 text-cyan-100 hover:bg-cyan-500/15 hover:border-cyan-300/80`;
  const quickFixClass = `${actionBase} border-orange-600/50 text-orange-200 hover:bg-orange-600/20 hover:border-orange-300/80`;
  const quickPanelsClass = `${actionBase} border-emerald-500/50 text-emerald-100 hover:bg-emerald-500/15 hover:border-emerald-300/80`;

  const toggleAllPanels = () => {
    const nextHidden = !allPanelsHidden;
    setAllPanelsHidden(nextHidden);
    window.dispatchEvent(
      new CustomEvent("side-panels-toggle", {
        detail: { action: "toggle-all", show: !nextHidden },
      })
    );
  };

  const toggleExpanded = () => {
    setExpanded((current) => {
      const next = !current;
      window.dispatchEvent(new CustomEvent("deck-actions-visibility", { detail: { visible: next } }));
      return next;
    });
  };

  const closeImportModal = () => {
    setUrlOpen(false);
    setUrlError(null);
  };

  async function saveDeckTextToDeck(deckText: string) {
    const saveRes = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckText }),
    });
    const saveJson = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok || !saveJson?.ok) {
      throw new Error(saveJson?.error || "Could not import cards into this deck.");
    }
  }

  const completeImport = () => {
    setUrlOpen(false);
    setUrlValue("");
    setPasteValue("");
    setUrlError(null);
    window.dispatchEvent(new Event("deck:changed"));
    router.refresh();
  };

  async function importExternalUrl() {
    const url = urlValue.trim();
    if (!url) {
      setUrlError("Paste a Moxfield or Archidekt URL first.");
      return;
    }
    setUrlBusy(true);
    setUrlError(null);
    try {
      const readRes = await fetch("/api/decks/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const readJson = await readRes.json().catch(() => ({}));
      if (!readRes.ok || !readJson?.ok || !readJson?.deckText) {
        throw new Error(readJson?.error || "Could not read that deck URL.");
      }

      await saveDeckTextToDeck(String(readJson.deckText));
      completeImport();
    } catch (err: unknown) {
      setUrlError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setUrlBusy(false);
    }
  }

  async function importPastedDecklist() {
    const deckText = pasteValue.trim();
    if (!deckText) {
      setUrlError("Paste a decklist first.");
      return;
    }
    setUrlBusy(true);
    setUrlError(null);
    try {
      await saveDeckTextToDeck(deckText);
      completeImport();
    } catch (err: unknown) {
      setUrlError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setUrlBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/45 p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-300">Deck actions</h3>
        <button
          onClick={toggleExpanded}
          className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
        >
          {expanded ? "Hide" : "Show"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-3">
            <div className="mb-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-violet-200">AI ✨</div>
            <div className="grid gap-2">
              <button
                onClick={() => focusBuildAssistant("deck:ai-scan-focus")}
                className={aiScanClass}
                title="Open the AI scan results for mana, draw, interaction, and win-condition health."
              >
                AI deck scan
              </button>
              <button
                onClick={() => focusBuildAssistant("deck:finish-open")}
                className={aiFinishClass}
                title="Ask AI to suggest cards needed to complete the deck."
              >
                Finish this Deck
              </button>
              <Link
                href={`/ai-workshop?deckId=${deckId}`}
                className={aiWorkshopClass}
                title="Open focused AI passes for mana, curve, budget, power, and legality."
              >
                AI Workshop
              </Link>
              <Link
                href={`/compare-decks?deck1=${deckId}`}
                className={aiCompareClass}
                title="Compare this deck side-by-side with another deck."
              >
                Compare decks
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3">
            <div className="mb-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">Quick actions</div>
            <div className="grid gap-2">
              <button
                onClick={runReanalysis}
                className={quickReanalyseClass}
                title="Refresh the deck analysis using the current card list."
              >
                Re-analyse
              </button>
              <button
                onClick={() => setFixOpen(true)}
                className={quickFixClass}
                title="Find unrecognised or messy card names and match them to valid card names."
              >
                Fix card names
              </button>
              <button
                onClick={toggleAllPanels}
                className={quickPanelsClass}
              >
                {allPanelsHidden ? "Show side panels" : "Hide all side panels"}
              </button>
              <div className="flex flex-wrap justify-center gap-2">
                <ExportDropdown deckId={deckId} label="Export" title="Export, copy, or send this deck to another deck tool." />
                <button
                  type="button"
                  onClick={() => setUrlOpen(true)}
                  className="rounded border border-cyan-600/50 bg-cyan-600/15 px-2.5 py-1.5 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-600/25"
                  title="Import cards from CSV, Moxfield, or Archidekt into this deck."
                >
                  Import
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
            <div className="mb-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-amber-200">Deck tools</div>
            <div className="flex flex-wrap justify-center gap-2">
              <RecomputeButton />
            </div>
            <div className="mt-3">
              <DeckVersionHistory deckId={deckId} isPro={isPro} />
            </div>
          </div>
        </div>
      ) : null}

      {fixOpen ? <FixNamesModal deckId={deckId} open={fixOpen} onClose={() => setFixOpen(false)} /> : null}

      {urlOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deck-import-title"
          onClick={closeImportModal}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-cyan-500/30 bg-neutral-950 shadow-2xl shadow-cyan-950/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_34%),linear-gradient(135deg,rgba(88,28,135,0.3),rgba(8,47,73,0.18),rgba(0,0,0,0.2))] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                    Deck import
                  </div>
                  <h2 id="deck-import-title" className="text-xl font-black text-white">
                    Import into this deck
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-neutral-300">
                    Bring cards in from a public deck URL, pasted list, or CSV. ManaTap will parse the list and add it to this deck.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeImportModal}
                  className="rounded-lg border border-neutral-700 bg-black/30 px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-neutral-800"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-neutral-800 bg-black/35 p-1">
                {[
                  { key: "url" as const, label: "Deck URL", tone: "cyan" },
                  { key: "paste" as const, label: "Paste list", tone: "amber" },
                  { key: "csv" as const, label: "CSV", tone: "violet" },
                ].map((tab) => {
                  const active = importMode === tab.key;
                  const activeClass =
                    tab.tone === "cyan"
                      ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                      : tab.tone === "amber"
                        ? "border-amber-400/60 bg-amber-400/15 text-amber-100"
                        : "border-violet-400/60 bg-violet-400/15 text-violet-100";
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setImportMode(tab.key);
                        setUrlError(null);
                      }}
                      className={`rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
                        active ? activeClass : "border-transparent text-neutral-400 hover:bg-neutral-900 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {importMode === "url" ? (
                <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-4">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">
                    Moxfield or Archidekt link
                  </label>
                  <input
                    value={urlValue}
                    onChange={(event) => setUrlValue(event.currentTarget.value)}
                    placeholder="https://www.moxfield.com/decks/... or https://archidekt.com/decks/..."
                    className="w-full rounded-lg border border-cyan-500/40 bg-black/50 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-cyan-300"
                  />
                  <p className="mt-2 text-xs text-cyan-100/75">
                    Supports public Moxfield and Archidekt deck links, then imports through the normal ManaTap deck parser.
                  </p>
                </div>
              ) : null}

              {importMode === "paste" ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-amber-200">
                    Paste decklist
                  </label>
                  <textarea
                    value={pasteValue}
                    onChange={(event) => setPasteValue(event.currentTarget.value)}
                    placeholder={"1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n36 Mountain"}
                    rows={10}
                    className="min-h-56 w-full resize-y rounded-lg border border-amber-500/35 bg-black/50 px-3 py-2 font-mono text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-amber-300"
                  />
                  <p className="mt-2 text-xs text-amber-100/75">
                    Handles the same line formats as the main decklist import, including quantities and basic sideboard-style sections.
                  </p>
                </div>
              ) : null}

              {importMode === "csv" ? (
                <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-200">CSV import</div>
                  <p className="mb-3 text-sm text-neutral-300">
                    Upload a CSV from your collection or another deck tool. Use fix names afterwards if any card names need matching.
                  </p>
                  <DeckCsvUpload deckId={deckId} onFixNames={() => setFixOpen(true)} onDone={completeImport} label="Import CSV" />
                </div>
              ) : null}

              {urlError ? (
                <div className="mt-3 rounded-lg border border-red-500/35 bg-red-950/35 px-3 py-2 text-sm text-red-200">
                  {urlError}
                </div>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeImportModal}
                  className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                >
                  Cancel
                </button>
                {importMode !== "csv" ? (
                  <button
                    type="button"
                    disabled={urlBusy}
                    onClick={importMode === "url" ? importExternalUrl : importPastedDecklist}
                    className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-black text-black transition-colors hover:bg-cyan-300 disabled:opacity-60"
                  >
                    {urlBusy ? "Importing..." : "Import"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
