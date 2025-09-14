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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1200);
  }

  async function loadCollections() {
    setLoading(true);
    try {
      const res = await fetch("/api/collections/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setCollections(data.collections ?? []);
    } catch (e: any) {
      alert("Failed to load collections: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCollections(); }, []);

  async function createCollection() {
    if (!newName.trim()) return;
    const res = await fetch("/api/collections/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      showToast(json?.error || `Create failed (HTTP ${res.status})`);
      return;
    }
    setNewName("");
    showToast("Collection created");
    await loadCollections();
  }

  async function deleteCollection(id: string) {
    const ok = confirm("Delete this collection? This cannot be undone.");
    if (!ok) return;
    const res = await fetch("/api/collections/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      alert(json?.error || "Delete failed");
      return;
    }
    showToast("Deleted");
    setCollections(prev => prev.filter(c => c.id !== id));
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 relative">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Collections</h1>
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New collection name"
            className="border rounded px-2 py-1 text-sm bg-transparent"
          />
          <button onClick={createCollection} className="border rounded px-2 py-1 text-sm">Create</button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm opacity-70">Loading…</div>
      ) : collections.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
