'use client';

import React, { useState, useEffect } from 'react';

export type PreviewCard = {
  originalName: string;
  quantity: number;
  matchStatus: 'exact' | 'fuzzy' | 'notfound' | 'checking';
  suggestedName?: string;
  confidence?: number;
  selected: boolean;
  scryfallData?: {
    name: string;
    set?: string;
    image_uri?: string;
  };
};

interface CollectionImportPreviewProps {
  cards: PreviewCard[];
  onConfirm: (selectedCards: PreviewCard[], mode: 'merge' | 'overwrite') => void;
  onCancel: () => void;
  collectionName?: string;
}

export default function CollectionImportPreview({ 
  cards, 
  onConfirm, 
  onCancel,
  collectionName 
}: CollectionImportPreviewProps) {
  const [previewCards, setPreviewCards] = useState<PreviewCard[]>(cards);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [selectAll, setSelectAll] = useState(true);

  // Toggle individual card
  const toggleCard = (index: number) => {
    setPreviewCards(prev => prev.map((card, i) => 
      i === index ? { ...card, selected: !card.selected } : card
    ));
  };

  // Toggle all cards
  const toggleAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    setPreviewCards(prev => prev.map(card => ({ ...card, selected: newSelectAll })));
  };

  // Accept fuzzy match suggestion
  const acceptSuggestion = (index: number) => {
    setPreviewCards(prev => prev.map((card, i) => {
      if (i === index && card.suggestedName) {
        return {
          ...card,
          originalName: card.suggestedName,
          matchStatus: 'exact' as const,
          confidence: 100,
        };
      }
      return card;
    }));
  };

  const selectedCount = previewCards.filter(c => c.selected).length;
  const exactMatches = previewCards.filter(c => c.matchStatus === 'exact').length;
  const fuzzyMatches = previewCards.filter(c => c.matchStatus === 'fuzzy').length;
  const notFound = previewCards.filter(c => c.matchStatus === 'notfound').length;
  const totalCards = previewCards.reduce((sum, c) => sum + (c.selected ? c.quantity : 0), 0);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl border border-neutral-800 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-neutral-800">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Preview Import</h2>
              <p className="text-sm text-gray-400">
                {collectionName ? `Importing to: ${collectionName}` : 'Review cards before importing'}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-white transition-colors"
              title="Cancel"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-600/30 text-green-300">
              ✅ {exactMatches} Exact
            </div>
            {fuzzyMatches > 0 && (
              <div className="px-3 py-1.5 rounded-lg bg-yellow-600/20 border border-yellow-600/30 text-yellow-300">
                ⚠️ {fuzzyMatches} Fuzzy
              </div>
            )}
            {notFound > 0 && (
              <div className="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-600/30 text-red-300">
                ❌ {notFound} Not Found
              </div>
            )}
            <div className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-600/30 text-blue-300">
              📦 {selectedCount} Selected ({totalCards} cards)
            </div>
          </div>

          {/* Import Mode Toggle */}
          <div className="mt-4 flex items-center gap-4">
            <span className="text-sm text-gray-400">Import Mode:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setImportMode('merge')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  importMode === 'merge'
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-gray-400 hover:bg-neutral-700'
                }`}
              >
                📥 Merge (Add to existing)
              </button>
              <button
                onClick={() => setImportMode('overwrite')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  importMode === 'overwrite'
                    ? 'bg-red-600 text-white'
                    : 'bg-neutral-800 text-gray-400 hover:bg-neutral-700'
                }`}
              >
                🔄 Overwrite (Replace collection)
              </button>
            </div>
          </div>
        </div>

        {/* Card List */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Select All */}
          <div className="mb-4 pb-3 border-b border-neutral-800 flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={toggleAll}
              className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-sm font-medium text-white">Select All ({previewCards.length} cards)</span>
          </div>

          {/* Cards */}
          <div className="space-y-2">
            {previewCards.map((card, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  card.selected
                    ? 'bg-neutral-800/50 border-neutral-700'
                    : 'bg-neutral-900 border-neutral-800 opacity-50'
                }`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={card.selected}
                  onChange={() => toggleCard(index)}
                  className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                />

                {/* Status Icon */}
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                  {card.matchStatus === 'exact' && (
                    <div className="w-6 h-6 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 text-sm">
                      ✓
                    </div>
                  )}
                  {card.matchStatus === 'fuzzy' && (
                    <div className="w-6 h-6 rounded-full bg-yellow-600/20 flex items-center justify-center text-yellow-400 text-sm">
                      ⚠
                    </div>
                  )}
                  {card.matchStatus === 'notfound' && (
                    <div className="w-6 h-6 rounded-full bg-red-600/20 flex items-center justify-center text-red-400 text-sm">
                      ✗
                    </div>
                  )}
                  {card.matchStatus === 'checking' && (
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {/* Card Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm text-blue-400 flex-shrink-0">
                      {card.quantity}x
                    </span>
                    <span className="text-white truncate">
                      {card.originalName}
                    </span>
                  </div>

                  {/* Fuzzy match suggestion */}
                  {card.matchStatus === 'fuzzy' && card.suggestedName && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        Did you mean: <span className="text-yellow-400">{card.suggestedName}</span>
                        {card.confidence && ` (${card.confidence}% match)`}
                      </span>
                      <button
                        onClick={() => acceptSuggestion(index)}
                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                      >
                        Use this
                      </button>
                    </div>
                  )}

                  {/* Not found warning */}
                  {card.matchStatus === 'notfound' && (
                    <div className="mt-1 text-xs text-red-400">
                      Card not found in Scryfall database
                    </div>
                  )}
                </div>

                {/* Card Image (if available) */}
                {card.scryfallData?.image_uri && (
                  <img
                    src={card.scryfallData.image_uri}
                    alt={card.scryfallData.name}
                    className="w-12 h-auto rounded border border-neutral-700 flex-shrink-0"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-800 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-400">
            {importMode === 'merge' ? (
              <>Adding {totalCards} cards to your collection</>
            ) : (
              <span className="text-red-400">⚠️ This will replace your existing collection</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(previewCards.filter(c => c.selected), importMode)}
              disabled={selectedCount === 0}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                selectedCount === 0
                  ? 'bg-neutral-700 text-gray-500 cursor-not-allowed'
                  : importMode === 'overwrite'
                  ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white'
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white'
              }`}
            >
              {importMode === 'merge' ? '📥 Import Selected' : '🔄 Overwrite & Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

