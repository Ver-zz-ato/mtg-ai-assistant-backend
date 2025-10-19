'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePro } from '@/components/ProContext';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface Deck {
  id: string;
  title: string | null;
  commander: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface DeckData {
  id: string;
  title: string;
  commander: string | null;
  cards: Array<{ name: string; qty: number }>;
  totalCards: number;
  uniqueCards: number;
  estimatedValue?: number;
}

interface ComparisonStats {
  sharedCards: Array<{ name: string; quantities: number[] }>;
  uniqueToDecks: Array<{ deckIndex: number; cards: Array<{ name: string; qty: number }> }>;
}

export default function DeckComparisonTool({ decks }: { decks: Deck[] }) {
  const searchParams = useSearchParams();
  const { isPro } = usePro();
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [deckData, setDeckData] = useState<Map<string, DeckData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState<ComparisonStats | null>(null);

  // Auto-select deck from URL parameter
  useEffect(() => {
    const deck1Param = searchParams.get('deck1');
    if (deck1Param && decks.some(d => d.id === deck1Param)) {
      setSelectedDeckIds([deck1Param]);
    }
  }, [searchParams, decks]);

  // Fetch deck data when selections change
  useEffect(() => {
    if (selectedDeckIds.length === 0) {
      setComparison(null);
      return;
    }

    const fetchDeckData = async () => {
      setLoading(true);
      const newData = new Map<string, DeckData>();

      for (const deckId of selectedDeckIds) {
        // Skip if already fetched
        if (deckData.has(deckId)) {
          newData.set(deckId, deckData.get(deckId)!);
          continue;
        }

        try {
          const res = await fetch(`/api/decks/cards?deckId=${deckId}`);
          const json = await res.json();

          if (json?.ok && json?.cards) {
            const cards = json.cards.map((c: any) => ({
              name: c.name,
              qty: c.qty || 1,
            }));

            const totalCards = cards.reduce((sum: number, c: any) => sum + c.qty, 0);
            const uniqueCards = cards.length;

            const deck = decks.find(d => d.id === deckId);
            newData.set(deckId, {
              id: deckId,
              title: deck?.title || 'Untitled Deck',
              commander: deck?.commander || null,
              cards,
              totalCards,
              uniqueCards,
            });
          }
        } catch (error) {
          console.error(`Failed to fetch deck ${deckId}:`, error);
        }
      }

      setDeckData(newData);
      
      // Calculate comparison
      if (newData.size >= 2) {
        calculateComparison(Array.from(newData.values()));
      }

      setLoading(false);
    };

    fetchDeckData();
  }, [selectedDeckIds]);

  const calculateComparison = (decks: DeckData[]) => {
    // Build card name -> deck quantities map
    const cardMap = new Map<string, number[]>();

    decks.forEach((deck, deckIndex) => {
      deck.cards.forEach(card => {
        const key = card.name.toLowerCase();
        if (!cardMap.has(key)) {
          cardMap.set(key, new Array(decks.length).fill(0));
        }
        cardMap.get(key)![deckIndex] = card.qty;
      });
    });

    // Find shared cards (in all decks)
    const sharedCards: Array<{ name: string; quantities: number[] }> = [];
    const uniqueToDecks: Array<{ deckIndex: number; cards: Array<{ name: string; qty: number }> }> = [];

    // Initialize unique arrays
    for (let i = 0; i < decks.length; i++) {
      uniqueToDecks.push({ deckIndex: i, cards: [] });
    }

    cardMap.forEach((quantities, cardName) => {
      const presentInAllDecks = quantities.every(q => q > 0);
      
      if (presentInAllDecks) {
        sharedCards.push({
          name: cardName,
          quantities,
        });
      } else {
        // Card is unique to some deck(s)
        quantities.forEach((qty, deckIndex) => {
          if (qty > 0) {
            // Check if it's in any other deck
            const inOtherDecks = quantities.some((q, i) => i !== deckIndex && q > 0);
            if (!inOtherDecks) {
              uniqueToDecks[deckIndex].cards.push({
                name: cardName,
                qty,
              });
            }
          }
        });
      }
    });

    setComparison({
      sharedCards,
      uniqueToDecks,
    });
  };

  const handleDeckSelect = async (deckId: string) => {
    setSelectedDeckIds(prev => {
      // If already selected, remove it
      if (prev.includes(deckId)) {
        return prev.filter(id => id !== deckId);
      }

      // Add deck (max 3, but need to check Pro for 3rd)
      if (prev.length >= 3) {
        return prev;
      }

      // If trying to add 3rd deck, verify Pro status directly
      if (prev.length === 2) {
        // Check Pro status asynchronously
        (async () => {
          const supabase = createBrowserSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          
          if (!user) {
            alert('⭐ Comparing 3 decks requires a Pro subscription. Upgrade to unlock this feature!');
            return;
          }
          
          // Check profile table for authoritative Pro status
          const { data: profile } = await supabase
            .from('profiles')
            .select('is_pro')
            .eq('id', user.id)
            .single();
          
          const isActuallyPro = profile?.is_pro || user?.user_metadata?.is_pro || user?.user_metadata?.pro;
          
          if (!isActuallyPro) {
            alert('⭐ Comparing 3 decks requires a Pro subscription. Upgrade to unlock this feature!');
            // Remove the deck we just added
            setSelectedDeckIds(curr => curr.filter(id => id !== deckId));
          }
        })();
      }

      return [...prev, deckId];
    });
  };

  const exportToPDF = async () => {
    // Dynamic import to reduce bundle size
    const { jsPDF } = await import('jspdf');
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    // Title
    doc.setFontSize(18);
    doc.text('Deck Comparison Report', pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    // Deck names
    doc.setFontSize(12);
    const selectedDecks = Array.from(deckData.values());
    selectedDecks.forEach((deck, i) => {
      doc.text(`Deck ${i + 1}: ${deck.title}`, 20, yPos);
      yPos += 7;
      if (deck.commander) {
        doc.setFontSize(10);
        doc.text(`Commander: ${deck.commander}`, 30, yPos);
        doc.setFontSize(12);
        yPos += 7;
      }
    });

    yPos += 10;

    // Shared cards
    if (comparison && comparison.sharedCards.length > 0) {
      doc.setFontSize(14);
      doc.text('Shared Cards', 20, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      comparison.sharedCards.slice(0, 30).forEach(card => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        const quantities = card.quantities.map(q => `${q}x`).join(', ');
        doc.text(`${card.name} (${quantities})`, 20, yPos);
        yPos += 6;
      });
      
      if (comparison.sharedCards.length > 30) {
        doc.text(`... and ${comparison.sharedCards.length - 30} more`, 20, yPos);
        yPos += 6;
      }
    }

    yPos += 10;

    // Unique cards per deck
    if (comparison) {
      comparison.uniqueToDecks.forEach((deckUnique, i) => {
        if (deckUnique.cards.length > 0) {
          if (yPos > 250) {
            doc.addPage();
            yPos = 20;
          }
          
          doc.setFontSize(14);
          doc.text(`Unique to ${selectedDecks[i].title}`, 20, yPos);
          yPos += 10;
          
          doc.setFontSize(10);
          deckUnique.cards.slice(0, 20).forEach(card => {
            if (yPos > 270) {
              doc.addPage();
              yPos = 20;
            }
            doc.text(`${card.qty}x ${card.name}`, 20, yPos);
            yPos += 6;
          });
          
          if (deckUnique.cards.length > 20) {
            doc.text(`... and ${deckUnique.cards.length - 20} more`, 20, yPos);
            yPos += 6;
          }
          
          yPos += 10;
        }
      });
    }

    // Save PDF
    doc.save(`deck-comparison-${Date.now()}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Deck Selector */}
      <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6">
        <h2 className="text-lg font-semibold mb-4">Select Decks to Compare</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {decks.map(deck => {
            const isSelected = selectedDeckIds.includes(deck.id);
            const selectionIndex = selectedDeckIds.indexOf(deck.id);
            
            return (
              <button
                key={deck.id}
                onClick={() => handleDeckSelect(deck.id)}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-neutral-700 hover:border-neutral-600 bg-neutral-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{deck.title || 'Untitled Deck'}</div>
                    {deck.commander && (
                      <div className="text-xs text-gray-400 truncate mt-1">
                        {deck.commander}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
                      {selectionIndex + 1}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {selectedDeckIds.length < 2 && (
          <p className="text-sm text-gray-400 mt-4">
            Select at least 2 decks to compare
          </p>
        )}
        
        {selectedDeckIds.length === 2 && !isPro && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-sm text-amber-300">
              💎 <strong>Pro Feature:</strong> Compare up to 3 decks! <a href="/pricing" className="underline">Upgrade now</a>
            </p>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      )}

      {/* Comparison Results */}
      {!loading && selectedDeckIds.length >= 2 && comparison && (
        <div className="space-y-6">
          {/* NEW LAYOUT: Side-by-side decks with comparison in middle */}
          {selectedDeckIds.length === 2 ? (
            // 2 DECKS: Deck 1 | Comparison | Deck 2
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
              {/* Deck 1 */}
              {(() => {
                const deck = Array.from(deckData.values())[0];
                if (!deck) return null;
                return (
                  <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold text-sm">1</div>
                      <div className="flex-1 min-w-0">
                        <Link href={`/my-decks/${deck.id}`} className="font-semibold truncate hover:text-blue-400 transition-colors block">
                          {deck.title}
                        </Link>
                        {deck.commander && <div className="text-xs text-gray-500 truncate">{deck.commander}</div>}
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <div><span className="text-gray-400">Total:</span> <span className="font-medium">{deck.totalCards}</span></div>
                      <div><span className="text-gray-400">Unique:</span> <span className="font-medium">{deck.uniqueCards}</span></div>
                    </div>
                    <div className="space-y-1 max-h-[600px] overflow-y-auto">
                      <div className="text-xs font-semibold text-gray-400 mb-2">Cards ({deck.cards.length})</div>
                      {deck.cards.map((card, j) => (
                        <div key={j} className="text-sm py-1 px-2 bg-neutral-800/50 rounded flex gap-2">
                          <span className="text-gray-500 text-xs w-6">{card.qty}x</span>
                          <span className="flex-1 truncate">{card.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Comparison in Middle */}
              <div className="w-80 space-y-4">
                {/* Shared Cards */}
                <div className="bg-green-500/10 rounded-xl border border-green-500/30 p-4">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-green-400">
                    <span>✓</span> Shared ({comparison.sharedCards.length})
                  </h4>
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {comparison.sharedCards.slice(0, 50).map((card, i) => (
                      <div key={i} className="text-xs py-1 px-2 bg-green-500/10 rounded">
                        {card.name}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Unique to Each */}
                {comparison.uniqueToDecks.map((deckUnique, i) => {
                  const deck = Array.from(deckData.values())[i];
                  if (!deck || deckUnique.cards.length === 0) return null;
                  return (
                    <div key={i} className="bg-blue-500/10 rounded-xl border border-blue-500/30 p-4">
                      <h4 className="font-semibold text-sm mb-2 text-blue-400">
                        Only in Deck {i + 1} ({deckUnique.cards.length})
                      </h4>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {deckUnique.cards.slice(0, 30).map((card, j) => (
                          <div key={j} className="text-xs py-1 px-2 bg-blue-500/10 rounded">
                            {card.qty}x {card.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Deck 2 */}
              {(() => {
                const deck = Array.from(deckData.values())[1];
                if (!deck) return null;
                return (
                  <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center font-bold text-sm">2</div>
                      <div className="flex-1 min-w-0">
                        <Link href={`/my-decks/${deck.id}`} className="font-semibold truncate hover:text-purple-400 transition-colors block">
                          {deck.title}
                        </Link>
                        {deck.commander && <div className="text-xs text-gray-500 truncate">{deck.commander}</div>}
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <div><span className="text-gray-400">Total:</span> <span className="font-medium">{deck.totalCards}</span></div>
                      <div><span className="text-gray-400">Unique:</span> <span className="font-medium">{deck.uniqueCards}</span></div>
                    </div>
                    <div className="space-y-1 max-h-[600px] overflow-y-auto">
                      <div className="text-xs font-semibold text-gray-400 mb-2">Cards ({deck.cards.length})</div>
                      {deck.cards.map((card, j) => (
                        <div key={j} className="text-sm py-1 px-2 bg-neutral-800/50 rounded flex gap-2">
                          <span className="text-gray-500 text-xs w-6">{card.qty}x</span>
                          <span className="flex-1 truncate">{card.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            // 3 DECKS: Show all 3 across, then comparison below
            <>
              <div className="grid grid-cols-3 gap-4">
                {Array.from(deckData.values()).map((deck, i) => (
                  <div key={deck.id} className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center font-bold text-sm">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <Link href={`/my-decks/${deck.id}`} className="font-semibold truncate hover:text-blue-400 transition-colors block">
                          {deck.title}
                        </Link>
                        {deck.commander && <div className="text-xs text-gray-500 truncate">{deck.commander}</div>}
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <div><span className="text-gray-400">Total:</span> <span className="font-medium">{deck.totalCards}</span></div>
                      <div><span className="text-gray-400">Unique:</span> <span className="font-medium">{deck.uniqueCards}</span></div>
                    </div>
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                      <div className="text-xs font-semibold text-gray-400 mb-2">Cards ({deck.cards.length})</div>
                      {deck.cards.map((card, j) => (
                        <div key={j} className="text-sm py-1 px-2 bg-neutral-800/50 rounded flex gap-2">
                          <span className="text-gray-500 text-xs w-6">{card.qty}x</span>
                          <span className="flex-1 truncate">{card.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Comparison below for 3 decks */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-500/10 rounded-xl border border-green-500/30 p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-green-400">
                    <span>✓</span> Shared Cards ({comparison.sharedCards.length})
                  </h3>
                  {comparison.sharedCards.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                      {comparison.sharedCards.map((card, i) => (
                        <div key={i} className="p-2 bg-green-500/10 rounded text-sm">{card.name}</div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">No cards shared across all 3 decks</p>
                  )}
                </div>
                
                <div className="space-y-4">
                  {comparison.uniqueToDecks.map((deckUnique, i) => {
                    const deck = Array.from(deckData.values())[i];
                    if (!deck || deckUnique.cards.length === 0) return null;
                    return (
                      <div key={i} className="bg-blue-500/10 rounded-xl border border-blue-500/30 p-4">
                        <h4 className="font-semibold text-sm mb-2 text-blue-400">Only in {deck.title} ({deckUnique.cards.length})</h4>
                        <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                          {deckUnique.cards.slice(0, 20).map((card, j) => (
                            <div key={j} className="text-xs py-1 px-2 bg-blue-500/10 rounded">{card.qty}x {card.name}</div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Export Button */}
          <div className="flex justify-center">
            <button
              onClick={exportToPDF}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg font-semibold transition-all flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export to PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

