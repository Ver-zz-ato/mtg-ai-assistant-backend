export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalize } from "@/lib/cards/canonicalize";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { convert } from "@/lib/currency/rates";
import { createClient } from "@/lib/server-supabase";
import { getBudgetSwaps } from "@/lib/data/get-budget-swaps";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import { checkProStatus } from "@/lib/server-pro-check";
import { hashString, hashGuestToken } from "@/lib/guest-tracking";
import { SWAP_SUGGESTIONS_FREE, SWAP_SUGGESTIONS_GUEST, SWAP_SUGGESTIONS_PRO } from "@/lib/feature-limits";
import { DEFAULT_FALLBACK_MODEL } from "@/lib/ai/default-models";
import { enrichDeck } from "@/lib/deck/deck-enrichment";
import { classifyCardRoles, formatRoleSummaryForPrompt, summarizeDeckRoles } from "@/lib/deck/role-classifier";
import type { CanonicalDeckRole } from "@/lib/deck/role-classifier";
import {
  formatKeyToDisplayTitle,
  isCommanderFormatKey,
  normalizeManatapDeckFormatKey,
} from "@/lib/format/manatap-deck-format";
import { isAiWorkshopBudgetSource, isValidBudgetSwap } from "@/lib/deck/budget-swap-guards";
import {
  annotateOwnership,
  appendOwnershipToReason,
  buildOwnershipContextForUserDeck,
  formatOwnershipContextForPrompt,
} from "@/lib/collections/ownership-context";
import type { SfCard } from "@/lib/deck/inference";
import { getAdmin } from "@/app/api/_lib/supa";
import {
  buildTagProfile,
  fetchTagGroundedRowsByNames,
  filterSwapSuggestionsByTagSimilarity,
  summarizeTagProfileForPrompt,
} from "@/lib/recommendations/tag-grounding";
import type { GroundedCardCandidate } from "@/lib/recommendations/tag-grounding";
import { aiRerankRecommendations, buildRecommendationIntent, rankGroundedCandidates } from "@/lib/recommendations/recommendation-pipeline";
import { getRecommendationTierConfig, resolveRecommendationTier } from "@/lib/recommendations/recommendation-tier";
import {
  resolveSwapSuggestionsEmptyReason,
  type AiRunMetrics,
} from "@/lib/deck/swap-suggestions-empty-reason";
import { getCommanderColorIdentity } from "@/lib/deck/generation-helpers";

// Very light-weight, research-aware swap suggester.
// Loads budget swaps from data file for easy maintenance and expansion.

type Suggestion = {
  from: string;
  to: string;
  price_from: number;
  price_to: number;
  price_delta: number;
  rationale: string;
  confidence: number; // 0..1
  ownership?: "owned" | "missing" | "unknown";
  ownedQty?: number;
};

type ScryfallPriceResponse = {
  prices?: {
    usd?: string | null;
    eur?: string | null;
  } | null;
};

type AiSwapResponse = Array<{ from: string; to: string; reason?: string }>;

type AiSuggestOutcome = "ok" | "empty" | "invalid_response" | "call_failed";

type AiSuggestResult = {
  outcome: AiSuggestOutcome;
  suggestions: AiSwapResponse;
};

type AiSuggestOptions = {
  timeoutMs?: number;
  retry?: boolean;
};

const AI_SUGGEST_TIMEOUT_MS = 120_000;
const WORKSHOP_AI_SUGGEST_TIMEOUT_MS = 18_000;
const WORKSHOP_AI_FALLBACK_DEADLINE_MS = 95_000;

type RoleGroup =
  | "mana"
  | "draw"
  | "tutor"
  | "interaction"
  | "recursion"
  | "graveyard"
  | "token"
  | "engine"
  | "combo"
  | "wincon";

async function scryPrice(name: string, currency = "USD"): Promise<number> {
  try {
    const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
    // eslint-disable-next-line no-restricted-globals -- Scryfall named lookup fallback when local snapshot/cache has no price.
    const r = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "ManaTap budget swap suggestions",
        Accept: "application/json",
      },
    });
    if (!r.ok) return 0;
    const j = (await r.json()) as ScryfallPriceResponse;
    const p = j?.prices || {};
    const usd = parseFloat(p.usd || "0") || 0;
    const eur = parseFloat(p.eur || "0") || 0;
    let base = 0; let baseCur: "USD" | "EUR" = "USD";
    if (usd > 0) { base = usd; baseCur = "USD"; }
    else if (eur > 0) { base = eur; baseCur = "EUR"; }
    else { return 0; }
    return await convert(base, baseCur, currency);
  } catch { return 0; }
}

