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

    async function tryGetImage(names: string[]): Promise<string | null> {
      if (names.length === 0) return null;
      
      try {
        const response = await fetch('/api/cards/batch-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names })
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (Array.isArray(data?.data) && data.data.length > 0) {
          // Find first card with any image
          for (const card of data.data) {
            const images = card.image_uris || card.card_faces?.[0]?.image_uris || {};
            const img = images.art_crop || images.normal || images.small;
            if (img) return img;
          }
        }
      } catch (err) {
        console.warn('[DeckArtLoader] batch-images failed:', err);
      }
      return null;
    }

    async function tryFuzzyMatch(names: string[]): Promise<Map<string, string>> {
      const map = new Map<string, string>();
      if (names.length === 0) return map;
      
      try {
        const response = await fetch('/api/cards/fuzzy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: names.slice(0, 20) })
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
        console.warn('[DeckArtLoader] fuzzy match failed:', err);
      }
      return map;
    }

    async function loadArt() {
      try {
        setLoading(true);
        setError(false);
        console.log('[DeckArtLoader] Starting for deck:', deckId);

        // STEP 1: Build candidate list from all sources
        const candidates: string[] = [];
        
        // Add commander (highest priority)
        if (commander) {
          const cleaned = cleanName(commander);
          if (cleaned) candidates.push(cleaned);
          console.log('[DeckArtLoader] Commander:', cleaned);
        }
        
        // Try parsing title for card name
        if (title) {
          const cleaned = cleanName(title);
          // Only add if it looks like a card name (not just "MODERN Green/Black")
          if (cleaned && !cleaned.match(/^(MODERN|COMMANDER|LEGACY|VINTAGE|STANDARD|PIONEER)/i)) {
            candidates.push(cleaned);
            console.log('[DeckArtLoader] Title:', cleaned);
          }
        }
        
        // Extract from deck text
        if (deckText) {
          const extracted = extractNamesFromText(deckText);
          extracted.forEach(n => candidates.push(n));
          console.log('[DeckArtLoader] Extracted from text:', extracted.length);
        }

        // STEP 2: Try deck_cards table as fallback
        if (candidates.length < 5 && deckId) {
          try {
            const deckCardsResponse = await fetch(`/api/decks/cards?deckId=${deckId}`);
            if (deckCardsResponse.ok) {
              const deckCardsData = await deckCardsResponse.json();
              if (Array.isArray(deckCardsData?.cards) && deckCardsData.cards.length > 0) {
                // Get all non-basic land cards first, sorted by quantity
                const nonBasicLands = new Set(['forest', 'island', 'plains', 'swamp', 'mountain']);
                const sorted = deckCardsData.cards
                  .filter((c: any) => c.name && !nonBasicLands.has(c.name.toLowerCase()))
                  .sort((a: any, b: any) => (b.qty || 0) - (a.qty || 0))
                  .slice(0, 20);
                
                sorted.forEach((c: any) => {
                  if (c.name) candidates.push(cleanName(c.name));
                });
                console.log('[DeckArtLoader] From deck_cards:', sorted.length);
              }
            }
          } catch (err) {
            console.warn('[DeckArtLoader] deck_cards fetch failed:', err);
          }
        }

        if (cancelled) return;

        // STEP 3: Prioritize and deduplicate
        const uniqueCandidates = Array.from(new Set(candidates));
        const prioritized = prioritizeCards(uniqueCandidates).slice(0, 25);
        
        console.log('[DeckArtLoader] Total candidates:', prioritized.length, prioritized.slice(0, 5));

        if (prioritized.length === 0) {
          console.log('[DeckArtLoader] No candidates found');
          setLoading(false);
          return;
        }

        // STEP 4: Try batch-images with original names
        console.log('[DeckArtLoader] Trying batch-images...');
        let img = await tryGetImage(prioritized);
        
        if (img && !cancelled) {
          console.log('[DeckArtLoader] ✓ Found image from batch-images');
          setArt(img);
          setLoading(false);
          return;
        }

        if (cancelled) return;

        // STEP 5: Try fuzzy matching for misspelled cards
        console.log('[DeckArtLoader] Trying fuzzy match...');
        const fuzzyMap = await tryFuzzyMatch(prioritized);
        const correctedNames = prioritized.map(name => fuzzyMap.get(name) || name);
        
        if (correctedNames.length > 0) {
          img = await tryGetImage(correctedNames);
          
          if (img && !cancelled) {
            console.log('[DeckArtLoader] ✓ Found image from fuzzy match');
            setArt(img);
            setLoading(false);
            return;
          }
        }

        if (cancelled) return;

        // STEP 6: Ultimate fallback - try basic lands
        console.log('[DeckArtLoader] Trying basic lands fallback...');
        const basicLands = ['Forest', 'Island', 'Plains', 'Swamp', 'Mountain'];
        img = await tryGetImage(basicLands);
        
        if (img && !cancelled) {
          console.log('[DeckArtLoader] ✓ Using basic land fallback');
          setArt(img);
        } else {
          console.log('[DeckArtLoader] ✗ All fallbacks exhausted');
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
    };
  }, [deckId, commander, title, deckText]);

  return <>{children(art, loading)}</>;
}