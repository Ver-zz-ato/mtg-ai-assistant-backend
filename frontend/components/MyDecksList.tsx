'use client';

import React from 'react';
import DeckArtLoader from './DeckArtLoader';
import LikeButton from './likes/LikeButton';

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

export default function MyDecksList({ rows, pinnedIds }: MyDecksListProps) {
  if (rows.length === 0) {
    return <div className="text-gray-400">No decks saved yet.</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {rows.map((r) => {
        const title = r.title ?? "Untitled Deck";
        
        return (
          <DeckArtLoader 
            key={r.id} 
            deckId={r.id} 
            commander={r.commander || undefined} 
            title={r.title || undefined}
            deckText={r.deck_text || undefined}
          >
            {(art, loading) => (
              <div className="relative border rounded overflow-hidden group bg-neutral-950 min-h-[96px]">
                {/* Banner background */}
                {art && (<div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${art})` }} />)}
                {!art && !loading && (<div className="absolute inset-0 bg-neutral-900" />)}
                {loading && (<div className="absolute inset-0 bg-neutral-900 skeleton-shimmer" />)}
                <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
                
                <div className="relative flex items-center justify-between">
                  <a href={`/my-decks?deckId=${encodeURIComponent(r.id)}`} className="flex-1 min-w-0 p-0 block" title="Quick view">
                    <div className="flex items-center gap-3 p-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {title}
                          {loading && (
                            <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                          )}
                        </div>
                        {/* timeline tiny at bottom */}
                        <div className="text-[10px] opacity-70 mt-1">
                          {r.updated_at ? `Updated ${new Date(r.updated_at).toLocaleDateString()}` : ''}
                          {r.created_at ? ` • Created ${new Date(r.created_at).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                    </div>
                  </a>
                  <div className="px-3 py-2 flex items-center gap-2">
                    <LikeButton deckId={r.id} />
                    {/* Pin button */}
                    {(()=>{ 
                      try {
                        const Pin = require('@/components/PinDeckButton').default; 
                        return (<Pin deckId={r.id} pinned={pinnedIds.includes(r.id)} currentPinned={pinnedIds} />); 
                      } catch {
                        return null;
                      }
                    })()}
                    <a href={`/my-decks/${encodeURIComponent(r.id)}`} className="text-xs px-2 py-1 rounded border border-neutral-700">Edit</a>
                    {(()=>{ 
                      try {
                        const Menu = require('@/components/DeckCardMenu').default; 
                        return (<Menu id={r.id} title={r.title} is_public={r.is_public} />); 
                      } catch {
                        return null;
                      }
                    })()}
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