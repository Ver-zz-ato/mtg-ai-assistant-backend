'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { usePriceTrends, getTrendDisplay, formatTrendPct } from '@/hooks/usePriceTrends';
import { normalizeScryfallCacheName } from '@/lib/server/scryfallCacheRow';
import { totalMaybeFlexQty } from '@/lib/deck/maybeFlexCards';

type Card = {
  name: string;
  qty: number;
};

type CardImageMap = Record<string, { small?: string; normal?: string }>;

/** Keys must match getImagesForNames / CardsPane (NFKD-normalized). */
function resolveCardImageUrls(name: string, imgMap: CardImageMap): { small?: string; normal?: string } {
  const norm = (s: string) => normalizeScryfallCacheName(s);
  let key = norm(name);
  let small = imgMap[key]?.small;
  let normal = imgMap[key]?.normal;

  if (!small && name.includes('//')) {
    const frontFace = norm(name.split('//')[0].trim());
    small = imgMap[frontFace]?.small;
    normal = imgMap[frontFace]?.normal;
    if (!small) {
      const imgKeys = Object.keys(imgMap).filter((k) => {
        if (!k.includes('//') || !k.startsWith(frontFace + ' //')) return false;
        const parts = k.split('//').map((p: string) => p.trim());
        return parts[0] !== parts[1];
      });
      if (imgKeys.length > 0) {
        small = imgMap[imgKeys[0]]?.small;
        normal = imgMap[imgKeys[0]]?.normal;
      }
    }
  }
  return { small, normal };
}

interface PublicDeckCardListProps {
  cards: Card[];
  /** Read-only maybe/flex (public view); omitted or empty = no section. */
  maybeFlexCards?: Card[];
  priceMap?: Map<string, number>;
  showTrends?: boolean;
  currency?: 'USD' | 'EUR' | 'GBP';
}

