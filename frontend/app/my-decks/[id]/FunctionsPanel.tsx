"use client";
import React from "react";
import Link from "next/link";
import ExportDropdown from "@/components/ExportDropdown";
import DeckCsvUpload from "@/components/DeckCsvUpload";
import RecomputeButton from "./RecomputeButton";
import FixNamesModal from "./FixNamesModal";
import ShareButton from "@/components/ShareButton";
import DeckVersionHistory from "@/components/DeckVersionHistory";

export default function FunctionsPanel({ deckId, isPublic, isPro }: { deckId: string; isPublic: boolean; isPro: boolean }) {
  const [expanded, setExpanded] = React.useState(false); // Start collapsed
  const [allPanelsHidden, setAllPanelsHidden] = React.useState(false);
  const [pub, setPub] = React.useState<boolean>(isPublic);
  const [fixOpen, setFixOpen] = React.useState(false);
  React.useEffect(() => { setPub(isPublic); }, [isPublic]);
  React.useEffect(() => {
    const h = (e: any) => { if (typeof e?.detail?.isPublic === 'boolean') setPub(!!e.detail.isPublic); };
    window.addEventListener('deck:visibility', h);
    return () => window.removeEventListener('deck:visibility', h);
  }, []);
  const handleMakePublic = async () => {
    // This would trigger the deck visibility change
    // The actual implementation depends on your deck visibility toggle logic
    window.dispatchEvent(new CustomEvent('deck:visibility', { detail: { isPublic: true } }));
  };
  
  const toggleAllPanels = () => {
    const currentState = allPanelsHidden;
    const newState = !currentState;
    
    setAllPanelsHidden(newState);
    
    // When allPanelsHidden is false (panels visible), we want to hide them (show: false)
    // When allPanelsHidden is true (panels hidden), we want to show them (show: true)
    // newState = !allPanelsHidden, so if newState is true (will be hidden), show should be false
    const shouldShow = !newState; // Invert: if panels will be hidden, show = false
    
    const event = new CustomEvent('side-panels-toggle', { 
      detail: { action: 'toggle-all', show: shouldShow } 
    });
    
    window.dispatchEvent(event);
  };

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-neutral-300">
            Deck Tools
          </h3>
        </div>
        <button 
          onClick={() => setExpanded(v => !v)} 
          className="text-xs bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded px-2.5 py-1 transition-colors text-neutral-300"
        >
          {expanded ? '▼ Hide' : '▶ Show'}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-2.5">
          {/* Compare button - reduced visual weight */}
          <Link 
            href={`/compare-decks?deck1=${deckId}`}
            className="w-full px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 text-neutral-200"
            title="Compare this deck to another"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Compare with other decks
          </Link>

          {/* Hide/Show All Side Panels */}
          <button
            onClick={toggleAllPanels}
            className="w-full px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 text-neutral-200"
            title={allPanelsHidden ? "Show all side panels" : "Hide all side panels"}
          >
            {allPanelsHidden ? '👁️ Show All Side Panels' : '🙈 Hide All Side Panels'}
          </button>

          {/* Regular function buttons - reduced visual weight */}
          <div className="flex flex-wrap gap-2 items-center">
            <ExportDropdown deckId={deckId} />
            <DeckCsvUpload deckId={deckId} onFixNames={() => setFixOpen(true)} />
            <RecomputeButton />
            {pub && (<a href={`/decks/${deckId}`} className="text-xs border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 rounded px-2.5 py-1.5 transition-colors font-medium text-neutral-300" title="View public page" target="_blank" rel="noreferrer">Public preview</a>)}
            <ShareButton
              url={(() => {
                const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'https://manatap.ai' : (typeof window !== 'undefined' ? window.location.origin : 'https://manatap.ai');
                return `${baseUrl}/decks/${deckId}`;
              })()} 
              type="deck"
              title="Check out this MTG deck!"
              description="Built with ManaTap AI - MTG Deck Builder"
              isPublic={pub}
              onMakePublic={handleMakePublic}
              compact
              className="text-xs border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 rounded px-2.5 py-1.5 transition-colors font-medium text-neutral-300"
            />
            <button onClick={()=>setFixOpen(true)} className="text-xs border border-orange-600/50 bg-gradient-to-r from-orange-600/20 to-red-600/20 hover:from-orange-600/30 hover:to-red-600/30 rounded px-2.5 py-1.5 transition-colors font-medium text-orange-300 hover:text-orange-200">✏️ Fix card names</button>
          </div>
          
          {/* Deck Versioning (Pro feature) */}
          <div className="mt-4">
            <DeckVersionHistory deckId={deckId} isPro={isPro} />
          </div>
        </div>
      )}
      {fixOpen && <FixNamesModal deckId={deckId} open={fixOpen} onClose={()=>setFixOpen(false)} />}
    </section>
  );
}
