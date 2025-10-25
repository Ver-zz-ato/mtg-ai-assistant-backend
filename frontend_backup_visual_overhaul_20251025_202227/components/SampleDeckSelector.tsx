'use client';

import { useState, useEffect } from 'react';
import { capture } from '@/lib/ph';

interface SampleDeck {
  id: string;
  name: string;
  commander: string;
  description: string;
  colors: string[];
  powerLevel: number;
  estimatedPrice: number;
  archetype: string;
}

interface SampleDeckSelectorProps {
  onSuccess?: (deckId: string) => void;
  onCancel?: () => void;
  inline?: boolean;
}

export default function SampleDeckSelector({
  onSuccess,
  onCancel,
  inline = false,
}: SampleDeckSelectorProps) {
  const [decks, setDecks] = useState<SampleDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSampleDecks();
  }, []);

  async function loadSampleDecks() {
    try {
      const res = await fetch('/api/decks/sample');
      const data = await res.json();
      if (data.ok) {
        setDecks(data.decks);
      } else {
        setError('Failed to load sample decks');
      }
    } catch (e) {
      setError('Failed to load sample decks');
    } finally {
      setLoading(false);
    }
  }

  async function importDeck(deckId: string) {
    setImporting(true);
    setError(null);

    try {
      capture('sample_deck_import_started', { deck_id: deckId });

      const res = await fetch('/api/decks/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId }),
      });

      const data = await res.json();

      if (data.ok) {
        capture('sample_deck_import_completed', {
          deck_id: deckId,
          deck_name: data.deck?.title || data.deck?.name,
        });
        
        // Show success message briefly before redirect
        setError(null);
        
        // Always redirect to the new deck (best UX) - wait 1 second to show loading state
        setTimeout(() => {
          window.location.href = `/my-decks/${data.deck.id}`;
        }, 1000);
      } else {
        setError(data.error || 'Failed to import deck');
        capture('sample_deck_import_failed', { deck_id: deckId, error: data.error });
      }
    } catch (e: any) {
      setError(e.message || 'Failed to import deck');
      capture('sample_deck_import_failed', { deck_id: deckId, error: e.message });
    } finally {
      setImporting(false);
    }
  }

  const getColorBadge = (colors: string[]) => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      W: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      U: { bg: 'bg-blue-100', text: 'text-blue-800' },
      B: { bg: 'bg-gray-700', text: 'text-white' },
      R: { bg: 'bg-red-100', text: 'text-red-800' },
      G: { bg: 'bg-green-100', text: 'text-green-800' },
    };

    return colors.map((color, idx) => {
      const style = colorMap[color] || { bg: 'bg-gray-100', text: 'text-gray-800' };
      return (
        <span
          key={idx}
          className={`inline-block w-5 h-5 rounded-full ${style.bg} ${style.text} text-xs font-bold flex items-center justify-center`}
        >
          {color}
        </span>
      );
    });
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400">Loading sample decks...</div>
      </div>
    );
  }

  return (
    <div className={inline ? '' : 'bg-white dark:bg-gray-800 rounded-lg p-6'}>
      {!inline && (
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Start with a Sample Deck
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Choose a popular Commander archetype to get started. These decks are battle-tested and ready to play!
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {decks.map((deck) => (
          <div
            key={deck.id}
            className={`border rounded-lg p-4 transition-all cursor-pointer ${
              selectedDeck === deck.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
            }`}
            onClick={() => setSelectedDeck(deck.id)}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm leading-tight flex-1">
                {deck.commander}
              </h3>
              <div className="flex gap-1 ml-2">{getColorBadge(deck.colors)}</div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">{deck.archetype}</div>
              <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                {deck.description}
              </p>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                Power: {deck.powerLevel}/10
              </span>
              <span className="text-green-600 dark:text-green-400 font-semibold">
                ~${deck.estimatedPrice}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-3 justify-end">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={importing}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => selectedDeck && importDeck(selectedDeck)}
          disabled={!selectedDeck || importing}
          className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {importing && (
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {importing ? 'Importing deck...' : 'Import Selected Deck'}
        </button>
      </div>

      {/* Loading overlay */}
      {importing && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl max-w-sm mx-4 text-center">
            <div className="mb-4 flex justify-center">
              <svg className="animate-spin h-12 w-12 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Importing Deck...
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Setting up your deck. You'll be redirected shortly!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact button version for empty states
export function SampleDeckButton({ className = '' }: { className?: string }) {
  const [showSelector, setShowSelector] = useState(false);

  if (showSelector) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <SampleDeckSelector
              onSuccess={(deckId) => {
                // Redirect handled in component
                setShowSelector(false);
              }}
              onCancel={() => setShowSelector(false)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        capture('sample_deck_button_clicked', { source: 'empty_state' });
        setShowSelector(true);
      }}
      className={`px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl ${className}`}
    >
      🎲 Start with a Sample Deck
    </button>
  );
}

