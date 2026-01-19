'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSwipeable } from 'react-swipeable';
import DeckArtLoader from './DeckArtLoader';
import LikeButton from './likes/LikeButton';
import { aiMemory } from '@/lib/ai-memory';
import { capture } from '@/lib/ph';
import { EmptyDecksState } from './EmptyStates';
import { TagPills, TagSelector } from './DeckTags';
import { getTagByLabel } from '@/lib/predefined-tags';

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
  const [swipedDeckId, setSwipedDeckId] = useState<string | null>(null);

  useEffect(() => {
    // PERFORMANCE FIX: Delay data fetching to make page interactive first
    // This prevents blocking navigation when clicking decks immediately after page load
    const abortController = new AbortController();
    let mounted = true;

    // Wait 100ms before starting fetches to allow page to become interactive
    const delayTimer = setTimeout(() => {
      fetchDeckData();
    }, 100);

    const fetchDeckData = async () => {
      if (mounted) setIsLoadingData(true);
      
      try {
        // Check if aborted before fetching
        if (abortController.signal.aborted) return;

        // PERFORMANCE: Use bulk stats endpoint instead of individual API calls per deck
        // This reduces from 2N API calls (N cards + N tags) to just 1 API call total
        const deckIds = rows.map(d => d.id);
        
        const bulkRes = await fetch('/api/decks/bulk-stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckIds }),
          cache: 'no-store',
          signal: abortController.signal
        });

        if (abortController.signal.aborted) return;

        const bulkJson = await bulkRes.json().catch(() => ({ ok: false }));

        if (!bulkJson?.ok || !bulkJson?.stats) {
          // Fallback to empty stats if bulk endpoint fails
          const newStats = new Map<string, DeckStats>();
          const newTags = new Map<string, string[]>();
          if (mounted && !abortController.signal.aborted) {
            setDeckStats(newStats);
            setDeckTags(newTags);
            setIsLoadingData(false);
          }
          return;
        }

        const stats = bulkJson.stats;
        
        // Convert bulk response to the expected format
        const results = deckIds.map(deckId => ({
          deckId,
          cardCount: stats[deckId]?.cardCount || 0,
          tags: stats[deckId]?.tags || []
        }));
        
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
      } catch (err: any) {
        // Ignore abort errors - they're expected when navigating away
        if (err.name !== 'AbortError' && mounted && !abortController.signal.aborted) {
          // On error, set empty stats (graceful degradation)
          setDeckStats(new Map());
          setDeckTags(new Map());
          setIsLoadingData(false);
        }
      }
    };

    if (rows.length === 0) {
      setIsLoadingData(false);
    }

    // Cleanup: Cancel timer and all pending requests when component unmounts or navigating away
    return () => {
      mounted = false;
      clearTimeout(delayTimer);
      abortController.abort();
    };
  }, [rows]);

  const handleTagsUpdate = async (deckId: string, newTags: string[]) => {
    // Capture current tags BEFORE optimistic update
    const currentTags = deckTags.get(deckId) || [];
    
    // Optimistic update
    setDeckTags(prev => new Map(prev).set(deckId, newTags));
    
    // Save tags to backend
    try {
      // Remove old tags
      for (const tag of currentTags) {
        if (!newTags.includes(tag)) {
          const res = await fetch(`/api/decks/${deckId}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
          if (!res.ok) {
            console.error(`Failed to delete tag "${tag}":`, await res.text());
          }
        }
      }
      
      // Add new tags
      for (const tag of newTags) {
        if (!currentTags.includes(tag)) {
          const res = await fetch(`/api/decks/${deckId}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagLabel: tag }),
          });
          if (!res.ok) {
            console.error(`Failed to add tag "${tag}":`, await res.text());
          }
        }
      }
      
      console.log(`✅ Tags updated for deck ${deckId}:`, newTags);
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
            body: JSON.stringify({ id: deckId }),
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

  async function duplicateDeck(deckId: string, deckName: string) {
    const { toast } = await import('@/lib/toast-client');
    
    try {
      toast('Duplicating deck...', 'info');
      
      // Fetch the original deck's cards
      const cardsRes = await fetch(`/api/decks/cards?deckId=${deckId}`);
      const cardsJson = await cardsRes.json();
      
      if (!cardsJson.ok || !cardsJson.cards) {
        toast('Failed to fetch deck cards', 'error');
        return;
      }
      
      // Create new deck
      const createRes = await fetch('/api/decks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${deckName} (Copy)` }),
      });
      
      const createJson = await createRes.json();
      
      if (!createJson.ok || !createJson.deckId) {
        toast('Failed to create duplicate deck', 'error');
        return;
      }
      
      // Add cards to new deck
      const newDeckId = createJson.deckId;
      const deckText = cardsJson.cards.map((c: any) => `${c.qty} ${c.name}`).join('\n');
      
      const saveRes = await fetch('/api/decks/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId: newDeckId, deckText }),
      });
      
      const saveJson = await saveRes.json();
      
      if (saveJson.ok) {
        toast('✅ Deck duplicated successfully!', 'success');
        capture('deck_duplicated', { original_id: deckId, new_id: newDeckId });
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast('Failed to save cards to duplicate deck', 'error');
      }
    } catch (e: any) {
      toast(e.message || 'Failed to duplicate deck', 'error');
    }
  }

  return (
    <div className="space-y-4">
      {/* Empty state guidance for users with few decks */}
      {rows.length > 0 && rows.length <= 2 && (
        <div className="text-center py-2 px-4 bg-blue-950/20 border border-blue-500/20 rounded-lg">
          <p className="text-xs text-blue-300">
            💡 <span className="font-medium">Tip:</span> Import from <span className="underline">Moxfield</span> or start fresh with AI assistance
          </p>
        </div>
      )}
      
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
          const isThisSwiped = swipedDeckId === r.id;
          
          const swipeHandlers = useSwipeable({
            onSwipedLeft: () => setSwipedDeckId(r.id),
            onSwipedRight: () => setSwipedDeckId(null),
            trackMouse: false, // Only track touch, not mouse
            preventScrollOnSwipe: true,
          });
        
        return (
          <div key={r.id} {...swipeHandlers} className="relative">
            <DeckArtLoader 
            deckId={r.id} 
            commander={r.commander || undefined} 
            title={r.title || undefined}
          >
            {(art, loading) => (
              <div className={`group rounded-xl border overflow-hidden bg-neutral-950 flex flex-col transition-all ${isPinned ? 'border-amber-500/30 bg-gradient-to-br from-amber-950/10 to-transparent' : 'border-neutral-800'} hover:border-neutral-600 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1`} style={{ transform: isThisSwiped ? 'translateX(-120px)' : 'translateX(0)' }}>
                {/* Cover - Clickable */}
                <Link 
                  href={`/my-decks/${r.id}`}
                  className="relative h-48 w-full overflow-hidden block cursor-pointer"
                  onClick={() => {
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
                    <img src={art} alt="cover" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  ) : loading ? (
                    <div className="w-full h-full bg-neutral-900 skeleton-shimmer" />
                  ) : (
                    // Empty state placeholder with gradient and icon
                    <div className="w-full h-full bg-gradient-to-br from-emerald-900/20 via-blue-900/20 to-purple-900/20 flex items-center justify-center relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
                      {/* Subtle pattern */}
                      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                      
                      {stats?.cardCount === 0 || stats?.cardCount === undefined ? (
                        // No cards: Show "New deck" state with better styling
                        <div className="text-center z-10 p-4">
                          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-emerald-600/20 border-2 border-dashed border-emerald-500/50 flex items-center justify-center">
                            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </div>
                          <div className="text-sm text-emerald-300 font-medium">New deck — start building</div>
                          <div className="text-xs text-neutral-400 mt-1">Add cards to see art</div>
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
                  {/* Title and Delete - Delete hover-only */}
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/my-decks/${r.id}`} className="font-semibold text-base truncate hover:underline flex-1" title={title}>{title}</Link>
                    <button 
                      onClick={(e) => { e.preventDefault(); deleteDeck(r.id, title); }} 
                      className="text-xs text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-70 hover:opacity-100 transition-opacity"
                      aria-label="Delete deck"
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
                  
                  {/* Tags - outline chips style */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(deckTags.get(r.id) || []).slice(0, 3).map((tag) => {
                        const def = getTagByLabel(tag);
                        const borderColor = def?.color?.replace('text-', 'border-') || 'border-neutral-600';
                        return (
                          <span
                            key={tag}
                            className={`px-3 py-1 rounded-full text-xs font-medium border ${borderColor} ${def?.color || 'text-neutral-300'} bg-transparent`}
                          >
                            {tag}
                          </span>
                        );
                      })}
                      {(deckTags.get(r.id) || []).length > 3 && (
                        <span className="text-xs text-neutral-500">+{(deckTags.get(r.id) || []).length - 3}</span>
                      )}
                    </div>
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
                  
                  {/* Main stats - improved chip distinction */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {/* Cards: Badge style */}
                    <span className="px-2.5 py-1.5 rounded-full bg-blue-600/20 border border-blue-600/30 text-blue-300 font-medium">
                      <span className="opacity-70">Cards:</span> <b className="font-mono ml-1">{stats?.cardCount || '—'}</b>
                    </span>
                    {/* Visibility: Pill style */}
                    <span className={`px-2.5 py-1.5 rounded-full ${r.is_public ? 'bg-emerald-600/20 border-emerald-600/30 text-emerald-300' : 'bg-neutral-700/20 border-neutral-700/30 text-neutral-400'}`}>
                      {r.is_public ? '🌐 Public' : '🔒 Private'}
                    </span>
                  </div>
                  
                  {/* Actions row - more spacing */}
                  <div className="flex items-center gap-3 mt-auto pt-3 pb-1 border-t border-neutral-800">
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
          
          {/* Swipe Action Buttons */}
          {isThisSwiped && (
            <div className="absolute right-0 top-0 h-full flex items-center gap-2 pr-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSwipedDeckId(null);
                  router.push(`/compare-decks?deck1=${r.id}`);
                }}
                className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition-colors"
                title="Compare"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSwipedDeckId(null);
                  duplicateDeck(r.id, title);
                }}
                className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition-colors"
                title="Duplicate"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSwipedDeckId(null);
                  deleteDeck(r.id, title);
                }}
                className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors"
                title="Delete"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
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