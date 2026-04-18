/**
 * Contract for POST /api/mobile/deck/roast-ai
 * Bump prompt_version in roast-ai-prompt.ts when changing model expectations.
 */

export type MobileRoastHeat = "mild" | "medium" | "spicy";

export type MobileRoastIssue = {
  title: string;
  body: string;
  /** Card names cited (no [[ ]] brackets in JSON). */
  cards?: string[];
};

export type MobileRoastCardCallout = {
  card_name: string;
  line: string;
};

export type MobileRoastPayload = {
  deck_name: string | null;
  heat: MobileRoastHeat;
  verdict_summary: string;
  opening_jab: string;
  biggest_issues: MobileRoastIssue[];
  card_callouts: MobileRoastCardCallout[];
  final_verdict: string;
  /** One punchy line optimized for share sheet / screenshot. */
  share_line: string;
  prompt_version: string;
};

export type MobileRoastAiMeta = {
  model: string;
  generated_at: string;
  route: string;
};

export type MobileRoastAiSuccessResponse = {
  ok: true;
  roast: MobileRoastPayload;
  /** Numeric savageness echo (e.g. 2 / 5 / 8) for legacy analytics parity. */
  roastScore: number;
  meta: MobileRoastAiMeta;
};
