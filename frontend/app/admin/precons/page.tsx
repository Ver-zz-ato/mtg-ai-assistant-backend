"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ELI5 } from "@/components/AdminHelp";

export default function AdminPreconsPage() {
  const [name, setName] = useState("");
  const [commander, setCommander] = useState("");
  const [colors, setColors] = useState("");
  const [preconSetName, setPreconSetName] = useState("");
  const [releaseYear, setReleaseYear] = useState(new Date().getFullYear().toString());
  const [deckText, setDeckText] = useState("");
  const [sqlInput, setSqlInput] = useState("");
  const [inserting, setInserting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function handleInsert() {
    if (!name || !commander || !deckText || !preconSetName || !releaseYear) {
      setMsg("Fill all required fields");
      return;
    }
    setInserting(true);
    setMsg(null);
    try {
      // eslint-disable-next-line no-restricted-globals -- intentional: POST /api/admin/*
      const res = await fetch("/api/admin/precons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          commander,
          colors: colors.split(/[\s,]+/).filter(Boolean),
          format: "Commander",
          deck_text: deckText,
          set_name: preconSetName,
          release_year: parseInt(releaseYear, 10),
        }),
      });
      const j = await res.json();
      if (j.ok) {
        setMsg(`Inserted: ${j.precon?.name}`);
        setName("");
        setCommander("");
        setColors("");
        setPreconSetName("");
        setDeckText("");
      } else {
        setMsg(j.error || "Insert failed");
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setInserting(false);
    }
  }

  async function handleWestlySync() {
    if (
      !confirm(
        "Replace ALL precon_decks with the latest catalog from Westly/CommanderPrecons on GitHub? This deletes existing rows and re-imports."
      )
    ) {
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      // eslint-disable-next-line no-restricted-globals -- intentional: POST /api/admin/*
      const res = await fetch("/api/admin/precons/sync", {
        method: "POST",
        credentials: "include",
      });
      const j = await res.json();
      if (j.ok) {
        setSyncMsg(
          `Synced ${j.inserted} precons (${j.dbCount} in DB). ${j.fileErrors || 0} file errors. ${Math.round(j.durationMs / 1000)}s`
        );
      } else {
        setSyncMsg(j.error || "Sync failed");
      }
    } catch (e: unknown) {
      setSyncMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-gray-400 hover:text-white mb-2 inline-block">
          ← Admin
        </Link>
        <h1 className="text-xl font-semibold">Precon Decks Admin</h1>
        <p className="text-sm text-neutral-400">
          Insert precons via form, sync the full catalog from GitHub, or run generated SQL in Supabase.
        </p>
      </div>

      <ELI5
        heading="Ways to add precons"
        items={[
          "Sync from GitHub: One click replaces precon_decks with the latest community catalog (Westly/CommanderPrecons). Same data as the local import script.",
          "Form below: Insert one precon at a time (name, commander, deck list, set, year).",
          "Generate SQL: Run the script locally to output precon_decks_all.sql for Supabase SQL Editor.",
        ]}
      />

      {/* Westly sync */}
      <section className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 space-y-3">
        <h2 className="font-medium text-emerald-100">Sync from Westly/CommanderPrecons (GitHub)</h2>
        <p className="text-sm text-gray-400">
          Fetches all official Commander precon JSON from the{" "}
          <a
            href="https://github.com/Westly/CommanderPrecons"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:underline"
          >
            Westly/CommanderPrecons
          </a>{" "}
          repo (community-maintained; new sets appear there when contributors add decklists), then replaces{" "}
          <code className="bg-neutral-800 px-1 rounded">precon_decks</code> in Supabase. Browse/clone on{" "}
          <Link href="/decks/browse" className="text-emerald-400 hover:underline">
            /decks/browse
          </Link>{" "}
          updates immediately.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleWestlySync}
            disabled={syncing}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 rounded text-sm font-medium"
          >
            {syncing ? "Syncing…" : "Sync precons from GitHub"}
          </button>
          {syncMsg && <span className="text-sm text-gray-300">{syncMsg}</span>}
        </div>
      </section>

      {/* Insert form */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
        <h2 className="font-medium">Insert Single Precon</h2>
        <div className="grid gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Arcane Maelstrom"
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Commander *</label>
            <input
              value={commander}
              onChange={(e) => setCommander(e.target.value)}
              placeholder="Kalamax, the Stormsire"
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Colors (W U B R G)</label>
              <input
                value={colors}
                onChange={(e) => setColors(e.target.value)}
                placeholder="G U R"
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Release Year *</label>
              <input
                value={releaseYear}
                onChange={(e) => setReleaseYear(e.target.value)}
                placeholder="2024"
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Set Name *</label>
            <input
            value={preconSetName}
            onChange={(e) => setPreconSetName(e.target.value)}
              placeholder="Commander 2024"
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Deck List * (1 Card Name per line)</label>
            <textarea
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              placeholder={"1 Commander Name\n1 Sol Ring\n1 Arcane Signet\n..."}
              rows={8}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-sm font-mono"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleInsert}
            disabled={inserting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded text-sm font-medium"
          >
            {inserting ? "Inserting…" : "Insert"}
          </button>
          {msg && <span className="text-sm text-gray-400 self-center">{msg}</span>}
        </div>
      </section>

      {/* Generate SQL */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
        <h2 className="font-medium">Generate SQL from Westly/CommanderPrecons</h2>
        <p className="text-sm text-gray-400">
          Run this in your project root (where package.json lives):
        </p>
        <pre className="bg-neutral-950 border border-neutral-700 rounded p-3 text-sm overflow-x-auto">
          {`cd mtg_ai_assistant/frontend  # or your frontend root
node scripts/generate-precon-sql.mjs`}
        </pre>
        <p className="text-sm text-gray-400">
          Output: <code className="bg-neutral-800 px-1 rounded">precon_decks_all.sql</code> in project root.
          Open Supabase Dashboard → SQL Editor → paste the SQL → Run.
        </p>
        <p className="text-xs text-amber-400">
          Optional: <code>--limit=20</code> to process only first 20 precons (for testing).{" "}
          <code>--stdout</code> to print instead of writing file.
        </p>
      </section>

      {/* Paste SQL (for manual paste from script output) */}
      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
        <h2 className="font-medium">Paste SQL to Copy</h2>
        <p className="text-sm text-gray-400">
          Paste generated SQL here, then copy and run in Supabase SQL Editor.
        </p>
        <textarea
          value={sqlInput}
          onChange={(e) => setSqlInput(e.target.value)}
          placeholder="-- Paste SQL from precon_decks_all.sql here"
          rows={12}
          className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-sm font-mono"
        />
        <button
          onClick={() => {
            if (sqlInput) {
              navigator.clipboard.writeText(sqlInput);
              setMsg("Copied to clipboard");
              setTimeout(() => setMsg(null), 2000);
            }
          }}
          className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-sm"
        >
          Copy to Clipboard
        </button>
      </section>
    </main>
  );
}
