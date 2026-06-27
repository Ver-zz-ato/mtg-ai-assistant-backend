"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ExportDropdown from "@/components/ExportDropdown";
import DeckImportReviewModal from "@/components/DeckImportReviewModal";
import RecomputeButton from "./RecomputeButton";
import FixNamesModal from "./FixNamesModal";
import DeckVersionHistory from "@/components/DeckVersionHistory";

export default function FunctionsPanel({
  deckId,
  isPro,
  format,
}: {
  deckId: string;
  isPublic: boolean;
  isPro: boolean;
  format?: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [allPanelsHidden, setAllPanelsHidden] = React.useState(false);
  const [fixOpen, setFixOpen] = React.useState(false);
  const [urlOpen, setUrlOpen] = React.useState(false);

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
  };

  const completeImport = () => {
    setUrlOpen(false);
    window.dispatchEvent(new Event("deck:changed"));
    router.refresh();
  };

  return (
    <section className={`rounded-xl border p-3 transition-all ${
      expanded
        ? "border-violet-500/35 bg-neutral-900/45 shadow-sm"
        : "border-fuchsia-400/50 bg-gradient-to-r from-fuchsia-500/18 via-violet-500/12 to-cyan-500/14 shadow-[0_0_30px_rgba(217,70,239,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-fuchsia-100 drop-shadow-[0_0_10px_rgba(217,70,239,0.55)]">
          Deck actions
        </h3>
        <button
          onClick={toggleExpanded}
          className="rounded-lg border border-fuchsia-300/40 bg-fuchsia-400/15 px-3 py-1.5 text-xs font-bold text-fuchsia-100 transition-colors hover:border-fuchsia-200/70 hover:bg-fuchsia-400/25"
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
            <div className="grid w-full grid-cols-1 gap-2 [&_button]:w-full">
              <div className="w-full">
                <RecomputeButton />
              </div>
              <DeckVersionHistory deckId={deckId} isPro={isPro} />
            </div>
          </div>
        </div>
      ) : null}

      {fixOpen ? <FixNamesModal deckId={deckId} open={fixOpen} onClose={() => setFixOpen(false)} /> : null}

      <DeckImportReviewModal
        deckId={deckId}
        format={format}
        open={urlOpen}
        onClose={closeImportModal}
        onDone={completeImport}
      />
    </section>
  );
}
