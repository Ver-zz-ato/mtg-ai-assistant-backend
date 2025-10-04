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
  
  for (const l of lines.slice(0, 10)) { // Limit to first 10 lines for performance
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
    }
    if (name) out.push(cleanName(name));
    if (out.length >= 5) break; // Cap to avoid over-fetch
  }
  return out.filter(Boolean);
}

export default function DeckArtLoader({ deckId, commander, title, deckText, children }: DeckArtLoaderProps) {
  const [art, setArt] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadArt() {
      try {
        setLoading(true);
        setError(false);

        // Build candidate list
        const candidates: string[] = [];
        if (commander) candidates.push(cleanName(commander));
        if (title) candidates.push(cleanName(title));
        
        // Get some cards from deck text
        if (deckText) {
          extractNamesFromText(deckText).forEach(n => candidates.push(n));
        }

        // Also try to get top cards from deck
        try {
          const deckCardsResponse = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, {
            cache: 'no-store'
          });
          if (deckCardsResponse.ok) {
            const data = await deckCardsResponse.json();
            const cards = Array.isArray(data?.cards) ? data.cards : [];
            // Add top 3 cards by quantity
            cards
              .sort((a: any, b: any) => (b.qty || 0) - (a.qty || 0))
              .slice(0, 3)
              .forEach((card: any) => candidates.push(cleanName(card.name)));
          }
        } catch {
          // Ignore deck cards if API fails
        }

        if (cancelled) return;

        // Remove duplicates and limit
        const uniqueCandidates = Array.from(new Set(candidates)).slice(0, 8);
        
        if (uniqueCandidates.length === 0) {
          setLoading(false);
          return;
        }

        // Try to get images for candidates
        const imageResponse = await fetch('/api/cards/batch-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: uniqueCandidates })
        });

        if (cancelled) return;

        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          if (Array.isArray(imageData?.data)) {
            // Find first card with art
            for (const card of imageData.data) {
              const images = card.image_uris || card.card_faces?.[0]?.image_uris || {};
              if (images.art_crop || images.normal || images.small) {
                if (!cancelled) {
                  setArt(images.art_crop || images.normal || images.small);
                }
                break;
              }
            }
          }
        }

        if (!cancelled) {
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to load deck art:', err);
          setError(true);
          setLoading(false);
        }
      }
    }

    // Debounce the load to avoid too many simultaneous requests
    const timeout = setTimeout(loadArt, Math.random() * 1000 + 500); // 500-1500ms delay

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [deckId, commander, title, deckText]);

  return <>{children(art, loading)}</>;
}