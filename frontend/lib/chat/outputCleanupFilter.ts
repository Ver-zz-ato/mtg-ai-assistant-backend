/**
 * Output cleanup filter (Part 5). Strip meta phrases and ensure tone is confident,
 * concise, and human. Applied before returning analysis to the user.
 */

const META_PHRASES: RegExp[] = [
  /\bthis section\b/gi,
  /\bmust\b/gi,
  /\brequired\b/gi,
  /\bonly\s+(?:cards?\s+)?(?:already\s+)?(?:in\s+)?(?:the\s+)?list\b/gi,
  /\bif\s+needed\b/gi,
  /\bquality\s+gate\b/gi,
  /\bevidence\s+requirement\b/gi,
  /\b(?:must|should)\s+include\b/gi,
  /\b(?:must|should)\s+use\b/gi,
  /\bvalidation\s+(?:is\s+)?(?:happening|running)\b/gi,
  /\b(?:internal\s+)?rule[s]?\s+(?:exist|apply)\b/gi,
];

/**
 * Strip meta phrases that leak internal prompt mechanics. Does not change
 * card names or recommendation structure. Multiple passes to catch overlapping patterns.
 */
export function applyOutputCleanupFilter(text: string): string {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const re of META_PHRASES) {
    out = out.replace(re, (match) => {
      // Replace with nothing or a single space if between words
      return "";
    });
  }
  // Collapse multiple spaces/newlines introduced by removals
  out = out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return out;
}
