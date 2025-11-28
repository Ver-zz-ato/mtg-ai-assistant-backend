'use client';

import React, { useState, useEffect } from 'react';

interface DeckArtLoaderProps {
  deckId: string;
  commander?: string;
  title?: string;
  deckText?: string;
  children: (art?: string, loading?: boolean) => React.ReactNode;
}

function cleanName(s: string): string {
  return String(s || '')
    .replace(/\s*\(.*?\)\s*$/, '') // strip parentheticals
    .replace(/^SB:\s*/i, '')         // sideboard prefix common in exports
    .replace(/^[-•]\s*/, '')         // dash/bullet prefix
    .replace(/^"|"$/g, '')          // outer quotes
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNamesFromText(deckText: string): string[] {
  const out: string[] = [];
  const lines = String(deckText || '').split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
  const rxQtyPrefix = /^(\d+)\s*[xX]?\s+(.+)$/;           // "1 Sol Ring" or "2x Sol Ring"
  const rxCsv = /^(.+?),(?:\s*)"?\d+"?\s*$/;              // "Sol Ring,\"18\"" or "Sol Ring,18"
  const rxDash = /^[-•]\s*(.+)$/;                            // "- Sol Ring"
  
  for (const l of lines.slice(0, 20)) { // Increased from 10 to 20
    let name = '';
    let m = l.match(rxQtyPrefix);
    if (m) name = m[2]; else {
      m = l.match(rxCsv);
      if (m) name = m[1]; else {
        m = l.match(rxDash);
        if (m) name = m[1];
      }
    }
    if (!name) {
      if (/,/.test(l)) name = l.split(',')[0];
      else if (l && !/^\d+$/.test(l)) name = l; // Try the line as-is if not just a number
    }
    if (name) {
      const cleaned = cleanName(name);
      // Skip basic land names and common non-card patterns
      if (cleaned && cleaned.length > 1 && !['Commander', 'Sideboard', 'Deck', 'Maybeboard'].includes(cleaned)) {
        out.push(cleaned);
      }
    }
    if (out.length >= 15) break; // Increased cap
  }
  return out.filter(Boolean);
}

// Prioritize non-basic lands for better art
function prioritizeCards(names: string[]): string[] {
  const basicLands = new Set(['forest', 'island', 'plains', 'swamp', 'mountain']);
  const nonBasic = names.filter(n => !basicLands.has(n.toLowerCase()));
  const basic = names.filter(n => basicLands.has(n.toLowerCase()));
  return [...nonBasic, ...basic]; // Non-basics first
}

export default function DeckArtLoader({ deckId, commander, title, deckText, children }: DeckArtLoaderProps) {
  const [art, setArt] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    async function tryGetImage(names: string[], priorityNames?: string[]): Promise<string | null> {
      if (names.length === 0 || cancelled) return null;
      
      try {
        console.log(`[DeckArtLoader] Calling batch-images with ${names.length} names:`, names.slice(0, 5));
        const response = await fetch('/api/cards/batch-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names }),
          signal: abortController.signal
        });

        console.log(`[DeckArtLoader] batch-images response status: ${response.status}`);
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          console.warn(`[DeckArtLoader] batch-images failed with status ${response.status}:`, errorText);
          return null;
        }

        const data = await response.json();
        console.log(`[DeckArtLoader] batch-images response:`, {
          hasData: !!data?.data,
          dataLength: Array.isArray(data?.data) ? data.data.length : 0,
          sampleCard: Array.isArray(data?.data) && data.data.length > 0 ? {
            name: data.data[0].name,
            hasImageUris: !!data.data[0].image_uris,
            hasCardFaces: !!data.data[0].card_faces,
          } : null,
        });
        
        if (Array.isArray(data?.data) && data.data.length > 0) {
          // Normalize names for comparison
          const normalizeForMatch = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
          const prioritySet = priorityNames ? new Set(priorityNames.map(normalizeForMatch)) : new Set();
          
          // First, try to find a card that matches a priority name (e.g., commander)
          if (prioritySet.size > 0) {
            for (const card of data.data) {
              const cardNameNormalized = normalizeForMatch(card.name);
              if (prioritySet.has(cardNameNormalized)) {
                const images = card.image_uris || card.card_faces?.[0]?.image_uris || {};
                const img = images.art_crop || images.normal || images.small;
                if (img) {
                  console.log(`[DeckArtLoader] Found priority image for card "${card.name}":`, img.substring(0, 50) + '...');
                  return img;
                }
              }
            }
          }
          
          // Fallback: Find first card with any image
          for (const card of data.data) {
            const images = card.image_uris || card.card_faces?.[0]?.image_uris || {};
            const img = images.art_crop || images.normal || images.small;
            if (img) {
              console.log(`[DeckArtLoader] Found image for card "${card.name}":`, img.substring(0, 50) + '...');
              return img;
            }
          }
          console.warn(`[DeckArtLoader] batch-images returned ${data.data.length} cards but none had images`);
        } else {
          console.warn(`[DeckArtLoader] batch-images returned no cards`);
        }
      } catch (err) {
        // Suppress AbortError spam in console
        if (err instanceof Error && err.name !== 'AbortError') {
          console.warn('[DeckArtLoader] batch-images failed:', err);
        }
      }
      return null;
    }

    async function tryFuzzyMatch(names: string[]): Promise<Map<string, string>> {
      const map = new Map<string, string>();
      if (names.length === 0 || cancelled) return map;
      
      try {
        const response = await fetch('/api/cards/fuzzy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: names.slice(0, 20) }),
          signal: abortController.signal
        });

        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.results) {
            Object.entries(data.results).forEach(([original, result]: [string, any]) => {
              if (result?.suggestion) {
                map.set(original, result.suggestion);
              }
            });
          }
        }
      } catch (err) {
        // Suppress AbortError spam in console
        if (err instanceof Error && err.name !== 'AbortError') {
          console.warn('[DeckArtLoader] fuzzy match failed:', err);
        }
      }
      return map;
    }

    async function loadArt() {
      try {
        setLoading(true);
        setError(false);
        
        console.log(`[DeckArtLoader] Starting art load for deck ${deckId}`, {
          commander,
          title,
          hasDeckText: !!deckText,
          deckTextLength: deckText?.length || 0,
        });

        // STEP 1: Build candidate list from all sources
        const candidates: string[] = [];
        const priorityCandidates: string[] = []; // Commander and title (highest priority)
        
        // Add commander (highest priority)
        if (commander) {
          const cleaned = cleanName(commander);
          if (cleaned) {
            candidates.push(cleaned);
            priorityCandidates.push(cleaned); // Track as priority
            console.log(`[DeckArtLoader] Added commander candidate: ${cleaned}`);
          }
        }
        
        // Try parsing title for card name
        if (title) {
          const cleaned = cleanName(title);
          // Only add if it looks like a card name (not just "MODERN Green/Black")
          if (cleaned && !cleaned.match(/^(MODERN|COMMANDER|LEGACY|VINTAGE|STANDARD|PIONEER)/i)) {
            candidates.push(cleaned);
            priorityCandidates.push(cleaned); // Track as priority
            console.log(`[DeckArtLoader] Added title candidate: ${cleaned}`);
          }
        }
        
        // Extract from deck text
        if (deckText) {
          const extracted = extractNamesFromText(deckText);
          extracted.forEach(n => candidates.push(n));
          console.log(`[DeckArtLoader] Extracted ${extracted.length} names from deckText`);
        }

        // STEP 2: Always try deck_cards table if we have deckId (not just when candidates < 5)
        // This ensures we get cards for public decks even if commander/title aren't available
        if (deckId && !cancelled) {
          try {
            console.log(`[DeckArtLoader] Fetching deck_cards for deck ${deckId}...`);
            const deckCardsResponse = await fetch(`/api/decks/cards?deckId=${deckId}`, {
              signal: abortController.signal
            });
            console.log(`[DeckArtLoader] deck_cards response status: ${deckCardsResponse.status}`);
            
            if (deckCardsResponse.ok) {
              const deckCardsData = await deckCardsResponse.json();
              console.log(`[DeckArtLoader] deck_cards response for deck ${deckId}:`, {
                ok: deckCardsData?.ok,
                cardCount: deckCardsData?.cards?.length || 0,
                sampleCards: deckCardsData?.cards?.slice(0, 5).map((c: any) => ({ name: c.name, qty: c.qty })),
              });
              
              if (Array.isArray(deckCardsData?.cards) && deckCardsData.cards.length > 0) {
                // Get all non-basic land cards first, sorted by quantity
                const nonBasicLands = new Set(['forest', 'island', 'plains', 'swamp', 'mountain']);
                const sorted = deckCardsData.cards
                  .filter((c: any) => c.name && !nonBasicLands.has(c.name.toLowerCase()))
                  .sort((a: any, b: any) => (b.qty || 0) - (a.qty || 0))
                  .slice(0, 20);
                
                console.log(`[DeckArtLoader] Filtered to ${sorted.length} non-basic land cards`);
                
                sorted.forEach((c: any) => {
                  if (c.name) candidates.push(cleanName(c.name));
                });
              } else {
                console.warn(`[DeckArtLoader] No cards found in deck_cards for deck ${deckId}`);
              }
            } else {
              const errorText = await deckCardsResponse.text().catch(() => '');
              console.warn(`[DeckArtLoader] Failed to fetch deck_cards for deck ${deckId}: ${deckCardsResponse.status}`, errorText);
            }
          } catch (err) {
            // Suppress AbortError spam in console
            if (err instanceof Error && err.name !== 'AbortError') {
              console.warn('[DeckArtLoader] deck_cards fetch failed:', err);
            }
          }
        }

        if (cancelled) return;

        // STEP 3: Prioritize and deduplicate
        const uniqueCandidates = Array.from(new Set(candidates));
        const prioritized = prioritizeCards(uniqueCandidates).slice(0, 25);

        console.log(`[DeckArtLoader] Final candidates for deck ${deckId}:`, {
          total: uniqueCandidates.length,
          prioritized: prioritized.length,
          top10: prioritized.slice(0, 10),
          allCandidates: uniqueCandidates,
        });

        if (prioritized.length === 0) {
          console.warn(`[DeckArtLoader] No candidates found for deck ${deckId}`);
          setLoading(false);
          return;
        }

        // STEP 4: Try batch-images with original names, prioritizing commander/title
        console.log(`[DeckArtLoader] Trying batch-images with ${prioritized.length} candidates...`);
        let img = await tryGetImage(prioritized, priorityCandidates);
        console.log(`[DeckArtLoader] batch-images result:`, img ? 'SUCCESS' : 'FAILED');
        
        if (img && !cancelled) {
          setArt(img);
          setLoading(false);
          return;
        }

        if (cancelled) return;

        // STEP 5: Try fuzzy matching for misspelled cards
        const fuzzyMap = await tryFuzzyMatch(prioritized);
        const correctedNames = prioritized.map(name => fuzzyMap.get(name) || name);
        const correctedPriorityNames = priorityCandidates.map(name => fuzzyMap.get(name) || name);
        
        if (correctedNames.length > 0) {
          img = await tryGetImage(correctedNames, correctedPriorityNames);
          
          if (img && !cancelled) {
            setArt(img);
            setLoading(false);
            return;
          }
        }

        if (cancelled) return;

        // STEP 6: Ultimate fallback - try basic lands
        const basicLands = ['Forest', 'Island', 'Plains', 'Swamp', 'Mountain'];
        img = await tryGetImage(basicLands);
        
        if (img && !cancelled) {
          setArt(img);
        }

        if (!cancelled) {
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[DeckArtLoader] Fatal error:', err);
          setError(true);
          setLoading(false);
        }
      }
    }

    loadArt();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [deckId, commander, title, deckText]);

  return <>{children(art, loading)}</>;
}