'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type Deck = { id: string; title: string | null; deck_text: string | null };
type Collection = { id: string; name: string };

export default function CostToFinishClient() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<string>('');
  const [deckText, setDeckText] = useState<string>('');

  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [subtractOwned, setSubtractOwned] = useState<boolean>(false);

  const [currency, setCurrency] = useState<'USD' | 'GBP' | 'EUR'>('USD');
  const [rows, setRows] = useState<Array<{ card: string; need: number; unit: number; subtotal: number }>>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingCollections, setLoadingCollections] = useState<boolean>(true);

  // Load decks (for the logged-in user)
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('decks')
        .select('id,title,deck_text')
        .order('created_at', { ascending: false });

      if (!alive) return;
      if (error) console.error('fetch decks', error);
      setDecks(data ?? []);
    })();
    return () => { alive = false; };
  }, [supabase]);

  // Load collections AFTER we know we have a session
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingCollections(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!alive) return;
        if (!user) { setCollections([]); return; }

        const { data, error } = await supabase
          .from('collections')
          .select('id,name')
          .eq('user_id', user.id)
          .order('name', { ascending: true });

        if (!alive) return;
        if (error) {
          console.error('fetch collections', error);
          setCollections([]);
        } else {
          setCollections(data ?? []);
        }
      } finally {
        if (alive) setLoadingCollections(false);
      }
    })();
    return () => { alive = false; };
  }, [supabase]);

  // When user picks a deck, fill the textarea
  const onPickDeck = (id: string) => {
    setSelectedDeck(id);
    const d = decks.find(x => x.id === id);
    setDeckText(d?.deck_text ?? '');
  };

  // When user picks a collection, enable subtraction automatically
  const onPickCollection = (id: string) => {
    setSelectedCollection(id);
    setSubtractOwned(!!id);
  };

  const computeCost = async () => {
    setError(null);
    setRows([]);
    setTotal(null);
    try {
      const res = await fetch('/api/collections/cost-to-finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deckId: selectedDeck || null,
          deckText,
          collectionId: subtractOwned ? (selectedCollection || null) : null,
          currency,
          useOwned: subtractOwned,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Upstream error');

      setRows(json.rows ?? []);
      setTotal(json.total ?? 0);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Unexpected error');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Cost to Finish</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: deck picker + text */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Choose one of your decks</label>
          <select
            value={selectedDeck}
            onChange={(e) => onPickDeck(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-neutral-900 text-white px-3 py-2"
          >
            <option value="">— None (paste below) —</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.title ?? 'Untitled'}</option>
            ))}
          </select>

          <label className="block text-sm text-gray-300 mt-4 mb-1">Deck text</label>
          <textarea
            rows={10}
            className="w-full rounded-lg border border-white/20 bg-neutral-900 text-white px-3 py-2 font-mono"
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
          />
          <p className="mt-2 text-xs text-gray-400">
            Or deep-link a public deck with <code className="font-mono">?deck=&lt;id&gt;</code> in the URL.
          </p>
        </div>

        {/* Right: options */}
        <div className="rounded-lg border border-white/20 bg-neutral-900 p-4 space-y-3">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Collection</label>
            <select
              value={selectedCollection}
              onChange={(e) => onPickCollection(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-neutral-800 text-white px-3 py-2"
            >
              <option value="">— None —</option>
              {!loadingCollections && collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Pick a collection to subtract the cards you already own.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={subtractOwned}
              onChange={(e) => setSubtractOwned(e.target.checked)}
            />
            Subtract cards I already own
          </label>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
              className="w-full rounded-lg border border-white/20 bg-neutral-800 text-white px-3 py-2"
            >
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
          </div>

          <button
            onClick={computeCost}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium py-2"
          >
            Compute cost
          </button>

          {error && (
            <div className="rounded-md bg-red-900/40 border border-red-500/60 text-red-200 text-sm px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="mt-6 w-full text-sm">
            <thead className="sticky top-0 bg-neutral-950/70 backdrop-blur">
              <tr className="text-left text-gray-300">
                <th className="py-2 px-3">Card</th>
                <th className="py-2 px-3 text-right">Need</th>
                <th className="py-2 px-3 text-right">Unit</th>
                <th className="py-2 px-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(odd)]:bg-white/5">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="py-2 px-3 text-gray-100">{r.card}</td>
                  <td className="py-2 px-3 text-right">{r.need}</td>
                  <td className="py-2 px-3 text-right">
                    {r.unit.toLocaleString(undefined, { style: 'currency', currency })}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {r.subtotal.toLocaleString(undefined, { style: 'currency', currency })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-2 px-3 text-right text-gray-300" colSpan={3}>Total</td>
                <td className="py-2 px-3 text-right text-gray-100">
                  {total?.toLocaleString(undefined, { style: 'currency', currency })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
