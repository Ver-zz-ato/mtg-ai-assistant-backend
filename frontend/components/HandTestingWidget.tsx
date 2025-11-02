'use client';
import React, { useState, useEffect } from 'react';
import { useProStatus } from '@/hooks/useProStatus';
import { trackProGateViewed, trackProGateClicked, trackProUpgradeStarted, trackProFeatureUsed } from '@/lib/analytics-pro';

type Card = {
  name: string;
  qty: number;
  image_url?: string;
  mana_cost?: string;
  type_line?: string;
};

type HandCard = {
  name: string;
  image_url?: string;
  mana_cost?: string;
  type_line?: string;
  id: string; // unique ID for this draw
};

type TestSequence = {
  id: string;
  timestamp: number;
  decisions: Array<{
    hand: HandCard[];
    decision: 'keep' | 'mulligan';
    handSize: number;
    mulliganCount: number;
  }>;
  finalDecision: 'keep' | 'none';
  deckSnapshot: string; // first 10 cards for context
};

interface HandTestingWidgetProps {
  deckCards: Card[];
  deckId?: string;
  compact?: boolean;
  className?: string;
}

export default function HandTestingWidget({ 
  deckCards, 
  deckId, 
  compact = false, 
  className = "" 
}: HandTestingWidgetProps) {
  const { isPro } = useProStatus();
  const [currentHand, setCurrentHand] = useState<HandCard[]>([]);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [gameState, setGameState] = useState<'initial' | 'drawing' | 'viewing' | 'finished'>('initial');
  const [testSequence, setTestSequence] = useState<TestSequence | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [cardImages, setCardImages] = useState<Record<string, { small?: string; normal?: string; mana_cost?: string; type_line?: string }>>({});
  const [imagesLoading, setImagesLoading] = useState(false);
  const [pv, setPv] = useState<{ src: string; x: number; y: number; shown: boolean; below: boolean }>({ src: "", x: 0, y: 0, shown: false, below: false });

  // Expand deck list accounting for quantities
  const expandedDeck = React.useMemo(() => {
    const expanded: Card[] = [];
    for (const card of deckCards) {
      for (let i = 0; i < (card.qty || 1); i++) {
        expanded.push(card);
      }
    }
    return expanded;
  }, [deckCards]);

  // Fetch card images and details from Scryfall
  useEffect(() => {
    if (!isPro || deckCards.length === 0) return;
    
    const fetchCardImages = async () => {
      setImagesLoading(true);
      try {
        const uniqueNames = Array.from(new Set(deckCards.map(card => card.name))).slice(0, 200);
        if (uniqueNames.length === 0) return;
        
        console.log('Fetching images for cards:', uniqueNames);
        
        // Try internal API first, then fallback to Scryfall directly
        let response;
        try {
          response = await fetch('/api/cards/batch-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names: uniqueNames })
          });
        } catch (error) {
          console.log('Internal API failed, trying Scryfall directly:', error);
          // Fallback to Scryfall directly
          const identifiers = uniqueNames.map(name => ({ name: name.trim() }));
          response = await fetch('https://api.scryfall.com/cards/collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifiers })
          });
        }
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API response received:', {
          hasData: !!data?.data,
          dataLength: data?.data?.length || 0,
          hasNotFound: !!data?.not_found,
          notFoundCount: data?.not_found?.length || 0
        });
        
        if (data?.data && Array.isArray(data.data)) {
          const imageMap: Record<string, any> = {};
          
          data.data.forEach((card: any, index: number) => {
            const name = card.name?.toLowerCase()?.trim() || '';
            const images = card.image_uris || card.card_faces?.[0]?.image_uris || {};
            
            if (name) {
              imageMap[name] = {
                small: images.small || images.normal,
                normal: images.normal || images.large,
                mana_cost: card.mana_cost || '',
                type_line: card.type_line || ''
              };
              console.log(`Card ${index + 1}: ${name} -> images available:`, {
                hasSmall: !!images.small,
                hasNormal: !!images.normal,
                hasLarge: !!images.large
              });
            }
          });
          
          console.log('Final image map created with', Object.keys(imageMap).length, 'entries');
          setCardImages(imageMap);
        } else {
          console.warn('No data array found in response:', data);
        }
        
        if (data?.not_found && data.not_found.length > 0) {
          console.warn('Some cards not found:', data.not_found);
        }
      } catch (error) {
        console.error('Failed to fetch card images:', error);
      } finally {
        setImagesLoading(false);
      }
    };
    
    fetchCardImages();
  }, [deckCards, isPro]);

  // Fisher-Yates shuffle
  const shuffleDeck = (deck: Card[]): Card[] => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Position calculation for hover preview (same as CardsPane)
  const calcPos = (e: MouseEvent | any) => {
    try {
      const vw = window.innerWidth; const vh = window.innerHeight;
      const margin = 12; const boxW = 320; const boxH = 460; // approximate
      const half = boxW / 2;
      const rawX = e.clientX as number;
      const rawY = e.clientY as number;
      const below = rawY - boxH - margin < 0; // if not enough room above, render below
      const x = Math.min(vw - margin - half, Math.max(margin + half, rawX));
      const y = below ? Math.min(vh - margin, rawY + margin) : Math.max(margin + 1, rawY - margin);
      return { x, y, below };
    } catch {
      return { x: (e as any).clientX || 0, y: (e as any).clientY || 0, below: false };
    }
  };

  // Draw opening hand
  const drawHand = (size: number = 7): HandCard[] => {
    const shuffled = shuffleDeck(expandedDeck);
    console.log('Drawing hand of size:', size);
    console.log('Available card images:', Object.keys(cardImages).length, 'entries');
    
    return shuffled.slice(0, size).map((card, index) => {
      const normalizedName = card.name.toLowerCase()?.trim();
      const cardData = cardImages[normalizedName] || {};
      const hasImage = !!(cardData.small || cardData.normal);
      
      console.log(`Card ${index + 1}: "${card.name}" (normalized: "${normalizedName}") -> has image: ${hasImage}`);
      if (!hasImage) {
        console.log('Available image keys:', Object.keys(cardImages).slice(0, 10));
      }
      
      return {
        ...card,
        id: `${Date.now()}-${index}-${Math.random()}`,
        image_url: compact ? (cardData.small || cardData.normal) : (cardData.normal || cardData.small),
        mana_cost: cardData.mana_cost || card.mana_cost,
        type_line: cardData.type_line || card.type_line
      };
    });
  };

  // Start new test
  const startHandTest = async () => {
    if (!isPro) return;
    
    // If images are still loading, wait for them
    if (imagesLoading) {
      console.log('Images still loading, waiting...');
      return;
    }
    
    // If no images loaded yet, try to wait a bit more
    if (Object.keys(cardImages).length === 0) {
      console.log('No card images loaded yet, waiting a moment...');
      setTimeout(() => {
        if (Object.keys(cardImages).length > 0) {
          startHandTest();
        }
      }, 500);
      return;
    }
    
    // Track PRO feature usage
    trackProFeatureUsed('hand_testing');
    
    setIsAnimating(true);
    setGameState('drawing');
    setMulliganCount(0);
    
    // Log activity
    try {
      await fetch('/api/stats/activity/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'mulligan_ran',
          message: 'Mulligan simulation run',
        }),
      });
    } catch {}
    
    // Create new test sequence
    const newSequence: TestSequence = {
      id: `test-${Date.now()}`,
      timestamp: Date.now(),
      decisions: [],
      finalDecision: 'none',
      deckSnapshot: expandedDeck.slice(0, 10).map(c => c.name).join(', ')
    };
    setTestSequence(newSequence);

    // Simulate shuffling animation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const hand = drawHand();
    setCurrentHand(hand);
    setGameState('viewing');
    setIsAnimating(false);
  };

  // Handle mulligan decision
  const handleDecision = (decision: 'keep' | 'mulligan') => {
    if (!testSequence || !isPro) return;

    const newDecision = {
      hand: [...currentHand],
      decision,
      handSize: currentHand.length,
      mulliganCount
    };

    const updatedSequence = {
      ...testSequence,
      decisions: [...testSequence.decisions, newDecision]
    };

    if (decision === 'keep') {
      updatedSequence.finalDecision = 'keep';
      setTestSequence(updatedSequence);
      setGameState('finished');
    } else {
      // Mulligan - draw new hand
      if (mulliganCount >= 6) {
        // Force keep after too many mulligans
        updatedSequence.finalDecision = 'keep';
        setTestSequence(updatedSequence);
        setGameState('finished');
        return;
      }

      setIsAnimating(true);
      setGameState('drawing');
      setMulliganCount(prev => prev + 1);
      
      setTimeout(() => {
        const handSize = Math.max(1, 7 - (mulliganCount + 1)); // London mulligan
        const newHand = drawHand(handSize);
        setCurrentHand(newHand);
        setGameState('viewing');
        setIsAnimating(false);
        setTestSequence(updatedSequence);
      }, 800);
    }
  };

  // Share test sequence
  const shareSequence = () => {
    if (!testSequence) return;
    
    const shareData = {
      deckId,
      sequence: testSequence,
      url: window.location.href
    };
    
    const shareText = `Hand Testing Sequence - ${testSequence.decisions.length} decisions, Final: ${testSequence.finalDecision}`;
    
    const baseUrl = window.location.hostname === 'localhost' ? 'https://manatap.ai' : window.location.origin;
    const isLocalhost = window.location.hostname === 'localhost';
    
    if (navigator.share) {
      navigator.share({
        title: 'MTG Hand Test Results',
        text: shareText,
        url: `${baseUrl}/hand-test/${testSequence.id}?data=${encodeURIComponent(JSON.stringify(shareData))}`
      });
    } else {
      // For clipboard, use production URL or current page URL
      const shareUrl = isLocalhost 
        ? window.location.href.replace(/localhost:3000|localhost:4000/g, 'manatap.ai').replace('http://', 'https://')
        : window.location.href;
      navigator.clipboard?.writeText(`${shareText}\n${shareUrl}`);
      setShowShareModal(true);
      setTimeout(() => setShowShareModal(false), 3000);
    }
  };

  // Track PRO gate view for non-PRO users
  useEffect(() => {
    if (!isPro) {
      trackProGateViewed('hand_testing', 'widget_display');
    }
  }, [isPro]);

  if (!isPro) {
    return (
      <div className={`bg-gradient-to-br from-amber-900/20 to-amber-800/10 border border-amber-700/40 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center">
            🃏
          </div>
          <div>
            <h3 className="font-semibold text-amber-200">Hand Testing Widget</h3>
            <p className="text-sm opacity-80">Test opening hands with realistic mulligan decisions</p>
          </div>
          <div className="ml-auto">
            <span className="inline-flex items-center rounded bg-amber-300 text-black text-[10px] font-bold px-2 py-1 uppercase tracking-wide">
              PRO
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <span className="w-4 h-4 bg-green-500 rounded-full flex-shrink-0"></span>
              Interactive hand drawing with animations
            </p>
            <p className="flex items-center gap-2">
              <span className="w-4 h-4 bg-blue-500 rounded-full flex-shrink-0"></span>
              London mulligan simulation
            </p>
            <p className="flex items-center gap-2">
              <span className="w-4 h-4 bg-purple-500 rounded-full flex-shrink-0"></span>
              Track keep vs mulligan decisions
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <span className="w-4 h-4 bg-amber-500 rounded-full flex-shrink-0"></span>
              Shareable test sequences
            </p>
            <p className="flex items-center gap-2">
              <span className="w-4 h-4 bg-red-500 rounded-full flex-shrink-0"></span>
              Visual card representations
            </p>
            <p className="flex items-center gap-2">
              <span className="w-4 h-4 bg-teal-500 rounded-full flex-shrink-0"></span>
              Statistical tracking
            </p>
          </div>
        </div>
        
        <div className="text-center">
          <button 
            onClick={() => {
              trackProGateClicked('hand_testing', 'widget_display');
              trackProUpgradeStarted('hand_testing_widget', 'hand_testing');
              // TODO: Navigate to upgrade page
              window.location.href = '/pricing';
            }}
            className="px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-500 text-black font-semibold rounded-lg hover:from-amber-500 hover:to-amber-400 transition-all duration-200 transform hover:scale-105"
          >
            Upgrade to PRO
          </button>
          <p className="text-xs opacity-60 mt-2">Unlock advanced deck testing tools</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-neutral-900 border border-neutral-700 rounded-lg p-4 w-full ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center">
            {imagesLoading ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
            ) : (
              '🃏'
            )}
          </div>
          <div>
            <h3 className="font-semibold text-amber-200">Hand Testing Widget</h3>
            <p className="text-xs opacity-70">
              {imagesLoading ? 'Loading card images...' :
               Object.keys(cardImages).length === 0 ? 'Waiting for card images...' :
               `${expandedDeck.length} cards • ${Object.keys(cardImages).length} images loaded • ${gameState === 'initial' ? 'Ready to test' : 
                gameState === 'finished' ? `Test complete (${mulliganCount} mulligans)` :
                `Testing... (${mulliganCount} mulligans)`}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {testSequence && gameState === 'finished' && (
            <button
              onClick={shareSequence}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors"
            >
              Share Results
            </button>
          )}
          <button
            onClick={startHandTest}
            disabled={isAnimating || imagesLoading || Object.keys(cardImages).length === 0}
            className={`px-4 py-2 rounded-md font-medium transition-all duration-200 ${
              isAnimating || imagesLoading || Object.keys(cardImages).length === 0
                ? 'bg-neutral-700 text-neutral-400 cursor-not-allowed' 
                : 'bg-amber-600 hover:bg-amber-500 text-black'
            }`}
          >
            {imagesLoading ? 'Loading Cards...' :
             Object.keys(cardImages).length === 0 ? 'Waiting for Images...' :
             gameState === 'initial' ? 'Draw Opening Hand' : 
             isAnimating ? 'Shuffling...' : 'New Test'}
          </button>
        </div>
      </div>

      {/* Hand Display */}
      {(gameState === 'viewing' || gameState === 'finished') && currentHand.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">
              Current Hand ({currentHand.length} cards)
              {mulliganCount > 0 && (
                <span className="ml-2 text-xs bg-orange-600 text-white px-2 py-0.5 rounded">
                  {mulliganCount} mulligan{mulliganCount > 1 ? 's' : ''}
                </span>
              )}
            </h4>
          </div>
          
          <div className={`grid gap-4 p-2 transition-all duration-500 ${
            isAnimating ? 'scale-95 opacity-50' : 'scale-100 opacity-100'
          } ${
            compact ? 'grid-cols-5 lg:grid-cols-7' : 
            currentHand.length <= 3 ? 'grid-cols-3' : 
            currentHand.length <= 4 ? 'grid-cols-4' : 
            currentHand.length <= 5 ? 'grid-cols-5' : 
            currentHand.length <= 6 ? 'grid-cols-6' : 'grid-cols-7'
          }`}>
            {currentHand.map((card, index) => (
              <div
                key={card.id}
                className={`bg-neutral-800 border border-neutral-600 rounded-lg overflow-hidden hover:border-amber-500 hover:shadow-lg hover:shadow-amber-500/20 group relative ${
                  compact ? 'text-xs' : 'text-sm'
                }`}
                style={{
                  animationDelay: `${index * 100}ms`,
                  animation: gameState === 'viewing' && !isAnimating ? 'slideInUp 0.5s ease-out' : 'none'
                }}
                title={card.name}
              >
                {card.image_url ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={card.image_url} 
                      alt={card.name}
                      className={`w-full object-cover transition-transform duration-200 ${
                        compact ? 'h-32' : 'h-40 md:h-48'
                      }`}
                      onMouseEnter={(e) => {
                        const { x, y, below } = calcPos(e as any);
                        const normalizedName = card.name.toLowerCase()?.trim();
                        const fullImage = cardImages[normalizedName]?.normal || card.image_url || '';
                        setPv({ src: fullImage, x, y, shown: true, below });
                      }}
                      onMouseMove={(e) => {
                        const { x, y, below } = calcPos(e as any);
                        setPv(p => p.shown ? { ...p, x, y, below } : p);
                      }}
                      onMouseLeave={() => setPv(p => ({ ...p, shown: false }))}
                      onError={(e) => {
                        // Fallback to text display if image fails
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        target.nextElementSibling!.classList.remove('hidden');
                      }}
                    />
                    <div className="hidden p-2">
                      <div className="font-medium text-white truncate" title={card.name}>
                        {card.name}
                      </div>
                      {card.mana_cost && (
                        <div className="text-xs text-neutral-400 mt-1">
                          {card.mana_cost}
                        </div>
                      )}
                      <div className="text-xs text-neutral-500 mt-1 truncate">
                        {card.type_line?.split('—')[0]?.trim() || 'Unknown'}
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                      <div className="text-xs font-medium text-white truncate">
                        {card.name}
                      </div>
                      {card.mana_cost && (
                        <div className="text-xs text-neutral-300">
                          {card.mana_cost}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={`p-3 ${
                    compact ? 'h-32' : 'h-40 md:h-48'
                  } flex flex-col justify-center`}>
                    <div className={`font-medium text-white text-center ${
                      compact ? 'text-xs' : 'text-sm'
                    }`} title={card.name}>
                      {card.name}
                    </div>
                    {card.mana_cost && (
                      <div className="text-xs text-neutral-400 mt-2 text-center">
                        {card.mana_cost}
                      </div>
                    )}
                    <div className="text-xs text-neutral-500 mt-1 text-center">
                      {card.type_line?.split('—')[0]?.trim() || 'Unknown'}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {gameState === 'viewing' && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={() => handleDecision('keep')}
                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md font-medium transition-colors"
              >
                Keep Hand
              </button>
              <button
                onClick={() => handleDecision('mulligan')}
                disabled={mulliganCount >= 6}
                className={`px-6 py-2 rounded-md font-medium transition-colors ${
                  mulliganCount >= 6
                    ? 'bg-neutral-600 text-neutral-400 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                }`}
              >
                {mulliganCount >= 6 ? 'Must Keep' : 'Mulligan'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Shuffling Animation */}
      {isAnimating && gameState === 'drawing' && (
        <div className="flex items-center justify-center py-8">
          <div className="flex space-x-1">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="w-12 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-md animate-pulse"
                style={{
                  animationDelay: `${i * 100}ms`,
                  animationDuration: '1s'
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Test Results */}
      {testSequence && gameState === 'finished' && (
        <div className="bg-neutral-800 rounded-md p-3 mt-4">
          <h4 className="text-sm font-medium mb-2">Test Results</h4>
          <div className="space-y-1 text-xs">
            <p>Total decisions: {testSequence.decisions.length}</p>
            <p>Final decision: <span className={`font-semibold ${testSequence.finalDecision === 'keep' ? 'text-green-400' : 'text-red-400'}`}>
              {testSequence.finalDecision}
            </span></p>
            <p>Mulligans taken: {mulliganCount}</p>
            <p>Final hand size: {currentHand.length}</p>
          </div>
        </div>
      )}

      {/* Share confirmation */}
      {showShareModal && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg z-50">
          Results copied to clipboard!
        </div>
      )}

      {/* Global hover preview for card images */}
      {pv.shown && typeof window !== 'undefined' && (
        <div className="fixed z-[9999] pointer-events-none" style={{ left: pv.x, top: pv.y, transform: `translate(-50%, ${pv.below ? '0%' : '-100%'})` }}>
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80 transition-opacity duration-150 ease-out opacity-100" style={{ minWidth: '18rem' }}>
            <img src={pv.src} alt="preview" className="block w-full h-auto max-h-[70vh] max-w-none object-contain rounded" />
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}