/**
 * Server-safe helpers for blog content: replace **CardName** with placeholders
 * so the blog page can split content and inject BlogCardImage (client) segments.
 * No 'use client' — safe to call from server components during prerender.
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Placeholder used in blog content; split on this to inject BlogCardImage. */
export const CARD_PLACEHOLDER = '\u0000CARD:';

/**
 * Replace **CardName** with placeholder for names in cardNames set.
 * Call before other markdown so bold isn't consumed.
 */
export function injectCardPlaceholders(text: string, cardNames: string[]): string {
  let out = text;
  for (const name of cardNames) {
    const escaped = escapeRegex(name);
    const re = new RegExp(`\\*\\*${escaped}\\*\\*`, 'g');
    out = out.replace(re, `${CARD_PLACEHOLDER}${name}${CARD_PLACEHOLDER}`);
  }
  return out;
}

/**
 * Split content by CARD_PLACEHOLDER+name+CARD_PLACEHOLDER; returns segments.
 * Odd indices are card names, even are HTML/text.
 */
export function splitByCardPlaceholders(text: string): string[] {
  return text.split(/\u0000CARD:([^\u0000]+)\u0000/g);
}
