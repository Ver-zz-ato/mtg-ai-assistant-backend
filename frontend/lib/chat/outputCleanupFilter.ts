/**
 * Output cleanup filter (Part 5). Strip meta phrases and ensure tone is confident,
 * concise, and human. Applied before returning analysis to the user.
 */

/**
 * Strip synergy chain blocks that are truncated or malformed (e.g. end with "[\n
 * or have only one arrow). Valid chain has at least two "→" with content between.
 * Does not trigger regen; missing chain is acceptable.
 */
export function stripIncompleteSynergyChains(text: string): string {
  if (!text || typeof text !== "string") return text;
  const lines = text.split("\n");
  const drop = new Set<number>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const isChainStart =
      /^[•\-*]?\s*Chain\s+[AB]\s*\(/i.test(trimmed) ||
      /^[•\-*]?\s*Synergy:\s*$/i.test(trimmed) ||
      (trimmed.startsWith("Synergy:") && trimmed.length < 50);
    if (isChainStart) {
      const blockStart = i;
      let blockEnd = i + 1;
      while (
        blockEnd < lines.length &&
        !/^Step\s+\d/i.test(lines[blockEnd].trim()) &&
        !/^[•\-*]?\s*Chain\s+[AB]\s*\(/i.test(lines[blockEnd].trim())
      ) {
        blockEnd++;
      }
      const block = lines.slice(blockStart, blockEnd).join("\n");
      const hasFullChain = /→[^→]*→/.test(block);
      const hasRequiredPhrase = /together\s+produce|advances\s+win/i.test(block);
      const endsTruncated =
        block.trimEnd().endsWith('"[') ||
        block.trimEnd().endsWith('"\n') ||
        /\n\s*"\[\s*$/.test(block);
      const invalidShape = block.includes("→") && (!hasFullChain || !hasRequiredPhrase);
      if (!hasFullChain || endsTruncated || invalidShape) {
        for (let j = blockStart; j < blockEnd; j++) drop.add(j);
      }
      i = blockEnd;
    } else {
      i++;
    }
  }
  const out = lines.filter((_, idx) => !drop.has(idx)).join("\n");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Strip incomplete truncation at end of response (e.g. Step 6 ending mid-sentence).
 * If the last line has no sentence-ending punctuation and looks incomplete, remove it or the last Step block.
 */
export function stripIncompleteTruncation(text: string): string {
  if (!text || typeof text !== "string") return text;
  const trimmed = text.trimEnd();
  if (!trimmed) return text;
  const lines = trimmed.split("\n");
  const lastLine = lines[lines.length - 1]?.trim() ?? "";
  const endsWithPunctuation = /[.!?]\s*$/.test(lastLine);
  const isShortListItem = /^\d+\s+\w+$/.test(lastLine) || lastLine.length < 25;
  if (endsWithPunctuation || isShortListItem) return text;
  const lastLineIncomplete = lastLine.length > 0 && !endsWithPunctuation;
  if (lastLineIncomplete) {
    let dropFrom = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (i < lines.length - 1 && /^Step\s+\d/i.test(lines[i]?.trim() ?? "")) {
        dropFrom = i;
        break;
      }
    }
    if (dropFrom >= 0) {
      const out = lines.slice(0, dropFrom).join("\n").replace(/\n{3,}/g, "\n\n").trim();
      return out || trimmed;
    }
    return lines.slice(0, -1).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  return text;
}

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

/** Bullet chars: U+2022 bullet, U+00B7 middle dot, hyphen, asterisk. */
const BULLET = "[•\u2022\u00B7\\-*]";

/** De-worksheet: structural replacements so output reads like natural prose (no change to ADD/CUT or [[...]]). */
const DE_WORKSHEET: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: new RegExp(`(?:^|\\n)\\s*${BULLET}\\s*Problem\\s+ID\\s+\\(P([123])\\)\\s*:?\\s*`, "gim"), replacement: "\n• Problem (P$1): " },
  { pattern: /\bProblem\s+ID\s+\(P([123])\)\s*:?\s*/gi, replacement: "Problem (P$1): " },
  { pattern: new RegExp(`(?:^|\\n)\\s*${BULLET}\\s*What\\s+breaks\\s*:?\\s*`, "gim"), replacement: "\n" },
  { pattern: /^[•\-*]?\s*What\s+breaks\s*:?\s*/gim, replacement: "" },
  { pattern: new RegExp(`\\s*${BULLET}?\\s*Evidence\\s+\\(2–5\\s+cards?\\s+from\\s+list\\)\\s*:?\\s*`, "gi"), replacement: " Evidence: " },
  { pattern: new RegExp(`\\s*${BULLET}?\\s*Evidence\\s+\\(2–4\\)\\s*:?\\s*`, "gi"), replacement: " Evidence: " },
  { pattern: /\bEvidence\s+\(2–5\s+cards?\s+from\s+list\)\s*:?\s*/gi, replacement: "Evidence: " },
  { pattern: /\bEvidence\s+\(2–4\)\s*:?\s*/gi, replacement: "Evidence: " },
];

/**
 * Strip meta phrases that leak internal prompt mechanics. Does not change
 * card names or recommendation structure. Multiple passes to catch overlapping patterns.
 */
export function applyOutputCleanupFilter(text: string): string {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const re of META_PHRASES) {
    out = out.replace(re, () => "");
  }
  for (const { pattern, replacement } of DE_WORKSHEET) {
    out = out.replace(pattern, replacement);
  }
  // Collapse multiple spaces/newlines introduced by removals
  out = out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return out;
}

/**
 * Optional bracket enforcement: wrap bare card names on ADD/CUT lines in [[...]].
 * Only touches lines that look like "ADD X / CUT Y" and don't already contain [[.
 */
export function applyBracketEnforcement(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text.replace(
    /ADD\s+([^/\n\[\]]+?)\s*\/\s*CUT\s+([^\n\[\]]+?)(?=\s*$|\s*\n|$)/gm,
    (_, add: string, cut: string) => `ADD [[${add.trim()}]] / CUT [[${cut.trim()}]]`
  );
}
