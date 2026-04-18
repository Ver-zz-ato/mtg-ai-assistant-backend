/**
 * Parse and normalize LLM JSON for mobile roast v2.
 */

import { z } from "zod";
import type { MobileRoastCardCallout, MobileRoastHeat, MobileRoastIssue, MobileRoastPayload } from "./roast-ai-types";
import { MOBILE_ROAST_AI_PROMPT_VERSION } from "./roast-ai-prompt";
import { parseJsonObjectFromLlmText } from "./deck-compare-mobile-response";

/** At-a-glance: short label, not a hook */
const MAX_VERDICT_SUMMARY = 72;
const MAX_OPENING = 180;
const MAX_ISSUE_TITLE = 44;
const MAX_ISSUE_BODY = 118;
/** Two punchy lines max */
const MAX_FINAL = 240;
/** Top quote / screenshot caption — ~110 char ideal */
const MAX_SHARE = 110;
/** Sniper callouts: 2 short sentences ceiling */
const MAX_CALLOUT_LINE = 100;
const MAX_ISSUES = 3;
const MAX_CALLOUTS = 3;
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

function normLower(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** True if b is duplicate or obvious substring overlap of a (redundant screenshot/at-a-glance). */
function isRedundantWith(a: string, b: string): boolean {
  const na = normLower(a);
  const nb = normLower(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;
  if (shorter.length >= 24 && longer.includes(shorter.slice(0, Math.min(48, shorter.length)))) return true;
  return false;
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
  const openingFirst = opening_jab.split(/[.!?]/)[0]?.trim() ?? "";

  let verdict_summary = trimStr(o.verdict_summary, MAX_VERDICT_SUMMARY);
  if (!verdict_summary) {
    verdict_summary =
      args.commander != null
        ? trimStr(`${args.commander} — quick structural read.`, MAX_VERDICT_SUMMARY)
        : trimStr(`${args.format} list — at a glance.`, MAX_VERDICT_SUMMARY);
  }

  let share_line = trimStr(o.share_line, MAX_SHARE);
  if (!share_line) {
    const fv = trimStr(o.final_verdict, 400);
    const fvLast = fv.split(/[.!?]/).map((s) => s.trim()).filter(Boolean).pop() ?? "";
    share_line = fvLast ? trimStr(fvLast, MAX_SHARE) : "Roast complete.";
  }
  if (isRedundantWith(verdict_summary, share_line) || isRedundantWith(openingFirst, share_line)) {
    const fvRaw = trimStr(o.final_verdict, MAX_FINAL);
    const fvLast = fvRaw.split(/[.!?]/).map((s) => s.trim()).filter(Boolean).pop() ?? "";
    const alt =
      opening_jab.split(/[.!?]/).map((s) => s.trim()).filter(Boolean).slice(1).join(". ").trim() ||
      fvLast ||
      "";
    if (alt) share_line = trimStr(alt, MAX_SHARE);
  }
  if (isRedundantWith(verdict_summary, share_line) || isRedundantWith(openingFirst, share_line)) {
    const rawCo = o.card_callouts;
    let fromCallout = "";
    if (Array.isArray(rawCo) && rawCo[0] && typeof rawCo[0] === "object") {
      const line = (rawCo[0] as { line?: unknown }).line;
      if (typeof line === "string") fromCallout = trimStr(line, MAX_SHARE);
    }
    share_line =
      fromCallout && !isRedundantWith(verdict_summary, fromCallout)
        ? fromCallout
        : trimStr("The table saw this list coming.", MAX_SHARE);
  }

  return {
    deck_name,
    heat: args.heat,
    verdict_summary,
    opening_jab: opening_jab || "Let's take a look…",
    biggest_issues: normIssues(o.biggest_issues),
    card_callouts: normCallouts(o.card_callouts),
    final_verdict: trimStr(o.final_verdict, MAX_FINAL) || "Final verdict unavailable.",
    share_line,
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
