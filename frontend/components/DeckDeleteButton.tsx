// components/DeckDeleteButton.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeckDeleteButton({ deckId, small, redirectTo }: { deckId: string; small?: boolean; redirectTo?: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const [open, setOpen] = useState(false);

  async function actuallyDelete(){
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
  }

  return (
    <>
      <button onClick={()=>setOpen(true)} disabled={busy} className={small ? "text-xs text-red-500 underline" : "px-3 py-1 rounded border border-red-500 text-red-500 hover:bg-red-500/10"}>
        Delete
      </button>
      {open && (()=>{ const Modal = require('./ConfirmDeleteModal').default; return (
        <Modal
          open={open}
          onCancel={()=>setOpen(false)}
          onConfirm={async()=>{ await actuallyDelete(); setOpen(false); }}
        />
      ); })()}
    </>
  );
}
