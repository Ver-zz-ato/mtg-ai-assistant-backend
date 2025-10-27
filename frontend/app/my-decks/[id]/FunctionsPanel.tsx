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

  return (
    <section className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-4 shadow-lg">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-1 w-1 rounded-full bg-blue-400 animate-pulse shadow-lg shadow-blue-400/50"></div>
        <h3 className="text-base font-bold bg-gradient-to-r from-blue-400 to-cyan-500 bg-clip-text text-transparent">
          Functions
        </h3>
      </div>
      <div className="space-y-3">
        {/* Compare button - bigger and prominent */}
        <Link 
          href={`/compare-decks?deck1=${deckId}`}
          className="w-full px-4 py-3 bg-gradient-to-r from-purple-600/30 to-purple-500/20 hover:from-purple-600/40 hover:to-purple-500/30 border border-purple-500/50 hover:border-purple-500/70 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
          title="Compare this deck to another"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Compare with other decks!
        </Link>

        {/* Regular function buttons */}
        <div className="flex flex-wrap gap-2 items-center">
          <ExportDropdown deckId={deckId} />
          <DeckCsvUpload deckId={deckId} />
          <RecomputeButton />
          {pub && (<a href={`/decks/${deckId}`} className="text-xs border border-emerald-500/50 bg-emerald-600/20 hover:bg-emerald-600/40 rounded px-3 py-1.5 transition-all font-medium" title="View public page" target="_blank" rel="noreferrer">Public preview</a>)}
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
            className="text-xs border border-cyan-500/50 bg-cyan-600/20 hover:bg-cyan-600/40 rounded px-3 py-1.5 transition-all font-medium"
          />
          <button onClick={async()=>{ if (!isPro) { try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { /* fallback */ alert('This is a Pro feature. Upgrade to unlock.'); } return; } setFixOpen(true); }} className="text-xs border border-orange-500/50 bg-orange-600/20 hover:bg-orange-600/40 rounded px-3 py-1.5 transition-all font-medium">Fix card names</button>
          {!isPro && (<span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span>)}
        </div>
      </div>
      {fixOpen && <FixNamesModal deckId={deckId} open={fixOpen} onClose={()=>setFixOpen(false)} />}
      
      {/* Deck Versioning (Pro feature) */}
      <div className="mt-4">
        <DeckVersionHistory deckId={deckId} isPro={isPro} />
      </div>
    </section>
  );
}
