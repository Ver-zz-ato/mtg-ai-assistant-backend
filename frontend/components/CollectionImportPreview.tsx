'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  FREE_COLLECTION_CARD_LIMIT,
  trimCardsToFreeLimit,
  wouldExceedCollectionLimit,
} from '@/lib/pro-storage-limits';

export type ImportConfirmOptions = { capToFreeLimit?: boolean };

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

export type ImportPreviewPhase = 'review' | 'importing' | 'complete';

interface CollectionImportPreviewProps {
  cards: PreviewCard[];
  onConfirm: (selectedCards: PreviewCard[], mode: 'merge' | 'overwrite', options?: ImportConfirmOptions) => void;
  onCancel: () => void;
  collectionName?: string;
  phase?: ImportPreviewPhase;
  progress?: number;
  statusText?: string;
  importSummary?: { added: number; updated: number; failed: number; skippedQty?: number };
  isPro?: boolean;
  proLoading?: boolean;
  currentCollectionQty?: number;
}

type MatchFilter = 'all' | 'exact' | 'fuzzy' | 'notfound';

export default function CollectionImportPreview({ 
  cards, 
  onConfirm, 
  onCancel,
  collectionName,
  phase = 'review',
  progress = 0,
  statusText = '',
  importSummary,
  isPro = false,
  proLoading = false,
  currentCollectionQty = 0,
}: CollectionImportPreviewProps) {
  const [previewCards, setPreviewCards] = useState<PreviewCard[]>(cards);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');

  const toggleMatchFilter = (filter: Exclude<MatchFilter, 'all'>) => {
    setMatchFilter((prev) => (prev === filter ? 'all' : filter));
  };

  const statBadgeClass = (active: boolean, colors: string) =>
    `px-3 py-1.5 rounded-lg border text-xs transition-all ${
      active
        ? `${colors} ring-2 ring-white/30 scale-105`
        : `${colors} hover:brightness-125 cursor-pointer`
    }`;

  // Toggle individual card
  const toggleCard = (index: number) => {
    setPreviewCards(prev => prev.map((card, i) => 
      i === index ? { ...card, selected: !card.selected } : card
    ));
  };

  const visibleEntries = previewCards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => matchFilter === 'all' || card.matchStatus === matchFilter);

  const allVisibleSelected =
    visibleEntries.length > 0 && visibleEntries.every(({ card }) => card.selected);

  // Toggle all cards in the current filter view
  const toggleAllVisible = () => {
    const visibleIndices = new Set(visibleEntries.map(({ index }) => index));
    const nextSelected = !allVisibleSelected;
    setPreviewCards((prev) =>
      prev.map((card, i) =>
        visibleIndices.has(i) ? { ...card, selected: nextSelected } : card
      )
    );
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
  const exceedsFreeLimit =
    !proLoading &&
    !isPro &&
    wouldExceedCollectionLimit({
      isPro,
      currentQty: currentCollectionQty,
      importQty: totalCards,
      importMode,
    });
  const selectedCards = previewCards.filter((c) => c.selected);
  const cappedPreview = exceedsFreeLimit
    ? trimCardsToFreeLimit(selectedCards, currentCollectionQty, importMode)
    : null;
  const cappedImportQty = cappedPreview?.importedQty ?? 0;
  const cappedSkippedQty = cappedPreview?.skippedQty ?? 0;
  const canImportPartial = exceedsFreeLimit && cappedImportQty > 0;
  const isReview = phase === 'review';
  const isImporting = phase === 'importing';
  const isComplete = phase === 'complete';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl border border-neutral-800 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-neutral-800">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {isImporting ? 'Importing Collection' : isComplete ? 'Import Complete' : 'Preview Import'}
              </h2>
              <p className="text-sm text-gray-400">
                {collectionName ? `Importing to: ${collectionName}` : 'Review cards before importing'}
              </p>
            </div>
            {isReview && (
              <button
                onClick={onCancel}
                className="text-gray-400 hover:text-white transition-colors"
                title="Cancel"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Stats — click Exact / Fuzzy / Not Found to filter the list */}
          {isReview && <div className="flex flex-wrap items-center gap-3 text-xs">
            {exactMatches > 0 && (
              <button
                type="button"
                onClick={() => toggleMatchFilter('exact')}
                title={matchFilter === 'exact' ? 'Show all cards' : 'Show exact matches only'}
                className={statBadgeClass(
                  matchFilter === 'exact',
                  'bg-green-600/20 border-green-600/30 text-green-300'
                )}
              >
                ✅ {exactMatches} unique exact
              </button>
            )}
            {fuzzyMatches > 0 && (
              <button
                type="button"
                onClick={() => toggleMatchFilter('fuzzy')}
                title={matchFilter === 'fuzzy' ? 'Show all cards' : 'Show fuzzy matches only'}
                className={statBadgeClass(
                  matchFilter === 'fuzzy',
                  'bg-yellow-600/20 border-yellow-600/30 text-yellow-300'
                )}
              >
                ⚠️ {fuzzyMatches} unique fuzzy
              </button>
            )}
            {notFound > 0 && (
              <button
                type="button"
                onClick={() => toggleMatchFilter('notfound')}
                title={matchFilter === 'notfound' ? 'Show all cards' : 'Show not found only'}
                className={statBadgeClass(
                  matchFilter === 'notfound',
                  'bg-red-600/20 border-red-600/30 text-red-300'
                )}
              >
                ❌ {notFound} unique not found
              </button>
            )}
            <div className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-600/30 text-blue-300">
              Selected: {selectedCount} unique cards / {totalCards} total cards
            </div>
            {matchFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setMatchFilter('all')}
                className="text-gray-400 hover:text-white underline"
              >
                Clear filter
              </button>
            )}
          </div>}

          {isReview && exceedsFreeLimit && (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-950/40 p-4 text-sm text-amber-100">
              <p className="font-semibold text-amber-200 mb-1">This import exceeds the free plan limit</p>
              <p className="text-amber-100/90">
                {canImportPartial ? (
                  <>
                    You selected {totalCards} total cards ({selectedCount} unique), but free collections hold up to {FREE_COLLECTION_CARD_LIMIT} cards.
                    {' '}Import the first <strong>{cappedImportQty}</strong> now ({cappedSkippedQty} will be skipped), or upgrade to Pro for unlimited size.
                  </>
                ) : (
                  <>
                    This collection is already at the {FREE_COLLECTION_CARD_LIMIT}-card free limit.
                    {' '}Upgrade to Pro to import the remaining {totalCards} cards.
                  </>
                )}
              </p>
            </div>
          )}

          {/* Import Mode Toggle */}
          {isReview && <div className="mt-4 flex items-center gap-4">
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
          </div>}
        </div>

        {/* Importing / complete progress */}
        {(isImporting || isComplete) && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[280px]">
            {isImporting ? (
              <>
                <div className="w-16 h-16 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin mb-6" />
                <p className="text-4xl font-bold text-white mb-2">{Math.round(progress)}%</p>
                <p className="text-gray-300 mb-6 max-w-md">{statusText || 'Importing cards...'}</p>
                <div className="w-full max-w-md bg-neutral-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-purple-600 h-3 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-6">
                  Keep this window open while your cards are being added.
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 text-3xl mb-6">
                  ✓
                </div>
                <p className="text-xl font-semibold text-white mb-2">All done!</p>
                {importSummary && (
                  <p className="text-gray-300 mb-4">
                    {importSummary.added} added
                    {importSummary.updated > 0 ? `, ${importSummary.updated} updated` : ''}
                    {importSummary.failed > 0 ? `, ${importSummary.failed} failed` : ''}
                    {(importSummary.skippedQty ?? 0) > 0
                      ? ` — ${importSummary.skippedQty} skipped (free limit)`
                      : ''}
                  </p>
                )}
                <p className="text-sm text-gray-400">Opening your collection...</p>
              </>
            )}
          </div>
        )}

        {/* Card List */}
        {isReview && <div className="flex-1 overflow-y-auto p-6">
          {/* Select All */}
          <div className="mb-4 pb-3 border-b border-neutral-800 flex items-center gap-3">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={visibleEntries.length === 0}
              className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
            />
            <span className="text-sm font-medium text-white">
              Select All ({visibleEntries.length}
              {matchFilter !== 'all' ? ` of ${previewCards.length}` : ''} unique)
            </span>
          </div>

          {/* Cards */}
          <div className="space-y-2">
            {visibleEntries.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No cards match this filter.
              </p>
            )}
            {visibleEntries.map(({ card, index }) => (
              <div
                key={`${card.originalName}-${index}`}
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
        </div>}

        {/* Footer */}
        {isReview && (
          <div className="p-6 border-t border-neutral-800 flex items-center justify-between gap-4">
            <div className="text-sm text-gray-400">
              {exceedsFreeLimit && canImportPartial ? (
                <>Choose: import first {cappedImportQty} cards (free) or upgrade to Pro for all {totalCards}</>
              ) : importMode === 'merge' ? (
                <>Adding {totalCards} total cards ({selectedCount} unique) to your collection</>
              ) : (
                <span className="text-red-400">⚠️ This will replace your existing collection</span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition-all"
              >
                Cancel
              </button>
              {exceedsFreeLimit ? (
                <>
                  <Link
                    href="/pricing"
                    className="px-4 py-2 rounded-lg border border-amber-500/50 bg-amber-950/50 text-amber-200 hover:bg-amber-900/50 font-medium transition-all"
                  >
                    Upgrade to Pro
                  </Link>
                  {canImportPartial && (
                    <button
                      onClick={() => onConfirm(selectedCards, importMode, { capToFreeLimit: true })}
                      className="px-6 py-2 rounded-lg font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white transition-all"
                    >
                      Import first {cappedImportQty} cards
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => onConfirm(selectedCards, importMode)}
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