/** Parse deck text using shared parser (handles Moxfield, Archidekt, etc.) then canonicalize. */
function parseDeck(text: string): string[] {
  const normalized = (text || "").replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  const cards = parseDeckText(normalized);
  const out: string[] = [];
  for (const c of cards) {
    const { canonicalName } = canonicalize(c.name);
    if (canonicalName) out.push(canonicalName);
  }
  return Array.from(new Set(out));
}

function normalizedCardKey(name: string): string {
  return normalizeScryfallCacheName(canonicalize(name).canonicalName || name);
}

function normalizePriceCacheName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function roleGroupsForRoles(roles: CanonicalDeckRole[]): Set<RoleGroup> {
  const groups = new Set<RoleGroup>();
  for (const role of roles) {
    if (role === "land" || role === "ramp" || role === "fixing") groups.add("mana");
    if (role === "draw") groups.add("draw");
    if (role === "tutor") groups.add("tutor");
    if (role === "removal" || role === "interaction" || role === "protection" || role === "hate") groups.add("interaction");
    if (role === "recursion") groups.add("recursion");
    if (role === "graveyard") groups.add("graveyard");
    if (role === "token") groups.add("token");
    if (role === "engine") groups.add("engine");
    if (role === "combo") groups.add("combo");
    if (role === "wincon") groups.add("wincon");
  }
  return groups;
}

