'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DeckArtLoader from './DeckArtLoader';
import LikeButton from './likes/LikeButton';
import { aiMemory } from '@/lib/ai-memory';
import { capture } from '@/lib/ph';
import { EmptyDecksState } from './EmptyStates';
import { TagPills, TagSelector } from './DeckTags';

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
  const router = useRouter();
  const [deckStats, setDeckStats] = useState<Map<string, DeckStats>>(new Map());
  const [deckTags, setDeckTags] = useState<Map<string, string[]>>(new Map());
  const [tagModalOpen, setTagModalOpen] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    // PERFORMANCE OPTIMIZATION: Fetch stats and tags in parallel batches
    // NON-BLOCKING: Uses AbortController so navigation isn't blocked
    const abortController = new AbortController();
    let mounted = true;

    const fetchDeckData = async () => {
      if (mounted) setIsLoadingData(true);
      
      // Fetch all deck stats and tags in parallel
      const promises = rows.map(async (deck) => {
        try {
          // Check if aborted before fetching
          if (abortController.signal.aborted) return { deckId: deck.id, cardCount: 0, tags: [] };

          // Fetch cards and tags in parallel for this deck
          const [cardsRes, tagsRes] = await Promise.all([
            fetch(`/api/decks/cards?deckId=${deck.id}`, { 
              cache: 'no-store',
              signal: abortController.signal 
            }),
            fetch(`/api/decks/${deck.id}/tags`, { 
              cache: 'no-store',
              signal: abortController.signal 
            })
          ]);

          const [cardsJson, tagsJson] = await Promise.all([
            cardsRes.json().catch(() => ({ ok: false })),
            tagsRes.json().catch(() => ({ ok: false }))
          ]);

          return {
            deckId: deck.id,
            cardCount: cardsJson?.ok && cardsJson?.cards 
              ? cardsJson.cards.reduce((sum: number, c: any) => sum + (c.qty || 0), 0)
              : 0,
            tags: tagsJson?.ok && tagsJson?.tags ? tagsJson.tags : []
          };
        } catch (err: any) {
          // Ignore abort errors - they're expected when navigating away
          if (err.name === 'AbortError') {
            return { deckId: deck.id, cardCount: 0, tags: [] };
          }
          return { deckId: deck.id, cardCount: 0, tags: [] };
        }
      });

      // Wait for all fetches to complete, then update state once
      const results = await Promise.all(promises);
      
      // Only update state if component is still mounted and not aborted
      if (mounted && !abortController.signal.aborted) {
        const newStats = new Map<string, DeckStats>();
        const newTags = new Map<string, string[]>();
        
        results.forEach(result => {
          newStats.set(result.deckId, { cardCount: result.cardCount });
          newTags.set(result.deckId, result.tags);
        });
        
        setDeckStats(newStats);
        setDeckTags(newTags);
        setIsLoadingData(false);
      }
    };

    if (rows.length > 0) {
      fetchDeckData();
    } else {
      setIsLoadingData(false);
    }

    // Cleanup: Cancel all pending requests when component unmounts or navigating away
    return () => {
      mounted = false;
      abortController.abort();
    };
  }, [rows]);

  const handleTagsUpdate = async (deckId: string, newTags: string[]) => {
    // Optimistic update
    setDeckTags(prev => new Map(prev).set(deckId, newTags));
    
    // Save tags to backend
    try {
      const currentTags = deckTags.get(deckId) || [];
      
      // Remove old tags
      for (const tag of currentTags) {
        if (!newTags.includes(tag)) {
          await fetch(`/api/decks/${deckId}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
        }
      }
      
      // Add new tags
      for (const tag of newTags) {
        if (!currentTags.includes(tag)) {
          await fetch(`/api/decks/${deckId}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagLabel: tag }),
          });
        }
      }
    } catch (err) {
      console.error('Failed to update tags:', err);
      // Revert on error
      const res = await fetch(`/api/decks/${deckId}/tags`);
      const json = await res.json();
      if (json?.ok) {
        setDeckTags(prev => new Map(prev).set(deckId, json.tags));
      }
    }
  };

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
    <div className="space-y-4">
      {isLoadingData && (
        <div className="flex items-center gap-2 text-sm text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2">
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Loading deck details...</span>
        </div>
      )}
      
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
          >
            {(art, loading) => (
              <div className="group rounded-xl border border-neutral-800 overflow-hidden bg-neutral-950 flex flex-col hover:border-neutral-600 transition-colors">
                {/* Cover - Clickable */}
                <div 
                  className="relative h-48 w-full overflow-hidden block cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    // Navigate immediately - don't wait for anything
                    router.push(`/my-decks/${r.id}`);
                    // Fire analytics in background (non-blocking)
                    setTimeout(() => {
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
                    }, 0);
                  }}
                >
                  {art && !loading ? (
                    <img src={art} alt="cover" className="w-full h-full object-cover" />
                  ) : loading ? (
                    <div className="w-full h-full bg-neutral-900 skeleton-shimmer" />
                  ) : (
                    // Empty state placeholder with gradient and icon
                    <div className="w-full h-full bg-gradient-to-br from-emerald-900/20 via-blue-900/20 to-purple-900/20 flex items-center justify-center relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
                </div>
                
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
                  
                  {/* Tags */}
                  <div className="flex items-center gap-2">
                    <TagPills tags={deckTags.get(r.id) || []} maxDisplay={3} />
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setTagModalOpen(r.id);
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      aria-label="Edit tags"
                    >
                      {deckTags.get(r.id)?.length ? '✏️' : '+ Tags'}
                    </button>
                  </div>
                  
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

      {/* Tag Selector Modal */}
      {tagModalOpen && (
        <TagSelector
          isOpen={true}
          onClose={() => setTagModalOpen(null)}
          currentTags={deckTags.get(tagModalOpen) || []}
          onSave={(newTags) => {
            handleTagsUpdate(tagModalOpen, newTags);
            setTagModalOpen(null);
          }}
        />
      )}
    </div>
  );
}