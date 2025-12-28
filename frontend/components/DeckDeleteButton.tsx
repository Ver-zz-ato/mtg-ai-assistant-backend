// components/DeckDeleteButton.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeckDeleteButton({ deckId, deckName, small, redirectTo }: { deckId: string; deckName?: string; small?: boolean; redirectTo?: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [fetchedDeckName, setFetchedDeckName] = useState<string>(deckName || '');

  // Fetch deck name when opening modal if not provided
  const handleOpen = async () => {
    setOpen(true);
    if (!deckName && !fetchedDeckName) {
      try {
        const deckRes = await fetch(`/api/decks/get?id=${encodeURIComponent(deckId)}`);
        const deckData = await deckRes.json();
        if (deckData?.ok && deckData.deck) {
          setFetchedDeckName(deckData.deck.title || deckData.deck.name || 'Untitled');
        }
      } catch (e) {
        console.error('Failed to fetch deck name:', e);
      }
    }
  };

  async function actuallyDelete(){
    setOpen(false); // Close confirmation dialog
    
    // First, get the deck data for undo
    try {
      const deckRes = await fetch(`/api/decks/get?id=${encodeURIComponent(deckId)}`);
      const deckData = await deckRes.json();
      
      if (deckData?.ok && deckData.deck) {
        const deck = deckData.deck;
        const finalDeckName = deckName || fetchedDeckName || deck.title || deck.name || 'Untitled';
        
        // Use undo toast
        const { undoToastManager } = await import('@/lib/undo-toast');
        
        undoToastManager.showUndo({
          id: `delete-deck-${deckId}`,
          message: `Deleting deck: ${finalDeckName}`,
          duration: 8000, // 8 seconds for deck deletion
          onUndo: async () => {
            // Restore the deck by re-creating it
            try {
              const restoreRes = await fetch("/api/decks/create", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  name: deck.name,
                  format: deck.format,
                  deck_text: deck.deck_text,
                  commander: deck.commander,
                  colors: deck.colors,
                }),
              });
              const restoreJson = await restoreRes.json();
              if (restoreJson?.ok) {
                router.refresh();
              } else {
                alert('Failed to restore deck');
              }
            } catch (e) {
              console.error('Failed to undo delete:', e);
              alert('Failed to restore deck');
            }
          },
          onExecute: async () => {
            // Actually delete the deck
            setBusy(true);
            try {
              const res = await fetch("/api/decks/delete", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id: deckId }),
              });
              const json = await res.json().catch(() => ({}));
              if (!res.ok || json?.ok === false) throw new Error(json?.error || "Delete failed");
              if (redirectTo) {
                try { window.location.href = redirectTo; return; } catch {}
              }
              router.refresh();
            } catch (e) {
              alert((e as any)?.message || "Delete failed");
            } finally {
              setBusy(false);
            }
          },
        });
      } else {
        // Fallback to immediate deletion if we can't get deck data
        setBusy(true);
        const res = await fetch("/api/decks/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: deckId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) throw new Error(json?.error || "Delete failed");
        if (redirectTo) {
          try { window.location.href = redirectTo; return; } catch {}
        }
        router.refresh();
        setBusy(false);
      }
    } catch (e) {
      alert((e as any)?.message || "Delete failed");
      setBusy(false);
    }
  }

  return (
    <>
      <button 
        onClick={handleOpen} 
        disabled={busy} 
        className="px-3 py-1 rounded border border-red-500 text-red-500 hover:bg-red-500/10 transition-colors"
      >
        Delete
      </button>
      {open && (()=>{ const Modal = require('./ConfirmDeleteModal').default; return (
        <Modal
          open={open}
          onCancel={()=>setOpen(false)}
          onConfirm={actuallyDelete}
          deckName={deckName || fetchedDeckName}
        />
      ); })()}
    </>
  );
}
