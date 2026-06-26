"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ExportDropdown from "@/components/ExportDropdown";
import DeckCsvUpload from "@/components/DeckCsvUpload";
import RecomputeButton from "./RecomputeButton";
import FixNamesModal from "./FixNamesModal";
import DeckVersionHistory from "@/components/DeckVersionHistory";

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
  const [urlBusy, setUrlBusy] = React.useState(false);
  const [urlError, setUrlError] = React.useState<string | null>(null);

  const toggleAllPanels = () => {
    const nextHidden = !allPanelsHidden;
    setAllPanelsHidden(nextHidden);
    window.dispatchEvent(
      new CustomEvent("side-panels-toggle", {
        detail: { action: "toggle-all", show: !nextHidden },
      })
    );
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

      const saveRes = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckText: String(readJson.deckText) }),
      });
      const saveJson = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok || !saveJson?.ok) {
        throw new Error(saveJson?.error || "Could not import cards into this deck.");
      }

      setUrlOpen(false);
      setUrlValue("");
      window.dispatchEvent(new Event("deck:changed"));
      router.refresh();
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
          onClick={() => setExpanded((v) => !v)}
          className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
        >
          {expanded ? "Hide" : "Show"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-200">AI</div>
            <div className="grid gap-2">
              <Link href={`/compare-decks?deck1=${deckId}`} className="rounded-lg border border-neutral-700 bg-black/30 px-3 py-2 text-sm font-semibold text-neutral-100 hover:border-violet-300/70">
                Compare decks
              </Link>
              <RecomputeButton />
              <button onClick={() => setFixOpen(true)} className="rounded-lg border border-orange-600/50 bg-orange-600/15 px-3 py-2 text-left text-sm font-semibold text-orange-200 hover:bg-orange-600/25">
                Fix card names
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">Quick actions</div>
            <button
              onClick={toggleAllPanels}
              className="w-full rounded-lg border border-neutral-700 bg-black/30 px-3 py-2 text-left text-sm font-semibold text-neutral-100 hover:border-cyan-300/70"
              title={allPanelsHidden ? "Show all side panels" : "Hide all side panels"}
            >
              {allPanelsHidden ? "Show side panels" : "Hide side panels"}
            </button>
          </div>

          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-200">Deck tools</div>
            <div className="flex flex-wrap gap-2">
              <ExportDropdown deckId={deckId} />
              <DeckCsvUpload deckId={deckId} onFixNames={() => setFixOpen(true)} />
              <button
                type="button"
                onClick={() => setUrlOpen(true)}
                className="rounded border border-cyan-600/50 bg-cyan-600/15 px-2.5 py-1.5 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-600/25"
              >
                Import URL
              </button>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deck-url-import-title"
          onClick={() => setUrlOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-950 p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="deck-url-import-title" className="text-base font-semibold text-white">
                Import from Moxfield or Archidekt
              </h2>
              <button
                type="button"
                onClick={() => setUrlOpen(false)}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
            <input
              value={urlValue}
              onChange={(event) => setUrlValue(event.currentTarget.value)}
              placeholder="https://www.moxfield.com/decks/... or https://archidekt.com/decks/..."
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            />
            {urlError ? <div className="mt-2 text-xs text-red-400">{urlError}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUrlOpen(false)}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={urlBusy}
                onClick={importExternalUrl}
                className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                {urlBusy ? "Importing..." : "Import"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
