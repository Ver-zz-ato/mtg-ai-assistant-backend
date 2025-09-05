"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// If you store more fields, extend this
type DeckRow = {
  id: string;
  name?: string | null;
  format?: string | null;
  commander?: string | null;
  data?: any | null;   // often a JSON blob with your deck
  meta?: any | null;   // e.g., { commander: "…" }
  created_at?: string | null;
};

// A single card entry
type DeckCard = { name: string; qty: number };

// --- Helpers ---------------------------------------------------------------

function guessCommander(row: DeckRow): string | null {
  if (row.commander) return String(row.commander);
  const m =
    row.meta?.commander ??
    row.meta?.leader ??
    row.meta?.general ??
    row.data?.commander ??
    row.data?.leaders?.[0] ??
    row.data?.identity?.commander ??
    null;
  return m ? String(m) : null;
}

/**
 * Try to normalize any likely deck JSON structures into [{name, qty}, ...].
 * Common shapes it supports:
 * - row.data.cards: [{ name, qty }] or [{ name, count }]
 * - row.data.mainboard / row.data.board / row.data.list: arrays of strings like "2 Sol Ring" or objects with {name, qty}
 * - row.data.lines: text list lines "2 Sol Ring"
 */
function extractCards(row: DeckRow): DeckCard[] {
  const out: DeckCard[] = [];

  // helper to add one
  const push = (name: any, qty: any) => {
    const n = String(name ?? "").trim();
    const q = Number(qty ?? 1);
    if (!n) return;
    out.push({ name: n, qty: Number.isFinite(q) && q > 0 ? q : 1 });
  };

  const fromTextLines = (lines: string[]) => {
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      const m = t.match(/^(\d+)\s+(.+)$/);
      if (m) push(m[2], Number(m[1]));
      else push(t, 1);
    }
  };

  // 1) Explicit cards array
  if (Array.isArray(row.data?.cards)) {
    for (const c of row.data.cards) {
      if (typeof c === "string") {
        const m = c.match(/^(\d+)\s+(.+)$/);
        if (m) push(m[2], Number(m[1]));
        else push(c, 1);
      } else if (c && typeof c === "object") {
        push(c.name ?? c.card ?? c.title, c.qty ?? c.quantity ?? c.count ?? 1);
      }
    }
  }

  // 2) Other common buckets: mainboard/board/list
  const buckets = ["mainboard", "board", "list"];
  for (const k of buckets) {
    const v = row.data?.[k];
    if (Array.isArray(v)) {
      for (const c of v) {
        if (typeof c === "string") {
          const m = c.match(/^(\d+)\s+(.+)$/);
          if (m) push(m[2], Number(m[1]));
          else push(c, 1);
        } else if (c && typeof c === "object") {
          push(c.name ?? c.card ?? c.title, c.qty ?? c.quantity ?? c.count ?? 1);
        }
      }
    }
  }

  // 3) Raw text lines
  if (typeof row.data?.text === "string") {
    const lines = row.data.text.split(/\r?\n/);
    fromTextLines(lines);
  }
  if (Array.isArray(row.data?.lines)) {
    fromTextLines(row.data.lines.map((x: any) => String(x ?? "")));
  }

  // 4) Fallback: meta.deck_text if you had stored it
  if (!out.length && typeof row.meta?.deck_text === "string") {
    fromTextLines(row.meta.deck_text.split(/\r?\n/));
  }

  // 5) Last-resort: if nothing found and name exists, return empty (header will still render)
  return out;
}

// Clipboard for “Copy Decklist”
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Build plain-text decklist lines "N Name"
function buildDeckText(cards: DeckCard[]): string {
  return cards.map((c) => `${c.qty} ${c.name}`).join("\n");
}

// --- Data fetch (Supabase via API facade) ----------------------------------
// Using an API route keeps the client page simple. If you prefer server components,
// you can query Supabase directly in a server page instead.
async function fetchDeckById(id: string): Promise<DeckRow | null> {
  // You might already have an API route to read a deck. If not, here’s a minimal
  // one-liner using your existing analyze/save endpoints is not ideal, so we’ll
  // hit a dedicated read route if you create it. For now, call a generic route.

  // If you do NOT have /api/decks/get, change this to your actual endpoint or
  // swap this page to a server component to query Supabase directly.
  const res = await fetch(`/api/decks/get?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return null;
  const j = await res.json().catch(() => null);
  // Expected shape: { deck: DeckRow } or data
  const deck = (j?.deck ?? j?.data ?? null) as DeckRow | null;
  return deck;
}

// --- Page ------------------------------------------------------------------

export default function DeckDetailPage({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  const [deck, setDeck] = useState<DeckRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const d = await fetchDeckById(id);
        if (!d) throw new Error("Deck not found");
        setDeck(d);
      } catch (e: any) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const cards = useMemo(() => (deck ? extractCards(deck) : []), [deck]);
  const deckText = useMemo(() => buildDeckText(cards), [cards]);
  const commander = deck ? guessCommander(deck) : null;

  const created = deck?.created_at
    ? new Date(deck.created_at).toLocaleString()
    : "";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {deck?.name ?? "Deck"}
        </h1>
        <div className="flex items-center gap-3">
          <Link href="/my-decks" className="text-sm underline underline-offset-4">
            ← My Decks
          </Link>
          <Link
            href={`/collections/cost-to-finish?deck=${encodeURIComponent(deckText)}`}
            className="text-sm underline underline-offset-4"
            title="Open this deck in Cost to Finish"
          >
            Cost to Finish
          </Link>
        </div>
      </div>

      {deck && (
        <div className="text-sm text-gray-600 space-x-2">
          <span>{deck.format ?? "Commander"}</span>
          {commander ? <span>• {commander}</span> : null}
          {created ? <span>• {created}</span> : null}
        </div>
      )}

      {err && <div className="text-red-500">{err}</div>}
      {loading && <div className="rounded-xl border p-4 text-sm opacity-75">Loading…</div>}

      {!loading && deck && cards.length === 0 && !err && (
        <div className="rounded-xl border p-4 text-sm">
          No card list stored for this deck.
        </div>
      )}

      {cards.length > 0 && (
        <>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const ok = await copyToClipboard(deckText);
                alert(ok ? "Decklist copied." : "Failed to copy.");
              }}
              className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5"
              title="Copy text decklist"
            >
              Copy Decklist
            </button>
            <a
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(deckText)}`}
              download={`${deck?.name ?? "deck"}.txt`}
              className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5"
              title="Download as .txt"
            >
              Download .txt
            </a>
          </div>

          <div className="rounded-xl border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Card</th>
                  <th className="text-right py-2 px-3">Qty</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-b">
                    <td className="py-1 px-3">{r.name}</td>
                    <td className="py-1 px-3 text-right">{r.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
