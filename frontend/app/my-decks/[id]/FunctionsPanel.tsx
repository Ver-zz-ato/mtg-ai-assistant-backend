"use client";
import React from "react";
import ProAutoToggle from "./ProAutoToggle";
import CopyDecklistButton from "@/components/CopyDecklistButton";
import ExportDeckCSV from "@/components/ExportDeckCSV";
import DeckCsvUpload from "@/components/DeckCsvUpload";
import RecomputeButton from "./RecomputeButton";
import FixNamesModal from "./FixNamesModal";
import ShareButton from "@/components/ShareButton";

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
    <section className="rounded-xl border border-neutral-800 p-3 space-y-2">
      <div className="text-sm font-medium">Functions</div>
      <div className="flex flex-wrap gap-2 items-center">
        {isPro ? <ProAutoToggle /> : (<span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span>)}
        <CopyDecklistButton deckId={deckId} className="text-xs border rounded px-2 py-1" />
        <ExportDeckCSV deckId={deckId} className="text-xs border rounded px-2 py-1" />
        <DeckCsvUpload deckId={deckId} />
        <RecomputeButton />
        {pub && (<a href={`/decks/${deckId}`} className="text-xs border rounded px-2 py-1" title="View public page" target="_blank" rel="noreferrer">Public preview</a>)}
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
          className="text-xs border rounded px-2 py-1"
        />
        <button onClick={async()=>{ if (!isPro) { try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { /* fallback */ alert('This is a Pro feature. Upgrade to unlock.'); } return; } setFixOpen(true); }} className="text-xs border rounded px-2 py-1">Fix card names</button>
        {!isPro && (<span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span>)}
      </div>
      {fixOpen && <FixNamesModal deckId={deckId} open={fixOpen} onClose={()=>setFixOpen(false)} />}
    </section>
  );
}
