"use client";
import React from "react";
import ProAutoToggle from "./ProAutoToggle";
import CopyDecklistButton from "@/components/CopyDecklistButton";
import ExportDeckCSV from "@/components/ExportDeckCSV";
import DeckCsvUpload from "@/components/DeckCsvUpload";
import RecomputeButton from "./RecomputeButton";
import FixNamesModal from "./FixNamesModal";

export default function FunctionsPanel({ deckId, isPublic, isPro }: { deckId: string; isPublic: boolean; isPro: boolean }) {
  const [pub, setPub] = React.useState<boolean>(isPublic);
  const [fixOpen, setFixOpen] = React.useState(false);
  React.useEffect(() => { setPub(isPublic); }, [isPublic]);
  React.useEffect(() => {
    const h = (e: any) => { if (typeof e?.detail?.isPublic === 'boolean') setPub(!!e.detail.isPublic); };
    window.addEventListener('deck:visibility', h);
    return () => window.removeEventListener('deck:visibility', h);
  }, []);
  const share = async () => {
    try {
      if (!pub) { alert('This deck is private. Make it Public first to get a shareable link.'); return; }
      const url = `${window.location.origin}/decks/${deckId}`;
      if ((navigator as any).share) { try { await (navigator as any).share({ title: 'Share deck', url }); return; } catch {} }
      await navigator.clipboard?.writeText?.(url);
      try { const { toast } = await import('@/lib/toast-client'); toast('Share link copied', 'success'); } catch { /* fallback */ }
    } catch { try { const { toastError } = await import('@/lib/toast-client'); toastError('Could not copy link'); } catch { alert('Could not copy link'); } }
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
        <button onClick={share} className="text-xs border rounded px-2 py-1">Share deck</button>
        <button onClick={async()=>{ if (!isPro) { try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { /* fallback */ alert('This is a Pro feature. Upgrade to unlock.'); } return; } setFixOpen(true); }} className="text-xs border rounded px-2 py-1">Fix card names</button>
        {!isPro && (<span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span>)}
      </div>
      {fixOpen && <FixNamesModal deckId={deckId} open={fixOpen} onClose={()=>setFixOpen(false)} />}
    </section>
  );
}
