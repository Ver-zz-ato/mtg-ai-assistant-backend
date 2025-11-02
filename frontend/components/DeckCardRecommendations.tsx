'use client';

import React, { useState, useEffect } from 'react';

interface Recommendation {
  name: string;
  reason: string;
  imageUrl?: string;
  price?: number;
}

interface DeckCardRecommendationsProps {
  deckId: string;
  onAddCard?: (cardName: string) => void;
}

export default function DeckCardRecommendations({ deckId, onAddCard }: DeckCardRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true); // Auto-expand on load
  const [hidePanel, setHidePanel] = useState(false);

  useEffect(() => {
    loadRecommendations();
  }, [deckId]);

  async function loadRecommendations() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/recommendations/deck/${deckId}`);
      const data = await response.json();

      if (data.ok) {
        setRecommendations(data.recommendations || []);
      } else {
        setError(data.error || 'Failed to load recommendations');
      }
    } catch (err: any) {
      console.error('Error loading recommendations:', err);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  const handleAddClick = (cardName: string) => {
    if (onAddCard) {
      onAddCard(cardName);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-neutral-800 p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-1 w-1 rounded-full bg-yellow-400 animate-pulse shadow-lg shadow-yellow-400/50"></div>
          <h3 className="text-sm font-bold bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
            Card Suggestions
          </h3>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-neutral-800 rounded w-3/4"></div>
          <div className="h-3 bg-neutral-800 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return null; // Silently fail - recommendations are optional
  }

  if (recommendations.length === 0) {
    return null; // No recommendations, don't show anything
  }

  return (
    <div className="rounded-xl border border-neutral-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        {!hidePanel && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-1 flex items-center justify-between hover:bg-neutral-800/50 transition-colors rounded"
          >
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-yellow-400 animate-pulse shadow-lg shadow-yellow-400/50"></div>
              <h3 className="text-sm font-bold bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                Card Suggestions
              </h3>
              <span className="text-neutral-500 text-xs">({recommendations.length})</span>
            </div>
            <span className="text-gray-400 text-xs">{expanded ? '▼' : '▶'}</span>
          </button>
        )}
        {hidePanel && (
          <div className="flex-1 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-yellow-400 animate-pulse shadow-lg shadow-yellow-400/50"></div>
            <h3 className="text-sm font-bold bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
              Card Suggestions
            </h3>
            <span className="text-neutral-500 text-xs">({recommendations.length})</span>
          </div>
        )}
        <button 
          onClick={() => setHidePanel(v=>!v)} 
          className="ml-2 px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs transition-colors"
        >
          {hidePanel ? 'Show' : 'Hide'}
        </button>
      </div>

      {/* Expanded Content */}
      {!hidePanel && expanded && (
        <div className="border-t border-neutral-800 p-3 space-y-3 max-h-96 overflow-y-auto bg-neutral-900/30">
          {recommendations.map((rec, index) => (
            <div
              key={index}
              className="flex gap-2 p-3 rounded-lg bg-neutral-900/50 hover:bg-neutral-800/50 transition-colors group border border-neutral-700/30"
            >
              {/* Card Image */}
              {rec.imageUrl && (
                <div className="w-14 h-20 flex-shrink-0 bg-neutral-800 rounded overflow-hidden shadow-lg">
                  <img
                    src={rec.imageUrl}
                    alt={rec.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                  />
                </div>
              )}

              {/* Card Info */}
              <div className="flex-1 min-w-0 space-y-2">
                <h4 className="text-sm font-semibold text-white">{rec.name}</h4>
                
                {/* Reason with "Why?" label */}
                <div className="space-y-1">
                  <div className="text-xs font-medium text-blue-400">💡 Why this card?</div>
                  <p className="text-xs text-gray-300 leading-relaxed">{rec.reason}</p>
                </div>
                
                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-neutral-700/30">
                  {rec.price !== undefined && (
                    <span className="text-xs text-green-400 font-mono font-semibold">
                      ${rec.price.toFixed(2)}
                    </span>
                  )}
                  <button
                    onClick={() => handleAddClick(rec.name)}
                    className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors shadow-sm"
                  >
                    + Add to Deck
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