function addNameBasedRoleHints(
  groups: Set<RoleGroup>,
  card: { name?: string; oracle_text?: string; type_line?: string },
): Set<RoleGroup> {
  const out = new Set(groups);
  const name = String(card.name || "").toLowerCase();
  const text = `${card.oracle_text || ""} ${card.type_line || ""}`.toLowerCase();

  if (/\b(the one ring|rhystic study|mystic remora|esper sentinel|phyrexian arena|necropotence|black market connections|curiosity)\b/i.test(name)) {
    out.add("draw");
    out.add("engine");
  }
  if (/\b(dockside extortionist|goldspan dragon|professional face-breaker|treasure nabber|mana crypt|mana vault|sol ring|thought vessel|arcane signet|gaea's cradle|circle of dreams druid|nykthos, shrine to nyx|ancient tomb)\b/i.test(name)) {
    out.add("mana");
  }
  if (/\b(demonic tutor|vampiric tutor|diabolic tutor|diabolic intent|beseech the queen|grim tutor)\b/i.test(name)) {
    out.add("tutor");
  }
  if (/\b(force of will|force of negation|fierce guardianship|pact of negation|mana drain|counterspell|arcane denial|negate|swan song)\b/i.test(name)) {
    out.add("interaction");
  }
  if (/\b(thassa's oracle|demonic consultation|tainted pact)\b/i.test(name)) {
    out.add("combo");
    out.add("wincon");
  }
  if (/\bcreate .*treasure|treasure tokens?|add (?:one|two|three|\{[wubrgc]\})|tap.*add\b/i.test(text)) {
    out.add("mana");
  }
  if (/\bdraw (?:a|one|two|three|\d+|x) cards?|whenever .*draw|at the beginning .*draw\b/i.test(text)) {
    out.add("draw");
  }
  return out;
}

function roleGroupsCompatible(fromGroups: Set<RoleGroup>, toGroups: Set<RoleGroup>): boolean {
  if (fromGroups.size === 0 || toGroups.size === 0) return true;
  const strictGroups: RoleGroup[] = ["draw", "tutor", "combo"];
  for (const group of strictGroups) {
    if (fromGroups.has(group)) return toGroups.has(group);
  }
  for (const group of fromGroups) {
    if (toGroups.has(group)) return true;
  }
  return false;
}

async function filterSuggestionsByRoleParity(suggestions: Suggestion[]): Promise<Suggestion[]> {
  if (suggestions.length === 0) return suggestions;
  const names = [...new Set(suggestions.flatMap((s) => [s.from, s.to]))];
  const enriched = await enrichDeck(names.map((name) => ({ name, qty: 1 }))).catch(() => []);
  if (enriched.length === 0) return suggestions;

  const byName = new Map(enriched.map((card) => [normalizedCardKey(card.name), card]));
  return suggestions.filter((suggestion) => {
    const fromCard = byName.get(normalizedCardKey(suggestion.from));
    const toCard = byName.get(normalizedCardKey(suggestion.to));
    if (!fromCard || !toCard) return true;
    const fromGroups = addNameBasedRoleHints(roleGroupsForRoles(classifyCardRoles(fromCard).roles), fromCard);
    const toGroups = addNameBasedRoleHints(roleGroupsForRoles(classifyCardRoles(toCard).roles), toCard);
    return roleGroupsCompatible(fromGroups, toGroups);
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST deckText and optional budget to get budget swap suggestions.",
    example: {
      method: "POST",
      url: "/api/deck/swap-suggestions",
      body: { deckText: "1 Cyclonic Rift\n1 Sol Ring", budget: 5 },
    },
  });
}

async function aiSuggest(
  deckText: string, 
  currency: string, 
  budget: number,
  format: string,
  userId?: string | null,
  isPro?: boolean,
  anonId?: string | null,
  commander?: string | null,
  allowedColors?: string[] | null,
  usageSource?: string | null,
  sourcePage?: string | null,
  recommendationTier?: "guest" | "free" | "pro",
  protectedRoleCardsPrompt = "",
  options: AiSuggestOptions = {},
): Promise<AiSuggestResult> {
  const tierConfig = getRecommendationTierConfig(recommendationTier ?? "guest");
  const model = tierConfig.model || process.env.MODEL_SWAP_SUGGESTIONS || DEFAULT_FALLBACK_MODEL;
  const formatKey = normalizeManatapDeckFormatKey(format);
  const formatTitle = formatKeyToDisplayTitle(formatKey);
  const isCommander = isCommanderFormatKey(formatKey);
  
  // Build color identity instruction if available
  let formatRule = `5. Format: All replacements must be legal in ${formatTitle}. This is a 60-card constructed context; do not use Commander-only rules, singleton assumptions, color identity, or command-zone language.`;
  if (isCommander && commander && allowedColors && allowedColors.length > 0) {
    const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
    const colorNamesStr = allowedColors.map(c => colorNames[c] || c).join(', ');
    formatRule = `5. **COLOR IDENTITY (CRITICAL)**: This is Commander. Commander is ${commander} with color identity ${allowedColors.join('')} (${colorNamesStr}). You MUST ONLY suggest replacement cards within this color identity. Do NOT suggest any cards with mana symbols outside of ${allowedColors.join(', ')}. This is non-negotiable.`;
  } else if (isCommander) {
    formatRule = '5. Format & color: All suggestions must be Commander-legal and match the deck color identity when it is known.';
  }

  let protectedRoleCardsPromptResolved = protectedRoleCardsPrompt;
  if (!protectedRoleCardsPromptResolved) {
    try {
      const { detectProtectedRoleCards, formatProtectedRoleCardsForSwapPrompt } = await import("@/lib/deck/protected-role-cards");
      const cards = await detectProtectedRoleCards({
        deckText,
        commander: isCommander ? commander || null : null,
        limit: 14,
      });
      protectedRoleCardsPromptResolved = formatProtectedRoleCardsForSwapPrompt(cards);
    } catch {
      protectedRoleCardsPromptResolved = "";
    }
  }
  
  const system = `You are ManaTap AI, an expert Magic: The Gathering assistant suggesting budget-friendly alternatives.

CRITICAL RULES:
1. Price: Only suggest swaps where the replacement costs LESS than the original card.
   - Prioritize the deck's most expensive cards where meaningful savings are possible.
   - Skip bulk basics and trivially cheap cards unless savings are still worthwhile.
   - Do not suggest a replacement already present in the submitted deck.
2. Role: Replacement MUST fill the SAME deck role:
   - Ramp → Ramp only (mana rocks, land fetch, dorks)
   - Removal → Removal only (destroy, exile, bounce, counter)
   - Card draw → Card draw only (draw spells, cantrips, card selection)
   - Win condition → Win condition only (finishers, combo pieces)
   - Protection → Protection only (hexproof, indestructible, phasing)
   NEVER swap between categories (e.g., don't replace removal with ramp)
3. CMC Match: Try to match mana cost within 1-2 CMC when possible
4. Synergy Protection: NEVER suggest swapping:
   - Known combo pieces (Thassa's Oracle, Thoracle, Demonic Consultation, etc.)
   - Cards that reference specific other cards by name
   - Cards with "you win the game" or infinite combo potential
${formatRule}
${protectedRoleCardsPromptResolved ? `\n${protectedRoleCardsPromptResolved}` : ""}

RESPONSE FORMAT: Respond ONLY with a JSON array. Each object: "from" (original card), "to" (replacement), "reason" (1-2 sentences explaining role match).
Example: [{"from":"Gaea's Cradle","to":"Growing Rites of Itlimoc","reason":"Both are lands that tap for mana based on creatures - same ramp role."}]
If USER COLLECTION CONTEXT is present, prefer owned replacements from the sample when they are close fits, and mention "Owned" in the reason.
If SHARED ROLE CLASSIFIER SUMMARY or TAG GROUNDED PROFILE is present in the deck text, use it to preserve deck intent and avoid generic swaps.
Quality over quantity. If no good swaps exist, return empty array [].`;
  
  const input = `Format: ${formatTitle}\nCurrency: ${currency}${isCommander && commander ? `\nCommander: ${commander}` : ''}\nDeck:\n${deckText}`;

  const runOnce = async (): Promise<AiSuggestResult> => {
    try {
      const { callLLM } = await import('@/lib/ai/unified-llm-client');

      const response = await callLLM(
        [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: input }] },
        ],
        {
          route: '/api/deck/swap-suggestions',
          feature: 'swap_suggestions',
          model,
          fallbackModel: tierConfig.fallbackModel || DEFAULT_FALLBACK_MODEL,
          timeout: options.timeoutMs ?? AI_SUGGEST_TIMEOUT_MS,
          maxTokens: 4096,
          apiType: 'responses',
          retryOn429: true,
          retryOn5xx: true,
          userId: userId || null,
          isPro: isPro || false,
          anonId: anonId ?? null,
          source_page: sourcePage ?? null,
          source: usageSource ?? null,
        }
      );

      const text = response.text.trim();
      if (!text) {
        return { outcome: "empty", suggestions: [] };
      }
      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned) as unknown;
        if (!Array.isArray(parsed)) {
          return { outcome: "invalid_response", suggestions: [] };
        }
        const suggestions = parsed.filter((x): x is AiSwapResponse[number] => {
          return x != null && typeof x === "object" && typeof (x as { from?: unknown }).from === "string" && typeof (x as { to?: unknown }).to === "string";
        });
        return {
          outcome: suggestions.length > 0 ? "ok" : "empty",
          suggestions,
        };
      } catch {
        return { outcome: "invalid_response", suggestions: [] };
      }
    } catch (e) {
      console.warn("[swap-suggestions] AI call failed:", e);
      return { outcome: "call_failed", suggestions: [] };
    }
  };

  let result = await runOnce();
  if (options.retry !== false && (result.outcome === "call_failed" || result.outcome === "invalid_response")) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    result = await runOnce();
  }
  return result;
}

