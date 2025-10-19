'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import DeckArtLoader from './DeckArtLoader';
import LikeButton from './likes/LikeButton';
import { aiMemory } from '@/lib/ai-memory';
import { capture } from '@/lib/ph';
import { EmptyDecksState } from './EmptyStates';

interface DeckRow {
  id: string;
  title: string | null;
  commander: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_public: boolean;
  deck_text?: string;
}

interface MyDecksListProps {
  rows: DeckRow[];
  pinnedIds: string[];
}

interface DeckStats {
  cardCount: number;
  estimatedValue?: number;
}

export default function MyDecksList({ rows, pinnedIds }: MyDecksListProps) {
  const [deckStats, setDeckStats] = useState<Map<string, DeckStats>>(new Map());

  useEffect(() => {
    // Fetch stats for each deck
    rows.forEach(async (deck) => {
      try {
        const res = await fetch(`/api/decks/cards?deckId=${deck.id}`, { cache: 'no-store' });
        const json = await res.json();
        if (json?.ok && json?.cards) {
          const cardCount = json.cards.reduce((sum: number, c: any) => sum + (c.qty || 0), 0);
          setDeckStats(prev => new Map(prev).set(deck.id, { cardCount }));
        }
      } catch {}
    });
  }, [rows]);

  if (rows.length === 0) {
    return <EmptyDecksState />;
  }

  async function deleteDeck(deckId: string, deckName: string) {
    const { undoToastManager } = await import('@/lib/undo-toast');
    
    undoToastManager.showUndo({
      id: `delete-deck-${deckId}`,
      message: `Deleting "${deckName}"...`,
      duration: 5000,
      onUndo: () => {
        console.log('Deck deletion cancelled');
      },
      onExecute: async () => {
        try {
          const res = await fetch(`/api/decks/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deckId }),
          });

          const data = await res.json();

          if (data.ok) {
            capture('deck_deleted', { deck_id: deckId });
            window.location.reload();
          } else {
            const { toast } = await import('@/lib/toast-client');
            toast(data.error || 'Failed to delete deck', 'error');
          }
        } catch (e: any) {
          const { toast } = await import('@/lib/toast-client');
          toast(e.message || 'Failed to delete deck', 'error');
        }
      },
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rows.map((r) => {
        const title = r.title ?? "Untitled Deck";
        const stats = deckStats.get(r.id);
        const isPinned = pinnedIds.includes(r.id);
        
        return (
          <DeckArtLoader 
            key={r.id} 
            deckId={r.id} 
            commander={r.commander || undefined} 
            title={r.title || undefined}
            deckText={r.deck_text || undefined}
          >
            {(art, loading) => (
              <div className="group rounded-xl border border-neutral-800 overflow-hidden bg-neutral-950 flex flex-col hover:border-neutral-600 transition-colors">
                {/* Cover - Clickable */}
                <Link 
                  href={`/my-decks/${r.id}`}
                  className="relative h-48 w-full overflow-hidden block"
                  onClick={() => {
                    try {
                      capture('deck_card_click', { id: r.id });
                      const colors: string[] = [];
                      aiMemory.updateDeckContext({
                        id: r.id,
                        name: title,
                        commander: r.commander || undefined,
                        colors
                      });
                    } catch {}
                  }}
                >
                  {art && !loading ? (
                    <img src={art} alt="cover" className="w-full h-full object-cover" />
                  ) : loading ? (
                    <div className="w-full h-full bg-neutral-900 skeleton-shimmer" />
                  ) : (
                    // Empty state placeholder with gradient and icon
                    <div className="w-full h-full bg-gradient-to-br from-emerald-900/20 via-blue-900/20 to-purple-900/20 flex items-center justify-center relative overflow-hidden">
                      {/* Subtle pattern */}
                      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                      
                      {stats?.cardCount === 0 || stats?.cardCount === undefined ? (
                        // No cards: Show "Add cards" CTA
                        <div className="text-center z-10">
                          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-emerald-600/20 border-2 border-dashed border-emerald-600/40 flex items-center justify-center">
                            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </div>
                          <div className="text-sm text-emerald-300 font-medium">Add cards to see art</div>
                          <div className="text-xs text-neutral-400 mt-1">Click to start building</div>
                        </div>
                      ) : (
                        // Has cards but no art: Show mana symbol
                        <div className="text-center z-10">
                          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-blue-600/20 border-2 border-blue-600/40 flex items-center justify-center">
                            <svg className="w-10 h-10 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="12" r="10" opacity="0.3" />
                              <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
                            </svg>
                          </div>
                          <div className="text-sm text-blue-300 font-medium">Loading art...</div>
                          <div className="text-xs text-neutral-400 mt-1">{stats.cardCount} cards</div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  
                  {/* Pinned badge */}
                  {isPinned && (
                    <div className="absolute top-2 right-2 px-2 py-1 rounded bg-amber-600 text-white text-xs font-bold">
                      📌 PINNED
                    </div>
                  )}
                </Link>
                
                {/* Body with expanded stats */}
                <div className="p-4 flex-1 flex flex-col gap-3">
                  {/* Title and Delete */}
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/my-decks/${r.id}`} className="font-semibold text-base truncate hover:underline flex-1" title={title}>{title}</Link>
                    <button 
                      onClick={(e) => { e.preventDefault(); deleteDeck(r.id, title); }} 
                      className="text-xs text-red-400 hover:text-red-300 underline opacity-70 hover:opacity-100 transition-opacity"
                    >
                      Delete
                    </button>
                  </div>
                  
                  {/* Commander */}
                  {r.commander && (
                    <div className="text-xs text-gray-400 truncate" title={r.commander}>
                      Commander: {r.commander}
                    </div>
                  )}
                  
                  {/* Main stats - bigger pills */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 border border-blue-600/30 text-blue-300">
                      <span className="opacity-70">Cards:</span> <b className="font-mono ml-1">{stats?.cardCount || '—'}</b>
                    </span>
                    <span className={`px-2.5 py-1.5 rounded-lg ${r.is_public ? 'bg-emerald-600/20 border-emerald-600/30 text-emerald-300' : 'bg-neutral-700/20 border-neutral-700/30 text-neutral-400'}`}>
                      {r.is_public ? '🌐 Public' : '🔒 Private'}
                    </span>
                  </div>
                  
                  {/* Actions row */}
                  <div className="flex items-center gap-2 mt-auto pt-2 border-t border-neutral-800">
                    <LikeButton deckId={r.id} />
                    {(()=>{ 
                      try {
                        const Pin = require('@/components/PinDeckButton').default; 
                        return (<Pin deckId={r.id} pinned={isPinned} currentPinned={pinnedIds} />); 
                      } catch {
                        return null;
                      }
                    })()}
                    {(()=>{ 
                      try {
                        const Menu = require('@/components/DeckCardMenu').default; 
                        return (<Menu id={r.id} title={r.title} is_public={r.is_public} />); 
                      } catch {
                        return null;
                      }
                    })()}
                  </div>
                  
                  {/* Updated timestamp */}
                  <div className="text-[10px] opacity-50">
                    Updated: {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                  </div>
                </div>
              </div>
            )}
          </DeckArtLoader>
        );
      })}
    </div>
  );
}