export default function PublicDeckCardList({ 
  cards, 
  maybeFlexCards,
  priceMap = new Map(), 
  showTrends = true,
  currency = 'USD' 
}: PublicDeckCardListProps) {
  const [imgMap, setImgMap] = useState<CardImageMap>({});
  const [pv, setPv] = useState<{
    previewCardName: string | null;
    x: number;
    y: number;
    shown: boolean;
    below: boolean;
  }>({
    previewCardName: null,
    x: 0,
    y: 0,
    shown: false,
    below: false,
  });

  const previewSrc = useMemo(() => {
    if (!pv.previewCardName || !pv.shown) return '';
    const { small, normal } = resolveCardImageUrls(pv.previewCardName, imgMap);
    return normal || small || '';
  }, [pv.previewCardName, pv.shown, imgMap]);
  
  const flexList = maybeFlexCards && maybeFlexCards.length > 0 ? maybeFlexCards : null;

  // Get card names for trend fetching (main deck only)
  const cardNames = useMemo(() => cards.map(c => c.name), [cards]);
  
  // Fetch price trends for cards that have prices
  const { trends } = usePriceTrends(cardNames, { 
    currency, 
    enabled: showTrends && cards.length > 0 
  });

  const imageNameKeys = useMemo(() => {
    const s = new Set<string>();
    for (const c of cards) s.add(c.name);
    if (flexList) for (const c of flexList) s.add(c.name);
    return Array.from(s).slice(0, 300);
  }, [cards, flexList]);

  // Load card images
  useEffect(() => {
    (async () => {
      try {
        const names = imageNameKeys;
        if (!names.length) { setImgMap({}); return; }
        const { getImagesForNames } = await import("@/lib/scryfall");
        const m = await getImagesForNames(names);
        const obj: CardImageMap = {}; 
        m.forEach((v: any, k: string) => { 
          obj[k] = { small: v.small, normal: v.normal }; 
        });
        setImgMap(obj);
      } catch { 
        setImgMap({}); 
      }
    })();
  }, [imageNameKeys.join('|')]);

  const calcPos = (e: MouseEvent | any) => {
    try {
      const vw = window.innerWidth; 
      const vh = window.innerHeight;
      const margin = 12; 
      const boxW = 320; 
      const boxH = 460;
      const half = boxW / 2;
      const rawX = e.clientX as number;
      const rawY = e.clientY as number;
      const below = rawY - boxH - margin < 0;
      const x = Math.min(vw - margin - half, Math.max(margin + half, rawX));
      const y = below ? Math.min(vh - margin, rawY + margin) : Math.max(margin + 1, rawY - margin);
      return { x, y, below };
    } catch {
      return { x: (e as any).clientX || 0, y: (e as any).clientY || 0, below: false };
    }
  };

  if (cards.length === 0) {
    return <div className="text-sm text-neutral-400 text-center py-8">No cards yet.</div>;
  }

  return (
    <>
      <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        <ul className="space-y-2">
          {cards.map((c, idx) => {
            const nk = normalizeScryfallCacheName(String(c.name));
            const unitPrice = priceMap.get(nk) ?? priceMap.get(String(c.name).toLowerCase());
            const totalValue = typeof unitPrice === 'number' && unitPrice > 0 
              ? unitPrice * c.qty 
              : null;
            const valueDisplay = totalValue !== null ? `$${totalValue.toFixed(2)}` : '';
            
            const { small: src } = resolveCardImageUrls(c.name, imgMap);
            
            return (
              <li 
                key={`${idx}-${c.name}`} 
                className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-800/40 hover:bg-neutral-800/70 transition-colors border border-neutral-700/50 hover:border-neutral-600/70 group"
              >
                <span className="w-10 text-center tabular-nums font-semibold text-emerald-400 bg-neutral-900/50 px-2 py-1 rounded">
                  {c.qty}×
                </span>
                
                {/* Card image thumbnail with hover */}
                {src && (
                  <img 
                    src={src} 
                    alt={c.name} 
                    loading="lazy" 
                    decoding="async" 
                    className="w-[24px] h-[34px] object-cover rounded cursor-pointer"
                    onMouseEnter={(e) => { 
                      const { x, y, below } = calcPos(e as any); 
                      setPv({ previewCardName: c.name, x, y, shown: true, below }); 
                    }}
                    onMouseMove={(e) => { 
                      const { x, y, below } = calcPos(e as any); 
                      setPv(p => p.shown ? { ...p, x, y, below } : p); 
                    }}
                    onMouseLeave={() => setPv((p) => ({ ...p, shown: false, previewCardName: null }))}
                  />
                )}
                
                <span className="flex-1 font-medium text-neutral-100">{c.name}</span>
                
                {/* Price with trend glyph */}
                {valueDisplay && (
                  <span className="inline-flex items-center gap-1.5">
                    {/* Trend glyph */}
                    {showTrends && trends[c.name] && trends[c.name].direction !== 'flat' && (() => {
                      const { glyph, color, label } = getTrendDisplay(trends[c.name].direction);
                      const pctLabel = formatTrendPct(trends[c.name].pctChange);
                      return (
                        <span 
                          className={`text-xs font-bold ${color}`} 
                          title={`${label} ${pctLabel} (7d)`}
                        >
                          {glyph}
                        </span>
                      );
                    })()}
                    <span className="text-xs font-mono text-green-400 bg-green-950/40 px-2 py-1 rounded border border-green-900/50" title={typeof unitPrice === 'number' && unitPrice > 0 ? `$${unitPrice.toFixed(2)} each × ${c.qty}` : ''}>
                      {valueDisplay}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {flexList ? (
        <div className="mt-6 pt-4 border-t border-neutral-700/80">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-neutral-300">Maybe / Flex cards</h3>
            <span className="text-xs text-neutral-500 tabular-nums">
              Maybe / Flex: {totalMaybeFlexQty(flexList)} cards
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 mb-2 leading-relaxed">
            Optional cards not counted as part of the main deck.
          </p>
          <ul className="space-y-2">
            {flexList.map((c, idx) => {
              const { small: src } = resolveCardImageUrls(c.name, imgMap);
              return (
                <li
                  key={`flex-${idx}-${c.name}`}
                  className="flex items-center gap-3 p-2 rounded-lg bg-neutral-800/25 border border-neutral-800/60 text-sm text-neutral-200"
                >
                  <span className="w-10 text-center tabular-nums font-semibold text-violet-300/90 bg-neutral-900/50 px-2 py-1 rounded shrink-0">
                    {c.qty}×
                  </span>
                  {src ? (
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-[24px] h-[34px] object-cover rounded shrink-0"
                      onMouseEnter={(e) => {
                        const { x, y, below } = calcPos(e as any);
                        setPv({ previewCardName: c.name, x, y, shown: true, below });
                      }}
                      onMouseMove={(e) => {
                        const { x, y, below } = calcPos(e as any);
                        setPv((p) => (p.shown ? { ...p, x, y, below } : p));
                      }}
                      onMouseLeave={() => setPv((p) => ({ ...p, shown: false, previewCardName: null }))}
                    />
                  ) : null}
                  <span className="flex-1 min-w-0 truncate">{c.name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      
      {/* Global hover preview for card images */}
      {pv.shown && previewSrc && typeof window !== 'undefined' && (
        <div 
          className="fixed z-[9999] pointer-events-none" 
          style={{ 
            left: pv.x, 
            top: pv.y, 
            transform: `translate(-50%, ${pv.below ? '0%' : '-100%'})` 
          }}
        >
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80 transition-opacity duration-150 ease-out opacity-100" style={{ minWidth: '18rem' }}>
            <img 
              src={previewSrc} 
              alt={pv.previewCardName ?? 'preview'} 
              className="block w-full h-auto max-h-[70vh] max-w-none object-contain rounded" 
            />
          </div>
        </div>
      )}
    </>
  );
}

