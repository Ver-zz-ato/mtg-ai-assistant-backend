'use client';
import React from 'react';
import { getImagesForNames, type ImageInfo } from '@/lib/scryfall-cache';

interface AIDeckScanModalProps {
  isOpen: boolean;
  category: string;
  label: string;
  isLoading: boolean;
  progressStage?: string; // Optional progress stage indicator
  suggestions: Array<{ card: string; reason: string }>;
  error: string | null;
  onClose: () => void;
  onAddCard: (cardName: string) => Promise<void>;
}

export default function AIDeckScanModal({
  isOpen,
  category,
  label,
  isLoading,
  progressStage,
  suggestions,
  error,
  onClose,
  onAddCard,
}: AIDeckScanModalProps) {
  const [cardImages, setCardImages] = React.useState<Map<string, ImageInfo>>(new Map());
  const [hoverCard, setHoverCard] = React.useState<{ name: string; x: number; y: number; src: string } | null>(null);

  // Fetch card images when suggestions are available
  React.useEffect(() => {
    if (suggestions.length > 0) {
      (async () => {
        try {
          const cardNames = suggestions.map(s => s.card);
          const imagesMap = await getImagesForNames(cardNames);
          setCardImages(imagesMap);
        } catch (error) {
          // Silently fail
        }
      })();
    }
  }, [suggestions]);

  // Card hover handlers
  function handleCardMouseEnter(e: React.MouseEvent, cardName: string) {
    const normalized = cardName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const image = cardImages.get(normalized);
    if (!image?.normal) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverCard({
      name: cardName,
      x: rect.right + 15,
      y: rect.top,
      src: image.normal,
    });
  }

  function handleCardMouseLeave() {
    setHoverCard(null);
  }

  // Progress stages
  const stages = [
    { key: 'analyzing', label: 'Analyzing deck structure...', icon: '🔍' },
    { key: 'processing', label: 'Processing card synergies...', icon: '⚙️' },
    { key: 'generating', label: 'Generating AI suggestions...', icon: '✨' },
    { key: 'finalizing', label: 'Finalizing recommendations...', icon: '🎯' },
  ];

  const currentStageIndex = progressStage 
    ? stages.findIndex(s => s.key === progressStage)
    : -1;

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 border-2 border-purple-500/30 rounded-2xl p-6 shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl">
              ✨
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                AI Deck Scan: {label}
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">AI-powered suggestions to improve your deck</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors p-2 hover:bg-neutral-800 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Loading State with Progress Stages */}
        {isLoading && (
          <div className="py-12">
            <div className="text-center mb-6">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mb-4"></div>
              <p className="text-lg font-medium text-neutral-300">Analysing {label.toLowerCase()}...</p>
            </div>
            
            {/* Progress Stages */}
            <div className="space-y-3 max-w-md mx-auto">
              {stages.map((stage, idx) => {
                const isActive = currentStageIndex >= idx;
                const isCurrent = currentStageIndex === idx;
                
                return (
                  <div key={stage.key} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      isActive 
                        ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white' 
                        : 'bg-neutral-800 text-neutral-500'
                    }`}>
                      {isActive ? (
                        isCurrent ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        ) : (
                          <span className="text-sm">✓</span>
                        )
                      ) : (
                        <span className="text-sm">{stage.icon}</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-medium transition-colors ${
                        isCurrent ? 'text-purple-300' : isActive ? 'text-neutral-300' : 'text-neutral-500'
                      }`}>
                        {stage.label}
                      </div>
                      {isCurrent && (
                        <div className="mt-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="py-8 text-center">
            <div className="text-red-400 text-4xl mb-3">⚠️</div>
            <p className="text-lg font-medium text-red-300 mb-2">Failed to generate suggestions</p>
            <p className="text-sm text-neutral-400">{error}</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm"
            >
              Close
            </button>
          </div>
        )}

        {/* Suggestions */}
        {!isLoading && !error && suggestions.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-400 mb-4">
              Here are AI-suggested cards to improve your deck's <span className="font-semibold text-purple-400">{label.toLowerCase()}</span>:
            </p>
            {suggestions.map((suggestion, idx) => {
              const normalized = suggestion.card.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
              const image = cardImages.get(normalized);
              
              return (
                <div 
                  key={idx} 
                  className="border border-neutral-700 rounded-lg p-4 bg-gradient-to-r from-neutral-800/50 to-neutral-800/30 hover:from-neutral-800 hover:to-neutral-700/50 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      {/* Card thumbnail */}
                      {image?.small && (
                        <img
                          src={image.small}
                          alt={suggestion.card}
                          className="w-12 h-17 object-cover rounded border border-neutral-600 flex-shrink-0 cursor-pointer hover:border-purple-500 transition-colors"
                          onMouseEnter={(e) => handleCardMouseEnter(e, suggestion.card)}
                          onMouseMove={(e) => {
                            if (hoverCard?.name === suggestion.card) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoverCard(prev => prev ? { ...prev, x: rect.right + 15, y: rect.top } : null);
                            }
                          }}
                          onMouseLeave={handleCardMouseLeave}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div 
                          className="font-semibold text-white mb-1 group-hover:text-purple-300 transition-colors cursor-pointer"
                          onMouseEnter={(e) => handleCardMouseEnter(e, suggestion.card)}
                          onMouseMove={(e) => {
                            if (hoverCard?.name === suggestion.card) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoverCard(prev => prev ? { ...prev, x: rect.right + 15, y: rect.top } : null);
                            }
                          }}
                          onMouseLeave={handleCardMouseLeave}
                        >
                          {suggestion.card}
                        </div>
                        <div className="text-sm text-neutral-400">{suggestion.reason}</div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await onAddCard(suggestion.card);
                        } catch (e: any) {
                          console.error('Failed to add card:', e);
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg whitespace-nowrap flex-shrink-0"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* No Suggestions */}
        {!isLoading && !error && suggestions.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-neutral-400">No suggestions available for this category.</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm"
            >
              Close
            </button>
          </div>
        )}

        {/* Card hover preview */}
        {hoverCard && (
          <div
            className="fixed pointer-events-none z-[60] transition-opacity duration-200"
            style={{ left: hoverCard.x, top: hoverCard.y }}
          >
            <img
              src={hoverCard.src}
              alt={hoverCard.name}
              className="w-64 rounded-lg shadow-2xl border-2 border-neutral-700"
            />
          </div>
        )}
      </div>
    </div>
  );
}
