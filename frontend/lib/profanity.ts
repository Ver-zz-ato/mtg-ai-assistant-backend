
// lib/profanity.ts
// Lightweight profanity checker used on client and server.
// Word-boundary, case-insensitive, avoids false positives like "class".
// Also matches simple inflections (s/es/ed/ing) for each base term.
const WORDS = [
  "cock","dickhead","bellend","shithead","motherfucker",
  "fuck","shit","bitch","cunt","twat","wanker","prick","dick","pussy",
  "nigger","faggot","slut","whore","bastard","asshole","douche","bollocks"
];

function escapeRe(s: string) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function patternFor(word: string) {
  // Add very basic English inflections: s, es, ed, ing
  const needsEs = /(?:s|sh|ch|x|z)$/i.test(word);
  const suffix = needsEs ? "(?:es|s|ed|ing)?" : "(?:s|ed|ing)?";
  return `${escapeRe(word)}${suffix}`;
}

const rx = new RegExp(`\\b(${WORDS.map(patternFor).join('|')})\\b`, 'i');

export function containsProfanity(input: string): boolean {
  if (!input) return false;
  return rx.test(String(input));
}

export function sanitizeName(input: string, max = 120): string {
  const s = String(input || '').trim().slice(0, max);
  if (!s) return s;
  return s;
}
