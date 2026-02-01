/**
 * Optional human-feel sanity check (Part 7). Non-blocking: does NOT change content,
 * only flags issues internally for logging/debugging. Use for quality assessment.
 */

export type HumanSanityFlags = {
  /** Phrases that sound instructional or meta. */
  instructionalPhrases: string[];
  /** Phrases that sound cautious rather than confident. */
  cautiousPhrases: string[];
  /** Whether the text reads more like a human deck doctor. */
  feelsHuman: boolean;
  /** Whether a non-technical MTG player would understand it. */
  accessible: boolean;
};

const INSTRUCTIONAL_PATTERNS = [
  /\byou\s+must\b/i,
  /\byou\s+should\s+consider\b/i,
  /\bit\s+is\s+recommended\s+that\b/i,
  /\baccording\s+to\s+(?:the\s+)?(?:rules|requirements)\b/i,
  /\bthis\s+section\s+(?:must|should)\b/i,
  /\b(?:please\s+)?(?:ensure|make\s+sure)\b/i,
  /\b(?:as\s+)?(?:per|following)\s+(?:the\s+)?(?:template|format)\b/i,
];

const CAUTIOUS_PATTERNS = [
  /\bmight\s+want\s+to\b/i,
  /\bperhaps\s+consider\b/i,
  /\bit\s+could\s+be\s+(?:that|beneficial)\b/i,
  /\bi\s+(?:would\s+)?(?:think|believe|suspect)\s+that\b/i,
  /\b(?:a\s+bit|somewhat|slightly)\s+(?:weak|low)\b/i,
];

/**
 * Run human-feel sanity check. Does not modify the text; returns flags only.
 */
export function humanSanityCheck(text: string): HumanSanityFlags {
  const instructionalPhrases: string[] = [];
  const cautiousPhrases: string[] = [];

  if (!text || typeof text !== "string") {
    return {
      instructionalPhrases: [],
      cautiousPhrases: [],
      feelsHuman: false,
      accessible: false,
    };
  }

  for (const re of INSTRUCTIONAL_PATTERNS) {
    const m = text.match(re);
    if (m) instructionalPhrases.push(m[0].trim());
  }
  for (const re of CAUTIOUS_PATTERNS) {
    const m = text.match(re);
    if (m) cautiousPhrases.push(m[0].trim());
  }

  const hasMeta = instructionalPhrases.length > 0;
  const veryCautious = cautiousPhrases.length > 2;
  const feelsHuman = !hasMeta && !veryCautious;
  const accessible = !hasMeta && text.length < 12000;

  return {
    instructionalPhrases: [...new Set(instructionalPhrases)],
    cautiousPhrases: [...new Set(cautiousPhrases)],
    feelsHuman,
    accessible,
  };
}
