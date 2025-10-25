'use client';

import React, { useState, useEffect } from 'react';
import { dedupFetch } from '@/lib/api/deduplicator';

interface Recommendation {
  name: string;
  reason: string;
  imageUrl?: string;
  price?: number;
}

interface CardRecommendationsWidgetProps {
  onAddToDeck?: (cardName: string) => void;
}

export default function CardRecommendationsWidget({ onAddToDeck }: CardRecommendationsWidgetProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadRecommendations();
  }, []);

  async function loadRecommendations() {
    try {
      setLoading(true);
      const response = await dedupFetch('/api/recommendations/cards');
      const data = await response.json();

      if (data.ok) {
        setRecommendations(data.recommendations || []);
        setMessage(data.message || null);
      } else {
        setError(data.error || 'Failed to load recommendations');
      }
    } catch (err: any) {
      setError('Network error loading recommendations');
    } finally {
      setLoading(false);
    }
  }

  const handleAddClick = (cardName: string) => {
    if (onAddToDeck) {
      onAddToDeck(cardName);
    } else {
      // Default: open deck selector modal or navigate
      alert(`Add "${cardName}" to a deck - implement deck selector`);
    }
  };

  if (loading) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <span className="text-blue-400">✨</span> Recommended for You
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="flex gap-3">
                <div className="w-16 h-22 bg-neutral-800 rounded"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-neutral-800 rounded w-3/4"></div>
                  <div className="h-3 bg-neutral-800 rounded w-1/2"></div>
                  <div className="h-8 bg-neutral-800 rounded w-20"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-2 text-red-400">⚠️ Recommendations</h3>
        <p className="text-xs text-gray-400">{error}</p>
      </div>
    );
  }

  if (message || recommendations.length === 0) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span className="text-blue-400">✨</span> Recommended for You
        </h3>
        <p className="text-xs text-gray-400">
          {message || 'No recommendations at the moment. Check back after building some decks!'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="text-blue-400">✨</span> Recommended for You
        </h3>
        <button
          onClick={loadRecommendations}
          className="text-xs text-gray-400 hover:text-white transition-colors"
          title="Refresh recommendations"
        >
          ↻
        </button>
      </div>

      <div className="space-y-3">
        {recommendations.slice(0, 3).map((rec, index) => (
          <div key={index} className="flex gap-3 group">
            {/* Card Image */}
            <div className="w-16 h-22 flex-shrink-0 bg-neutral-800 rounded overflow-hidden">
              {rec.imageUrl ? (
                <img
                  src={rec.imageUrl}
                  alt={rec.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                  📷
                </div>
              )}
            </div>

            {/* Card Info */}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-white truncate">{rec.name}</h4>
              <p className="text-xs text-gray-400 mb-2">{rec.reason}</p>
              
              <div className="flex items-center justify-between">
                {rec.price !== undefined && (
                  <span className="text-xs text-green-400 font-mono">
                    ${rec.price.toFixed(2)}
                  </span>
                )}
                <button
                  onClick={() => handleAddClick(rec.name)}
                  className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                >
                  + Add
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-neutral-800">
        <p className="text-xs text-gray-500 text-center">
          Based on your decks and collection
        </p>
      </div>
    </div>
  );
}


