
// lib/profanity.ts
// Lightweight profanity checker used on client and server.
// Word-boundary, case-insensitive, avoids false positives like "class".
// Also matches simple inflections (s/es/ed/ing) for each base term.
const WORDS = [
  "cock","dickhead","bellend","shithead","motherfucker",
  "fuck","shit","bitch","cunt","twat","wanker","prick","dick","pussy",
  "nigger","faggot","slut","whore","bastard","asshole","douche","bollocks",
  "retard","foxtard","fag"
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
const compactWords = WORDS.map((word) => word.replace(/[^a-z0-9]/gi, "").toLowerCase());

function normalizeLoose(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[@4]/g, "a")
    .replace(/[013]/g, (m) => (m === "0" ? "o" : m === "3" ? "e" : "i"))
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/[^a-z0-9]+/g, "");
}

export function containsProfanity(input: string): boolean {
  if (!input) return false;
  const raw = String(input);
  if (rx.test(raw)) return true;
  const compact = normalizeLoose(raw);
  return compactWords.some((word) => compact.includes(word));
}

export function sanitizeName(input: string, max = 120): string {
  const s = String(input || '').trim().slice(0, max);
  if (!s) return s;
  return s;
}

const PUBLIC_TEXT_ERROR =
  "Please remove offensive language before making this public.";

/**
 * Use when saving or publishing user-authored text (deck title, profile name, etc.).
 * Card names and private-only fields can skip this.
 */
export function validatePublicText(
  input: string,
  fieldLabel: string
): { ok: true } | { ok: false; message: string } {
  void fieldLabel;
  const s = String(input || "").trim();
  if (!s) return { ok: true };
  if (containsProfanity(s)) {
    return { ok: false, message: PUBLIC_TEXT_ERROR };
  }
  return { ok: true };
}
