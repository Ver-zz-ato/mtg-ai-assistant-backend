/**
 * Parse and normalize LLM JSON for mobile roast v2.
 */

import { z } from "zod";
import type { MobileRoastCardCallout, MobileRoastHeat, MobileRoastIssue, MobileRoastPayload } from "./roast-ai-types";
import { MOBILE_ROAST_AI_PROMPT_VERSION } from "./roast-ai-prompt";
import { parseJsonObjectFromLlmText } from "./deck-compare-mobile-response";

const MAX_VERDICT_SUMMARY = 160;
const MAX_OPENING = 320;
const MAX_ISSUE_TITLE = 80;
const MAX_ISSUE_BODY = 280;
const MAX_FINAL = 720;
const MAX_SHARE = 180;
const MAX_CALLOUT_LINE = 220;
const MAX_ISSUES = 4;
const MAX_CALLOUTS = 4;
const MAX_CITED_CARDS = 4;

function trimStr(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const issueSchema = z.object({
  title: z.unknown().optional(),
  body: z.unknown().optional(),
  cards: z.unknown().optional(),
});

const calloutSchema = z.object({
  card_name: z.unknown().optional(),
  line: z.unknown().optional(),
});

const rawSchema = z
  .object({
    deck_name: z.unknown().optional(),
    verdict_summary: z.unknown().optional(),
    opening_jab: z.unknown().optional(),
    biggest_issues: z.unknown().optional(),
    card_callouts: z.unknown().optional(),
    final_verdict: z.unknown().optional(),
    share_line: z.unknown().optional(),
  })
  .passthrough();

function normIssues(raw: unknown): MobileRoastIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: MobileRoastIssue[] = [];
  for (const item of raw) {
    if (out.length >= MAX_ISSUES) break;
    const p = issueSchema.safeParse(item);
    if (!p.success) continue;
    const title = trimStr(p.data.title, MAX_ISSUE_TITLE);
    const body = trimStr(p.data.body, MAX_ISSUE_BODY);
    if (!title && !body) continue;
    const row: MobileRoastIssue = {
      title: title || "Issue",
      body: body || title,
    };
    if (Array.isArray(p.data.cards)) {
      const cards = p.data.cards
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, MAX_CITED_CARDS);
      if (cards.length) row.cards = cards;
    }
    out.push(row);
  }
  return out;
}

function normCallouts(raw: unknown): MobileRoastCardCallout[] {
  if (!Array.isArray(raw)) return [];
  const out: MobileRoastCardCallout[] = [];
  for (const item of raw) {
    if (out.length >= MAX_CALLOUTS) break;
    const p = calloutSchema.safeParse(item);
    if (!p.success) continue;
    const card_name = trimStr(p.data.card_name, 120);
    const line = trimStr(p.data.line, MAX_CALLOUT_LINE);
    if (!card_name || !line) continue;
    out.push({ card_name, line });
  }
  return out;
}

export function normalizeMobileRoastAiResponse(
  parsed: unknown,
  args: {
    heat: MobileRoastHeat;
    commander: string | null;
    format: string;
    model: string;
  }
): MobileRoastPayload {
  const raw = rawSchema.safeParse(parsed);
  const o = raw.success ? raw.data : {};

  let deck_name: string | null = trimStr(o.deck_name, 120) || null;
  if (!deck_name && args.commander) {
    deck_name = `${args.commander} — ${args.format}`;
  }

  const opening_jab = trimStr(o.opening_jab, MAX_OPENING);
  const verdict_summary =
    trimStr(o.verdict_summary, MAX_VERDICT_SUMMARY) ||
    (opening_jab ? opening_jab.split(/[.!?]/)[0].trim().slice(0, MAX_VERDICT_SUMMARY) : "") ||
    "Deck roast ready.";

  return {
    deck_name,
    heat: args.heat,
    verdict_summary,
    opening_jab: opening_jab || "Let's take a look…",
    biggest_issues: normIssues(o.biggest_issues),
    card_callouts: normCallouts(o.card_callouts),
    final_verdict: trimStr(o.final_verdict, MAX_FINAL) || "Final verdict unavailable.",
    share_line:
      trimStr(o.share_line, MAX_SHARE) ||
      verdict_summary.slice(0, MAX_SHARE) ||
      "Roast complete.",
    prompt_version: MOBILE_ROAST_AI_PROMPT_VERSION,
  };
}

export function parseMobileRoastAiJson(text: string): unknown {
  return parseJsonObjectFromLlmText(text);
}

/** Best-effort: strip illegal bracket tokens from model output (same idea as deck compare mobile). */
export async function stripMobileRoastForFormat(
  payload: MobileRoastPayload,
  formatLabel: string,
  logPrefix: string
): Promise<MobileRoastPayload> {
  const { stripIllegalBracketCardTokensFromText } = await import("@/lib/deck/recommendation-legality");
  const strip = async (s: string) => stripIllegalBracketCardTokensFromText(s, formatLabel, { logPrefix });
  const biggest_issues = await Promise.all(
    payload.biggest_issues.map(async (i) => ({
      ...i,
      title: await strip(i.title),
      body: await strip(i.body),
    }))
  );
  const card_callouts = await Promise.all(
    payload.card_callouts.map(async (c) => ({
      ...c,
      card_name: await strip(c.card_name),
      line: await strip(c.line),
    }))
  );
  return {
    ...payload,
    deck_name: payload.deck_name ? await strip(payload.deck_name) : null,
    verdict_summary: await strip(payload.verdict_summary),
    opening_jab: await strip(payload.opening_jab),
    biggest_issues,
    card_callouts,
    final_verdict: await strip(payload.final_verdict),
    share_line: await strip(payload.share_line),
  };
}
