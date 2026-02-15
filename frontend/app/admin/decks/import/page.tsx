"use client";

import React from "react";
import Link from "next/link";

type Result = { title: string; success: boolean; error?: string; deckId?: string; url?: string };

export default function BulkImportDecksPage() {
  const [uploading, setUploading] = React.useState(false);
  const [fetching, setFetching] = React.useState(false);
  const [discovering, setDiscovering] = React.useState(false);
  const [urlInput, setUrlInput] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Result[] | null>(null);
  const [summary, setSummary] = React.useState<{ total: number; successful: number; failed: number } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setMsg(null);
    setResults(null);
    setSummary(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/admin/decks/bulk-import", {
        method: "POST",
        body: form,
      });
      const j = await r.json();
      if (j?.ok) {
        setResults(j.results ?? []);
        setSummary(j.summary ?? null);
        setMsg(`Imported ${j.summary?.successful ?? 0} of ${j.summary?.total ?? 0} decks`);
      } else {
        setMsg(j?.error ?? "Import failed");
      }
    } catch (err) {
      setMsg(String(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleFetchUrls() {
    const lines = urlInput.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      setMsg("Paste at least one Moxfield or Archidekt URL");
      return;
    }
    setFetching(true);
    setMsg(null);
    setResults(null);
    setSummary(null);
    try {
      const r = await fetch("/api/admin/decks/fetch-from-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: lines }),
      });
      const j = await r.json();
      if (j?.ok) {
        setResults(j.results ?? []);
        setSummary(j.summary ?? null);
        setMsg(`Fetched and imported ${j.summary?.successful ?? 0} of ${j.summary?.total ?? 0} decks`);
      } else {
        setMsg(j?.error ?? "Fetch failed");
      }
    } catch (err) {
      setMsg(String(err));
    } finally {
      setFetching(false);
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    setMsg(null);
    setResults(null);
    setSummary(null);
    try {
      const r = await fetch("/api/admin/decks/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_popular: true, decks_per: 3 }),
      });
      const j = await r.json();
      if (j?.ok) {
        setResults(j.results ?? []);
        setSummary(j.summary ?? null);
        setMsg(`Discovered and imported ${j.summary?.successful ?? 0} of ${j.summary?.total ?? 0} decks`);
      } else {
        setMsg(j?.error ?? "Discover failed");
      }
    } catch (err) {
      setMsg(String(err));
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bulk Import Public Decks</h1>
        <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white">
          ← Admin
        </Link>
      </div>

      <p className="text-sm text-neutral-400">
        Discover decks on Moxfield, fetch by URL, or upload CSV. All imported as public decks.
      </p>

      {/* Discover & Import */}
      <div className="rounded border border-emerald-900/50 bg-emerald-950/20 p-4 space-y-3">
        <p className="text-sm font-medium text-emerald-200">Discover & Import</p>
        <p className="text-xs text-neutral-400">
          Searches Moxfield for 100 popular commanders and imports the top 3 decks per commander. One click.
        </p>
        <button
          onClick={handleDiscover}
          disabled={discovering}
          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm"
        >
          {discovering ? "Searching Moxfield…" : "Discover & Import Popular Decks"}
        </button>
      </div>

      {/* Fetch from URLs */}
      <div className="rounded border border-neutral-700 bg-neutral-900/50 p-4 space-y-3">
        <p className="text-sm font-medium">Fetch from URLs</p>
        <p className="text-xs text-neutral-400">
          Paste Moxfield or Archidekt deck URLs (one per line). We fetch and import them. Commander decks only (96–101 cards).
        </p>
        <textarea
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://moxfield.com/decks/Abc123
https://archidekt.com/decks/12345"
          rows={4}
          className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm font-mono"
        />
        <button
          onClick={handleFetchUrls}
          disabled={fetching}
          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm"
        >
          {fetching ? "Fetching…" : "Fetch & Import"}
        </button>
      </div>

      <div className="rounded border border-neutral-700 bg-neutral-900/50 p-4 space-y-3">
        <p className="text-sm font-medium">Or upload CSV</p>
        <p className="text-xs text-neutral-400">
          Columns: <code className="bg-neutral-800 px-1 rounded">title</code>, <code className="bg-neutral-800 px-1 rounded">commander</code>, <code className="bg-neutral-800 px-1 rounded">decklist</code> (or deck_text, deck, list, cards). Decklist: one card per line, <code className="bg-neutral-800 px-1 rounded">1 Card Name</code> or <code className="bg-neutral-800 px-1 rounded">2x Card Name</code>. First line = commander. Commander: 96–101 cards. Other formats: 58–61.
        </p>
        <p className="text-xs text-neutral-500">
          Export from Moxfield/Archidekt → copy decklist → paste into spreadsheet → save as CSV.
        </p>
      </div>

      {msg && (
        <div className="rounded border border-neutral-700 bg-neutral-900/50 px-4 py-2 text-sm text-neutral-200">
          {msg}
        </div>
      )}

      <div className="flex gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm"
        >
          {uploading ? "Importing…" : "Upload CSV"}
        </button>
        <Link
          href="/decks/browse"
          className="px-4 py-2 rounded border border-neutral-600 hover:bg-neutral-800 text-sm"
        >
          Browse Decks
        </Link>
      </div>

      {summary && (
        <div className="rounded border border-neutral-700 p-4">
          <p className="text-sm font-medium mb-2">Summary</p>
          <p className="text-sm text-neutral-400">
            {summary.successful} imported, {summary.failed} failed (of {summary.total})
          </p>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="rounded border border-neutral-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-900 border-b border-neutral-700">
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className={`border-b border-neutral-800 ${r.success ? "" : "bg-red-950/20"}`}>
                  <td className="p-3">{r.title}</td>
                  <td className="p-3">
                    {r.success ? (
                      <span className="text-green-400">✓</span>
                    ) : (
                      <span className="text-red-400">✗</span>
                    )}
                  </td>
                  <td className="p-3 text-neutral-400">
                    {r.success ? (
                      r.deckId ? (
                        <a href={`/decks/${r.deckId}`} className="text-cyan-400 hover:underline">
                          View
                        </a>
                      ) : (
                        "—"
                      )
                    ) : (
                      r.error ?? "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