async function cachedPrice(name: string, currency: string, supabase: SupabaseClient): Promise<number> {
  try {
    const key = normalizePriceCacheName(canonicalize(name).canonicalName || name);
    if (!key) return 0;
    const { data } = await supabase
      .from("price_cache")
      .select("usd_price, eur_price")
      .eq("card_name", key)
      .maybeSingle();
    const usd = Number((data as { usd_price?: unknown } | null)?.usd_price || 0);
    const eur = Number((data as { eur_price?: unknown } | null)?.eur_price || 0);
    if (currency === "EUR" && eur > 0) return eur;
    if (usd > 0) return await convert(usd, "USD", currency);
    if (eur > 0) return await convert(eur, "EUR", currency);
  } catch {}
  return 0;
}

async function snapOrScryPrice(name: string, currency: string, useSnapshot: boolean, snapshotDate: string, supabase: SupabaseClient, allowExternalFallback = true): Promise<number> {
  const proper = canonicalize(name).canonicalName || name;
  if (useSnapshot) {
    try {
      const key = normalizeScryfallCacheName(proper);
      const { data } = await supabase.from('price_snapshots').select('unit').eq('snapshot_date', snapshotDate).eq('name_norm', key).eq('currency', currency).maybeSingle();
      const unit = Number((data as { unit?: unknown } | null)?.unit || 0);
      if (unit > 0) return unit;
    } catch {}
  }
  const cached = await cachedPrice(proper, currency, supabase);
  if (cached > 0) return cached;
  if (!allowExternalFallback) return 0;
  return await scryPrice(proper, currency);
}

