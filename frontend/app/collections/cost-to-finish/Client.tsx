'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type Deck = {
  id: string;
  title: string;
  deck_text: string;
};

type Collection = {
  id: string;
  name: string;
};

export default function CostToFinishClient() {
  const supabase = createBrowserSupabaseClient();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckText, setDeckText] = useState('');
  const [selectedDeck, setSelectedDeck] = useState<string>('');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [currency, setCurrency] = useState('USD');
  const [subtractOwned, setSubtractOwned] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load user decks
  useEffect(() => {
    const fetchDecks = async () => {
      const { data, error } = await supabase
        .from('decks')
        .select('id,title,deck_text')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching decks:', error);
      } else {
        setDecks(data || []);
      }
    };

    fetchDecks();
  }, [supabase]);

  // Load user collections
  useEffect(() => {
    const fetchCollections = async () => {
      const { data, error } = await supabase
        .from('collections')
        .select('id,name')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching collections:', error);
      } else {
        setCollections(data || []);
      }
    };

    fetchCollections();
  }, [supabase]);

  const handleDeckChange = (deckId: string) => {
    setSelectedDeck(deckId);
    const deck = decks.find((d) => d.id === deckId);
    if (deck) setDeckText(deck.deck_text || '');
  };

  const computeCost = async () => {
    setError(null);
    setRows([]);
    setTotal(null);

    try {
      const res = await fetch('/api/collections/cost-to-finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: selectedDeck || null,
          deckText,
          collectionId: subtractOwned ? selectedCollection || null : null,
          currency,
          useOwned: subtractOwned,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Unknown error');
      }

      setRows(json.rows || []);
      setTotal(json.total || 0);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Cost to Finish</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deck selection */}
        <div>
          <label className="block text-sm font-medium mb-1">Choose one of your decks</label>
          <select
            value={selectedDeck}
            onChange={(e) => handleDeckChange(e.target.value)}
            className="w-full rounded border p-2 text-black"
          >
            <option value="">— None (paste below) —</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.title}
              </option>
            ))}
          </select>

          <label className="block text-sm font-medium mt-4 mb-1">Deck text</label>
          <textarea
            className="w-full rounded border p-2 text-black"
            rows={8}
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
          />
        </div>

        {/* Options */}
        <div className="space-y-4 border rounded p-4">
          <div>
            <label className="block text-sm font-medium mb-1">Collection</label>
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              disabled={!subtractOwned}
              className="w-full rounded border p-2 text-black"
            >
              <option value="">— None —</option>
              {collections.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={subtractOwned}
              onChange={(e) => setSubtractOwned(e.target.checked)}
            />
            <span>Subtract cards I already own</span>
          </label>

          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded border p-2 text-black"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>

          <button
            onClick={computeCost}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded"
          >
            Compute cost
          </button>
        </div>
      </div>

      {/* Error */}
      {error && <div className="bg-red-200 text-red-800 p-2 rounded">{error}</div>}

      {/* Results */}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border mt-6">
            <thead>
              <tr className="bg-gray-200">
                <th className="border p-2 text-left">Card</th>
                <th className="border p-2 text-right">Need</th>
                <th className="border p-2 text-right">Unit</th>
                <th className="border p-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="border p-2">{row.card}</td>
                  <td className="border p-2 text-right">{row.need}</td>
                  <td className="border p-2 text-right">
                    {row.unit.toLocaleString(undefined, { style: 'currency', currency })}
                  </td>
                  <td className="border p-2 text-right">
                    {row.subtotal.toLocaleString(undefined, { style: 'currency', currency })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-gray-100">
                <td className="border p-2 text-right" colSpan={3}>
                  Total
                </td>
                <td className="border p-2 text-right">
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
