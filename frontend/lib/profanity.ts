
// lib/profanity.ts
// Lightweight profanity checker used on client and server.
// Word-boundary, case-insensitive, avoids false positives like "class".
const WORDS = [
  "cock","dickhead","bellend","shithead","motherfucker",
  "fuck","shit","bitch","cunt","twat","wanker","prick","dick","pussy",
  "nigger","faggot","slut","whore","bastard","asshole","douche","bollocks"
];

const rx = new RegExp(`\\b(${WORDS.map(w=>w.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')).join('|')})\\b`, 'i');

export function containsProfanity(input: string): boolean {
  if (!input) return false;
  return rx.test(input.toLowerCase());
}

export function sanitizeName(input: string, max = 120): string {
  const s = String(input || '').trim().slice(0, max);
  if (!s) return s;
  return s;
}
