// components/DeckDeleteButton.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeckDeleteButton({ deckId, small }: { deckId: string; small?: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function del() {
    if (!confirm("Delete this deck? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/decks/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: deckId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Delete failed");
      // Refresh list page after deletion
      router.refresh();
    } catch (e) {
      alert((e as any)?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={del} disabled={busy} className={small ? "text-xs text-red-500 underline" : "px-3 py-1 rounded border border-red-500 text-red-500 hover:bg-red-500/10"}>
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
