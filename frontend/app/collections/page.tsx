// app/collections/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Collection = { id: string; name: string; created_at: string | null };

export default function CollectionsPageClient() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  }

  async function loadCollections() {
    setLoading(true);
    try {
      const res = await fetch("/api/collections/list", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to load");
      setCollections(json.collections || []);
    } catch (e: any) {
      showToast(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCollections(); }, []);

  async function createCollection() {
    setNameError(null);
    const name = (newName || "").trim();
    if (!name) return;
    try {
      const res = await fetch("/api/collections/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) { 
        const msg = (json?.error || "Create failed"); 
        setNameError(String(msg)); 
        throw new Error(msg); 
      }
      setNewName(""); 
      setNameError(null);
      await loadCollections();
      showToast("Collection created");
    } catch (e: any) {
      showToast(e?.message || "Create failed");
    }
  }

  async function deleteCollection(id: string) {
    if (!confirm("Delete this collection?")) return;
    try {
      const res = await fetch("/api/collections/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Delete failed");
      await loadCollections();
      showToast("Deleted");
    } catch (e: any) {
      showToast(e?.message || "Delete failed");
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Collections</h1>
        <Link href="/collections/cost-to-finish" className="text-sm underline underline-offset-4">
          Open Cost to Finish →
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => { setNewName(e.target.value); if (nameError) setNameError(null); }}
          placeholder="New collection name"
          className="flex-1 bg-neutral-900 text-white border border-neutral-700 rounded px-3 py-2"
        />
        <button onClick={createCollection} className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-60">
          Create
        </button>
      </div>
      {nameError && (<p className="text-xs text-red-500 mt-1">{nameError}</p>)}

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : collections.length > 0 ? (
        <div className="space-y-2">
          {collections.map((c) => {
            const created = c.created_at ? new Date(c.created_at).toLocaleString() : "";
            return (
              <div key={c.id} className="border rounded p-3 flex items-center justify-between">
                <Link href={`/collections/${c.id}`} className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs opacity-70">{created}</div>
                </Link>
                <button onClick={() => deleteCollection(c.id)} className="text-sm text-red-500 underline">Delete</button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border p-4 text-sm">No collections yet.</div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded bg-black/80 text-white text-xs px-3 py-2 shadow">
          {toast}
        </div>
      )}
    </main>
  );
}
