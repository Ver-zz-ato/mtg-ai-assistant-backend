"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Collection = {
  id: string;
  name: string;
  created_at: string | null;
};

export default function CollectionsPageClient() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadCollections() {
    setLoading(true);
    try {
      const res = await fetch("/api/collections/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      const cols: Collection[] = data.collections ?? [];
      setCollections(cols);
      if (cols.length && !selectedId) setSelectedId(cols[0].id);
    } catch (e: any) {
      alert("Failed to load collections: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCollections();
  }, []);

  async function onCreate() {
    const name = newName.trim();
    if (!name) {
      alert("Enter a name");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/collections/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setNewName("");
      await loadCollections();
    } catch (e: any) {
      alert("Create failed: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) {
      alert("Pick a collection");
      return;
    }
    if (!file) {
      alert("Pick a CSV file");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("collection_id", selectedId);
      fd.append("file", file);

      const res = await fetch("/api/collections/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);

      alert(`Uploaded ${data.inserted ?? data.count ?? 0} rows`);
      setFile(null);
    } catch (e: any) {
      alert("Upload failed: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function onCopyId() {
    if (!selectedId) return;
    try {
      await navigator.clipboard.writeText(selectedId);
      alert("Copied collection ID");
    } catch {
      alert("Failed to copy");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Collections</h1>

      {/* Create collection */}
      <div className="rounded-xl border p-4 flex gap-2 items-center">
        <input
          placeholder="New collection name"
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          onClick={onCreate}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
          disabled={busy}
          title="Create new collection"
        >
          Create
        </button>
      </div>

      {/* Upload CSV */}
      <div className="rounded-xl border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Upload CSV to a collection</div>
          <div className="text-xs opacity-70 font-mono truncate">
            {selectedId ? `ID: ${selectedId}` : ""}
          </div>
        </div>

        <form
          className="flex flex-col sm:flex-row gap-2 items-stretch"
          onSubmit={onUpload}
        >
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={busy || loading}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            type="file"
            accept=".csv,text/csv"
            className="rounded-lg border px-3 py-2 text-sm flex-1"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCopyId}
              className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
              disabled={!selectedId}
            >
              Copy ID
            </button>

            <button
              type="submit"
              className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
              disabled={busy}
            >
              Upload
            </button>
          </div>
        </form>

        <div className="text-xs opacity-70">
          CSV headers accepted: <code>name,qty</code> (also <code>quantity</code>,{" "}
          <code>count</code>, <code>owned</code>). Bare lines like <code>2,Sol Ring</code> also
          work.
        </div>
      </div>

      {/* Existing collections */}
      <div className="space-y-3">
        {loading ? (
          <div className="rounded-xl border p-4 text-sm opacity-75">Loading…</div>
        ) : collections.length ? (
          collections.map((c) => {
            const created = c.created_at
              ? new Date(c.created_at).toLocaleString()
              : "";
            return (
              <div
                key={c.id}
                className="rounded-xl border p-4 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs opacity-70">{created}</div>
                </div>
                <Link
                  href={`/collections/${encodeURIComponent(c.id)}`}
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5"
                  title="View collection"
                >
                  View
                </Link>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border p-4 text-sm">No collections yet.</div>
        )}
      </div>
    </main>
  );
}