export async function POST(req: NextRequest) {
  try {
    const startedAt = Date.now();
    const body = await req.json().catch(() => ({}));
    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const usageSource = resolveAiUsageSourceForRequest(req, body, null);
    const sourcePage =
      (typeof body.sourcePage === "string" ? body.sourcePage : typeof body.source_page === "string" ? body.source_page : null)?.trim() || null;
    const deckText = String(body.deckText || body.deck_text || "");
    const currency = String(body.currency || "USD").toUpperCase();
    const budget = Number(body.budget ?? 0);
    const useAI = Boolean(body.ai || (body.provider === "ai"));
    const useSnapshot = Boolean(body.useSnapshot || body.use_snapshot);
    const snapshotDate = String(body.snapshotDate || body.snapshot_date || new Date().toISOString().slice(0,10)).slice(0,10);
    const commander = String(body.commander || "").trim();
    const format = String(body.format || "Commander").trim();
    const workshopBudgetSource = isAiWorkshopBudgetSource(sourcePage);
    const allowReplacementAboveBudget =
      isAiWorkshopBudgetSource(sourcePage)
      || body.allowReplacementAboveBudget === true
      || body.allow_replacement_above_budget === true
      || (useAI && !workshopBudgetSource);

    let supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();
    let isPro = false;

    // Bearer fallback for mobile
    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    if (user) {
      isPro = await checkProStatus(user.id);
      const dailyCap = isPro ? SWAP_SUGGESTIONS_PRO : SWAP_SUGGESTIONS_FREE;
      const userKeyHash = `user:${await hashString(user.id)}`;
      const rateLimit = await checkDurableRateLimit(supabase, userKeyHash, '/api/deck/swap-suggestions', dailyCap, 1, {
        identity: isPro ? 'pro' : 'free',
        verifiedUserId: isPro ? user.id : null,
      });
      if (!rateLimit.allowed) {
        return NextResponse.json({
          ok: false,
          code: 'RATE_LIMIT_DAILY',
          proUpsell: !isPro,
          error: isPro
            ? "You've reached your daily limit. Contact support if you need higher limits."
            : `You've used your ${SWAP_SUGGESTIONS_FREE} free Budget Swap runs today. Upgrade to Pro for more!`,
          resetAt: rateLimit.resetAt,
        }, { status: 429 });
      }
    } else {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const guestToken = cookieStore.get('guest_session_token')?.value;
      const keyHash = guestToken
        ? `guest:${await hashGuestToken(guestToken)}`
        : `ip:${await hashString((req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown')}`;
      const rateLimit = await checkDurableRateLimit(supabase, keyHash, '/api/deck/swap-suggestions', SWAP_SUGGESTIONS_GUEST, 1, {
        identity: keyHash.startsWith('guest:') ? 'guest' : 'anonymous',
      });
      if (!rateLimit.allowed) {
        return NextResponse.json({
          ok: false,
          code: 'RATE_LIMIT_DAILY',
          proUpsell: true,
          error: `You've used your ${SWAP_SUGGESTIONS_GUEST} free runs today. Sign in for more!`,
          resetAt: rateLimit.resetAt,
        }, { status: 429 });
      }
    }

    const names = parseDeck(deckText);
    const deckNameKeys = new Set(names.map(normalizedCardKey));
    const admin = getAdmin();
    const deckProfile =
      admin && names.length > 0
        ? buildTagProfile(await fetchTagGroundedRowsByNames(admin, names))
        : null;
    const ownershipContext = await buildOwnershipContextForUserDeck({
      supabase,
      userId: user?.id,
      deckCards: names.map((name) => ({ name, qty: 1 })),
      sampleLimit: 24,
    });
    const ownershipPrompt = formatOwnershipContextForPrompt(ownershipContext);
    let roleSummaryPrompt = "";
    try {
      const enriched = await enrichDeck(names.map((name) => ({ name, qty: 1 })));
      roleSummaryPrompt = formatRoleSummaryForPrompt(summarizeDeckRoles(enriched));
    } catch {
      roleSummaryPrompt = "";
    }
    const builtinSwaps = await getBudgetSwaps();
    const suggestions: Suggestion[] = [];
    const curatedSourceNames = names.filter((name) => (builtinSwaps[name.toLowerCase()] || []).length > 0);

    // Detect combo pieces - these should NOT be suggested for swapping
    const comboPieces = new Set<string>();
    try {
      const { detectCombos, normalizeDeckNames } = await import('@/lib/combos/detect');
      const normalizedNames = normalizeDeckNames(deckText);
      const { present } = detectCombos(normalizedNames);
      
      // Collect all pieces from detected combos
      for (const combo of present) {
        for (const piece of combo.pieces) {
          comboPieces.add(piece.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim());
        }
      }
      
      if (comboPieces.size > 0) {
        console.log('[swap-suggestions] Protected combo pieces:', Array.from(comboPieces).join(', '));
      }
    } catch (comboErr) {
      console.warn('[swap-suggestions] Combo detection failed:', comboErr);
    }

    // Fetch commander's color identity for validation
    let allowedColors: string[] = [];
    const isCommanderFormat = format.toLowerCase().includes('commander') || format.toLowerCase().includes('edh');
    if (isCommanderFormat && commander) {
      try {
        allowedColors = (await getCommanderColorIdentity(commander)).map((c: string) => c.toUpperCase());
        if (allowedColors.length > 0) {
          console.log('[swap-suggestions] Commander color identity:', allowedColors.join(','));
        }
      } catch (e) {
        console.warn('[swap-suggestions] Failed to fetch commander color identity:', e);
      }
    }

    let protectedRoleCardsPrompt = "";
    let protectedFromKeys = new Set<string>();
    try {
      const {
        detectProtectedRoleCards,
        formatProtectedRoleCardsForSwapPrompt,
        buildProtectedSwapFromKeys,
      } = await import("@/lib/deck/protected-role-cards");
      const protectedRoleCards = await detectProtectedRoleCards({
        deckText,
        commander: isCommanderFormat && commander ? commander : null,
        limit: 20,
      });
      protectedRoleCardsPrompt = formatProtectedRoleCardsForSwapPrompt(protectedRoleCards);
      protectedFromKeys = buildProtectedSwapFromKeys(protectedRoleCards);
      if (protectedFromKeys.size > 0) {
        console.log(
          "[swap-suggestions] Protected swap sources:",
          protectedRoleCards.slice(0, 10).map((c) => c.name).join(", "),
        );
      }
    } catch (protectedErr) {
      console.warn("[swap-suggestions] Protected role detection failed:", protectedErr);
    }

    const addAiSuggestions = async (metrics: AiRunMetrics) => {
      let anonId: string | null = null;
      if (user?.id) anonId = await hashString(user.id);
      else {
        const { cookies } = await import('next/headers');
        const guestToken = (await cookies()).get('guest_session_token')?.value;
        if (guestToken) anonId = await hashGuestToken(guestToken);
      }
      const recommendationTier = resolveRecommendationTier({ isGuest: !user, userId: user?.id ?? null, isPro });
      const aiContext = [
        deckText,
        roleSummaryPrompt ? `SHARED ROLE CLASSIFIER SUMMARY:\n${roleSummaryPrompt}` : "",
        deckProfile ? `TAG GROUNDED PROFILE:\n${summarizeTagProfileForPrompt(deckProfile)}` : "",
        ownershipPrompt,
      ].filter(Boolean).join("\n\n");
      const aiDeckText = aiContext || deckText;
      const aiResult = await aiSuggest(
        aiDeckText,
        currency,
        budget,
        format,
        user?.id || null,
        isPro,
        anonId,
        isCommanderFormat ? commander || null : null,
        allowedColors.length > 0 ? allowedColors : null,
        usageSource ?? null,
        sourcePage,
        recommendationTier,
        protectedRoleCardsPrompt,
        workshopBudgetSource ? { timeoutMs: WORKSHOP_AI_SUGGEST_TIMEOUT_MS, retry: false } : {},
      );
      metrics.outcome = aiResult.outcome;
      metrics.rawCount = aiResult.suggestions.length;

      if (aiResult.outcome === "call_failed" || aiResult.outcome === "invalid_response") {
        return;
      }

      for (const s of aiResult.suggestions) {
        const from = canonicalize(s.from).canonicalName || s.from;
        const toCanon = canonicalize(s.to).canonicalName || s.to;
        if (!from || !toCanon) continue;
        
        // Skip combo pieces - don't suggest swapping them
        const fromNorm = from.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
        if (comboPieces.has(fromNorm)) {
          console.log(`[swap-suggestions] Skipping combo piece: ${from}`);
          continue;
        }
        
        const pf = await snapOrScryPrice(from, currency, useSnapshot, snapshotDate, supabase);
        const pt = await snapOrScryPrice(toCanon, currency, useSnapshot, snapshotDate, supabase);
        if (!isValidBudgetSwap({ from, to: toCanon, priceFrom: pf, priceTo: pt, budget, deckNameKeys, format, allowReplacementAboveBudget, protectedFromKeys })) continue;
        const delta = pt - pf;
        const rationale = s.reason || `${toCanon} is a budget-friendly alternative to ${from}.`;
        const confidence = Math.max(0.3, Math.min(0.9, (pf - pt) / Math.max(1, pf)));
        suggestions.push({ from, to: toCanon, price_from: pf, price_to: pt, price_delta: delta, rationale, confidence });
        metrics.validatedCount += 1;
      }
    };

    const aiRun: AiRunMetrics = { outcome: "not_run", rawCount: 0, validatedCount: 0 };

    // Standalone Budget Swaps can use AI first. AI Workshop lower-budget needs the
    // trusted deterministic swaps first so the modal never waits on a long LLM pass.
    if (useAI && !workshopBudgetSource) {
      await addAiSuggestions(aiRun);
    }

    // Built-in fallbacks for common staples — only price cards with curated swap entries.
    const builtinPricingSources = useAI && workshopBudgetSource ? names : curatedSourceNames;
    for (const from of builtinPricingSources) {
      // Skip combo pieces - don't suggest swapping them
      const fromNorm = from.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
      if (comboPieces.has(fromNorm)) {
        console.log(`[swap-suggestions] Skipping combo piece (builtin): ${from}`);
        continue;
      }

      const key = from.toLowerCase();
      const cands = builtinSwaps[key] || [];
      if (cands.length === 0) continue;

      const pf = await snapOrScryPrice(from, currency, useSnapshot, snapshotDate, supabase, !workshopBudgetSource);
      if (pf > budget) {
        for (const cand of cands) {
          const toCanon = canonicalize(cand).canonicalName || cand;
          const pt = await snapOrScryPrice(toCanon, currency, useSnapshot, snapshotDate, supabase, !workshopBudgetSource);
          if (isValidBudgetSwap({ from, to: toCanon, priceFrom: pf, priceTo: pt, budget, deckNameKeys, format, allowReplacementAboveBudget, protectedFromKeys })) {
            const delta = pt - pf;
            const rationale = `${toCanon} is a budget-friendly alternative to ${from}.`;
            const confidence = Math.max(0.3, Math.min(0.9, (pf - pt) / Math.max(1, pf)));
            suggestions.push({ from, to: toCanon, price_from: pf, price_to: pt, price_delta: delta, rationale, confidence });
          }
        }
      }
    }

    const runValidationPipeline = async (rawSuggestions: Suggestion[]): Promise<Suggestion[]> => {
      const dedupedSuggestions = new Map<string, Suggestion>();
      for (const suggestion of rawSuggestions) {
        const key = `${normalizedCardKey(suggestion.from)}=>${normalizedCardKey(suggestion.to)}`;
        const existing = dedupedSuggestions.get(key);
        if (!existing || suggestion.price_delta < existing.price_delta) {
          dedupedSuggestions.set(key, suggestion);
        }
      }
      const deduped = [...dedupedSuggestions.values()].sort(
        (a, b) => (a.price_to - a.price_from) - (b.price_to - b.price_from),
      );

      let pipeline = deduped;

      if (isCommanderFormat && commander && pipeline.length > 0 && allowedColors.length > 0) {
        try {
          const { getDetailsForNamesCached } = await import('@/lib/server/scryfallCache');
          const { isWithinColorIdentity } = await import('@/lib/deck/mtgValidators');

          const toCardNames = pipeline.map((s) => s.to);
          const cardDetails = await getDetailsForNamesCached(toCardNames);
          const beforeCount = pipeline.length;
          pipeline = pipeline.filter((s) => {
            const cardKey = normalizeScryfallCacheName(s.to);
            const cardEntry = cardDetails.get(cardKey);
            if (!cardEntry) return false;
            const cardColors = cardEntry.color_identity || [];
            return isWithinColorIdentity({ color_identity: cardColors } as SfCard, allowedColors);
          });
          const removedCount = beforeCount - pipeline.length;
          if (removedCount > 0) {
            console.log(`[swap-suggestions] Removed ${removedCount} off-color suggestions`);
          }
        } catch (colorErr) {
          console.error('[swap-suggestions] Color identity validation error:', colorErr);
        }
      }

      try {
        const { filterSuggestedCardNamesForFormat } = await import("@/lib/deck/recommendation-legality");
        const legal = await filterSuggestedCardNamesForFormat(
          pipeline.map((s) => s.to),
          format,
          { logPrefix: "/api/deck/swap-suggestions" },
        );
        const legalNorm = new Set(legal.allowed.map((n) => normalizeScryfallCacheName(n)));
        pipeline = pipeline.filter((s) => legalNorm.has(normalizeScryfallCacheName(s.to)));
      } catch (legErr) {
        console.warn("[swap-suggestions] Legality filter failed:", legErr);
      }

      const roleParitySuggestions = await filterSuggestionsByRoleParity(pipeline);
      if (roleParitySuggestions.length > 0) {
        pipeline = roleParitySuggestions;
      }

      if (admin && deckProfile && pipeline.length > 0) {
        const groundedFromRows = await fetchTagGroundedRowsByNames(admin, pipeline.map((s) => s.from));
        const groundedToRows = await fetchTagGroundedRowsByNames(admin, pipeline.map((s) => s.to));
        const tagFilteredSuggestions = filterSwapSuggestionsByTagSimilarity(
          pipeline,
          groundedFromRows,
          groundedToRows,
          deckProfile,
        );
        if (tagFilteredSuggestions.length > 0) {
          pipeline = tagFilteredSuggestions;
        }

        const recommendationTier = resolveRecommendationTier({ isGuest: !user, userId: user?.id ?? null, isPro });
        const tierConfig = getRecommendationTierConfig(recommendationTier);
        const intent = buildRecommendationIntent({
          routeKind: "swap",
          routeLabel: "swap_suggestions",
          formatLabel: format,
          profile: deckProfile,
          selectionCount: Math.min(7, pipeline.length),
          isGuest: !user,
          isPro,
          userId: user?.id ?? null,
        });
        const rankedPool = rankGroundedCandidates(groundedToRows as GroundedCardCandidate[], deckProfile, intent).slice(0, tierConfig.candidateLimit);
        const reranked = await aiRerankRecommendations({
          candidates: rankedPool,
          intent,
          userId: user?.id ?? null,
          isPro,
        }).catch(() => null);
        if (reranked?.picks?.length) {
          const existingByTo = new Map(pipeline.map((s) => [normalizeScryfallCacheName(s.to), s]));
          const nextSuggestions = reranked.picks
            .map((pick) => {
              const row = existingByTo.get(normalizeScryfallCacheName(pick.name));
              if (!row) return null;
              return { ...row, rationale: pick.reason || row.rationale };
            })
            .filter((row): row is Suggestion => !!row);
          if (nextSuggestions.length > 0) {
            pipeline = nextSuggestions;
          }
        }
      }

      return pipeline;
    };

    let validatedSuggestions = await runValidationPipeline(suggestions);

    if (
      useAI &&
      workshopBudgetSource &&
      validatedSuggestions.length === 0 &&
      Date.now() - startedAt < WORKSHOP_AI_FALLBACK_DEADLINE_MS
    ) {
      await addAiSuggestions(aiRun);
      validatedSuggestions = await runValidationPipeline(suggestions);
    }

    const annotatedSuggestions = validatedSuggestions.map((s) => {
      const ownership = annotateOwnership(ownershipContext, s.to);
      return {
        ...s,
        rationale: appendOwnershipToReason(s.rationale, ownership),
        ownership: ownership.ownership,
        ownedQty: ownership.ownedQty,
      };
    });

    const emptyReason = annotatedSuggestions.length === 0
      ? resolveSwapSuggestionsEmptyReason({
          useAI,
          curatedSourcesInDeck: curatedSourceNames.length,
          finalCount: annotatedSuggestions.length,
          aiRun,
        })
      : undefined;

    return NextResponse.json({
      ok: true,
      currency,
      budget,
      suggestions: annotatedSuggestions,
      stats: {
        cardsInDeck: names.length,
        curatedSourcesInDeck: curatedSourceNames.length,
        ...(useAI ? {
          ai: {
            outcome: aiRun.outcome,
            rawCount: aiRun.rawCount,
            validatedCount: aiRun.validatedCount,
          },
        } : {}),
      },
      ...(emptyReason ? { emptyReason } : {}),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "swap failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
