export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import {
  DECK_ANALYZE_FREE,
  DECK_ANALYZE_GUEST,
  DECK_ANALYZE_PRO,
  MAX_DECK_ANALYZE_DECK_TEXT_CHARS,
} from "@/lib/feature-limits";
import { getFormatRules, isBasicLandName } from "@/lib/deck/formatRules";
import { rowsToDeckTextForAnalysis, parseMainboardEntriesForAnalysis } from "@/lib/deck/formatCompliance";
import { normalizeCardName, isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { extractChatCompletionContent } from "@/lib/deck/generation-helpers";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import {
  banNormSetForUserFormat,
  evaluateCardRecommendationLegality,
  filterSuggestedCardNamesForFormat,
} from "@/lib/deck/recommendation-legality";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { bannedDataToMaps, getBannedCards } from "@/lib/data/get-banned-cards";
import {
  clampMaxSuggestions,
  computeFinishTargetStats,
  parseFinishSuggestionsJson,
  resolveFinishAnalyzeFormat,
  truncateDeckTextForPrompt,
} from "@/lib/deck/finish-suggestions-core";
import {
  annotateOwnership,
  appendOwnershipToReason,
  buildOwnershipContextForUserDeck,
  formatOwnershipContextForPrompt,
} from "@/lib/collections/ownership-context";
import { enrichDeck } from "@/lib/deck/deck-enrichment";
import { formatRoleSummaryForPrompt, summarizeDeckRoles } from "@/lib/deck/role-classifier";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const FINISH_COMPLETION_TOKENS = 4096;

type FinishBody = {
  deckId?: string;
  deckText?: string;
  format?: string;
  commander?: string;
  colors?: string[];
  maxSuggestions?: number;
  budget?: "budget" | "balanced" | "premium";
};

type CachedSuggestionDetail = SfCard & { legalities?: { [formatKey: string]: string } | null };

type FinishSuggestionOut = {
  card: string;
  qty: number;
  zone: "mainboard" | "sideboard";
  role: string;
  reason: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  legality: "legal" | "not_legal" | "unknown";
  estimatedUsd?: number;
  ownership?: "owned" | "missing" | "unknown";
  ownedQty?: number;
  source: "ai";
};

/** Same normalization as recommendations deck route for `price_cache.card_name`. */
function normalizePriceCacheCardName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function aggregateExistingCounts(entries: Array<{ name: string; count: number }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const k = normalizeCardName(e.name);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + Math.max(0, e.count));
  }
  return map;
}

function normalizePriority(p: unknown): "high" | "medium" | "low" {
  const s = String(p || "").toLowerCase();
  if (s === "high" || s === "medium" || s === "low") return s;
  return "medium";
}

export async function POST(req: Request) {
  const t0 = Date.now();
  let supabase = await getServerSupabase();
  const authSnap = await supabase.auth.getUser();
  let user = authSnap.data?.user ?? null;

  if (!user) {
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearerToken) {
      const { createClientWithBearerToken } = await import("@/lib/server-supabase");
      const bearerSupabase = createClientWithBearerToken(bearerToken);
      const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser(bearerToken);
      if (bearerUser) {
        user = bearerUser;
        supabase = bearerSupabase;
      }
    }
  }

  const body = (await req.json().catch(() => ({}))) as FinishBody;

  if (body.deckId && !user) {
    return NextResponse.json({ ok: false, error: "Sign in required when deckId is provided." }, { status: 401 });
  }

  let isPro = false;
  if (user) {
    try {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(user.id);
    } catch {
      isPro = false;
    }
  }

  const { isAdmin } = await import("@/lib/admin-check");
  const isAdminUser = !!(user && isAdmin(user));

  if (!isAdminUser) {
    try {
      const { checkDurableRateLimit } = await import("@/lib/api/durable-rate-limit");
      const { hashString, hashGuestToken } = await import("@/lib/guest-tracking");
      const { cookies } = await import("next/headers");
      let keyHash: string;
      let dailyLimit: number;
      if (user) {
        keyHash = `user:${await hashString(user.id)}`;
        dailyLimit = isPro ? DECK_ANALYZE_PRO : DECK_ANALYZE_FREE;
      } else {
        const cookieStore = await cookies();
        const guestToken = cookieStore.get("guest_session_token")?.value;
        if (guestToken) {
          keyHash = `guest:${await hashGuestToken(guestToken)}`;
        } else {
          const forwarded = req.headers.get("x-forwarded-for");
          const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "unknown";
          keyHash = `ip:${await hashString(ip)}`;
        }
        dailyLimit = DECK_ANALYZE_GUEST;
      }
      const durableLimit = await checkDurableRateLimit(supabase, keyHash, "/api/deck/finish-suggestions", dailyLimit, 1);
      if (!durableLimit.allowed) {
        const errMsg = user
          ? isPro
            ? "You've reached your daily limit. Contact support if you need higher limits."
            : `You've used your ${DECK_ANALYZE_FREE} free deck suggestion runs today. Upgrade to Pro for more!`
          : `You've used your ${DECK_ANALYZE_GUEST} free deck suggestion runs today. Sign in for more!`;
        return NextResponse.json(
          { ok: false, code: "RATE_LIMIT_DAILY", error: errMsg, resetAt: durableLimit.resetAt },
          { status: 429 },
        );
      }
    } catch (e) {
      console.error("[finish-suggestions] Rate limit check failed:", e);
    }
  }

  try {
    const { allowAIRequest } = await import("@/lib/server/budgetEnforcement");
    const budgetCheck = await allowAIRequest(supabase);
    if (!budgetCheck.allow) {
      return NextResponse.json(
        { ok: false, code: "BUDGET_LIMIT", error: budgetCheck.reason ?? "AI budget limit reached. Try again later." },
        { status: 429 },
      );
    }
  } catch {
    /* fail open */
  }

  const { checkMaintenance } = await import("@/lib/maintenance-check");
  const maint = await checkMaintenance();
  if (maint.enabled) {
    return NextResponse.json({ ok: false, code: "maintenance", error: maint.message }, { status: 503 });
  }

  let deckText = typeof body.deckText === "string" ? body.deckText.trim() : "";
  let resolvedCommander = typeof body.commander === "string" && body.commander.trim() ? body.commander.trim() : "";
  let resolvedColors: string[] = Array.isArray(body.colors) ? body.colors.map(String) : [];
  let deckAim: string | null = null;
  let deckPlan: string | null = null;
  let deckRowFormat: string | null = null;
  let deckCardsForOwnership: Array<{ name?: string | null; qty?: number | null }> | null = null;

  if (body.deckId) {
    const { data: deckRow, error: deckErr } = await supabase
      .from("decks")
      .select("deck_text, commander, format, colors, deck_aim, plan, user_id")
      .eq("id", body.deckId)
      .maybeSingle();

    if (deckErr || !deckRow) {
      return NextResponse.json({ ok: false, error: "Deck not found." }, { status: 404 });
    }
    if (deckRow.user_id !== user?.id) {
      return NextResponse.json({ ok: false, error: "You do not have access to this deck." }, { status: 403 });
    }

    deckRowFormat = deckRow.format != null ? String(deckRow.format) : null;
    if (!resolvedCommander && deckRow.commander) resolvedCommander = String(deckRow.commander).trim();
    if (resolvedColors.length === 0 && Array.isArray(deckRow.colors)) {
      resolvedColors = (deckRow.colors as string[]).map((c) => String(c));
    }
    deckAim = deckRow.deck_aim != null ? String(deckRow.deck_aim) : null;
    deckPlan = deckRow.plan != null ? String(deckRow.plan) : null;

    const fmtHint = body.format ?? deckRowFormat ?? "commander";
    const { data: cardRows } = await supabase
      .from("deck_cards")
      .select("name, qty, zone")
      .eq("deck_id", body.deckId)
      .limit(400);
    deckCardsForOwnership = cardRows as Array<{ name?: string | null; qty?: number | null }> | null;

    if (cardRows?.length) {
      deckText = rowsToDeckTextForAnalysis(
        cardRows as Array<{ name: string; qty: number; zone?: string | null }>,
        fmtHint,
      );
    } else if (!deckText && deckRow.deck_text) {
      deckText = String(deckRow.deck_text).trim();
    }
  }

  if (!deckText.trim()) {
    return NextResponse.json({ ok: false, error: "Provide deckText or a deckId with a saved list." }, { status: 400 });
  }

  const analyzeFormat = resolveFinishAnalyzeFormat(body.format, deckRowFormat);
  if (!analyzeFormat) {
    return NextResponse.json(
      { ok: false, error: "Unsupported format. Use Commander, Modern, Pioneer, Standard, or Pauper." },
      { status: 400 },
    );
  }

  const warnings: string[] = [];
  const maxSuggestions = clampMaxSuggestions(body.maxSuggestions);

  const target = computeFinishTargetStats(analyzeFormat, deckText);
  const entries = parseMainboardEntriesForAnalysis(deckText, analyzeFormat);
  const existingByNorm = aggregateExistingCounts(entries);
  let roleSummaryPrompt = "";
  try {
    const enriched = await enrichDeck(entries.map((e) => ({ name: e.name, qty: e.count })), {
      format: analyzeFormat,
      commander: resolvedCommander || null,
    });
    roleSummaryPrompt = formatRoleSummaryForPrompt(summarizeDeckRoles(enriched));
  } catch {
    roleSummaryPrompt = "";
  }

  const { text: promptDeckText, truncated } = truncateDeckTextForPrompt(deckText, MAX_DECK_ANALYZE_DECK_TEXT_CHARS);
  if (truncated) warnings.push("Decklist was truncated for AI context length.");

  const ownershipContext = await buildOwnershipContextForUserDeck({
    supabase,
    userId: user?.id,
    deckCards: deckCardsForOwnership ?? entries.map((e) => ({ name: e.name, qty: e.count })),
    sampleLimit: 24,
  });
  const ownershipPrompt = formatOwnershipContextForPrompt(ownershipContext);

  const rules = getFormatRules(analyzeFormat);
  const budgetTone =
    body.budget === "budget" ? "Prefer budget staples and lower mana bases where reasonable." :
    body.budget === "premium" ? "Premium mana bases and top-tier staples are acceptable when synergistic." :
    "Balanced upgrades — mix staples and efficient budget options.";

  const systemPrompt = [
    "You are ManaTap AI. Respond with ONLY valid JSON (no markdown outside JSON).",
    "Shape: {\"suggestions\":[{\"card\":\"Exact Card Name\",\"qty\":1,\"zone\":\"mainboard\",\"role\":\"short\",\"reason\":\"one sentence\",\"priority\":\"high|medium|low\",\"confidence\":0.85}]}",
    `Format: ${analyzeFormat}.`,
    analyzeFormat === "Commander"
      ? `Commander deck targets 100 total cards (singleton: max 1 copy per card except basic lands; exceptions: Relentless Rats-style cards).`
      : `Constructed: mainboard targets ${rules.mainDeckTarget} cards; max ${rules.maxCopies} copies per card except basic lands.`,
    `Suggest cards that are NOT already redundant at copy limit given the existing list.`,
    budgetTone,
    "When USER COLLECTION CONTEXT is present, prefer owned close-fit cards first and label those reasons with 'Owned'. Separate true purchases from owned placeholders and missing buys.",
    "Only suggest realistic, playable cards that fit the deck's apparent strategy.",
    "Use English card names as printed on the English oracle.",
    `Limit suggestions array length to at most ${maxSuggestions}.`,
  ].join("\n");

  const userPromptParts = [
    `Existing decklist (${analyzeFormat}):\n${promptDeckText}`,
    `Counts — mainboard-facing total used for completion heuristics: ${target.currentMainboardCount}; missing slots toward ${target.deckSize}-card target: ${target.missingMainboardSlots}.`,
    analyzeFormat !== "Commander"
      ? `Sideboard cards currently (non-main): ${target.currentSideboardCount}. Sideboard suggestions optional; prefer mainboard additions for this response unless clearly sideboard tech.`
      : "",
    resolvedCommander ? `Commander: ${resolvedCommander}` : "",
    resolvedColors.length ? `Color context (hints): ${resolvedColors.join(", ")}` : "",
    deckAim ? `Deck aim: ${deckAim}` : "",
    deckPlan ? `Plan/style: ${deckPlan}` : "",
    roleSummaryPrompt ? `SHARED ROLE CLASSIFIER SUMMARY:\n${roleSummaryPrompt}` : "",
    ownershipPrompt,
    `Return strictly JSON with key "suggestions" only.`,
  ].filter(Boolean);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 500 });
  }

  const tierGuest = !user;
  const modelRes = getModelForTier({
    isGuest: tierGuest,
    userId: user?.id ?? null,
    isPro,
    useCase: "deck_analysis",
  });

  const payload = prepareOpenAIBody({
    model: modelRes.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPromptParts.join("\n\n") },
    ],
    max_completion_tokens: FINISH_COMPLETION_TOKENS,
  } as Record<string, unknown>);

  let rawContent = "";
  try {
    // eslint-disable-next-line no-restricted-globals -- OpenAI streaming-compatible POST
    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.warn("[finish-suggestions] OpenAI error:", resp.status, errText.slice(0, 200));
      warnings.push("AI provider returned an error; suggestions may be empty.");
    } else {
      const data = await resp.json();
      rawContent = extractChatCompletionContent(data);
    }
  } catch (e) {
    console.warn("[finish-suggestions] fetch failed:", e);
    warnings.push("Network error calling AI.");
  }

  const parsed = parseFinishSuggestionsJson(rawContent || "{}");
  warnings.push(...parsed.warnings);

  const bannedMaps = bannedDataToMaps(await getBannedCards());
  const banNormForEval = banNormSetForUserFormat(bannedMaps, analyzeFormat);

  const rawNames = parsed.suggestions
    .map((s) => String(s.card || "").trim())
    .filter(Boolean);

  const { allowed: legalNames } = await filterSuggestedCardNamesForFormat(rawNames, analyzeFormat, {
    bannedMaps,
    logPrefix: "finish-suggestions",
  });

  const legalSet = new Set(legalNames.map((n) => normalizeCardName(n)));

  const detailNames = [...new Set([...rawNames, resolvedCommander].filter(Boolean))];
  const detailsMap = await getDetailsForNamesCached(detailNames);

  let commanderCi: string[] = [];
  if (analyzeFormat === "Commander" && resolvedCommander) {
    const k = normalizeScryfallCacheName(resolvedCommander);
    let row: SfCard | undefined = detailsMap.get(k);
    if (!row) {
      for (const [key, val] of detailsMap.entries()) {
        if (normalizeScryfallCacheName(key) === k) {
          row = val as SfCard;
          break;
        }
      }
    }
    const ci = row?.color_identity;
    if (Array.isArray(ci) && ci.length) commanderCi = ci.map((c: string) => String(c).toUpperCase());
    else if (resolvedColors.length) commanderCi = resolvedColors.map((c) => String(c).toUpperCase());
  }

  const suggestionsOut: FinishSuggestionOut[] = [];
  let skippedBadQty = 0;

  for (const raw of parsed.suggestions.slice(0, maxSuggestions + 5)) {
    const name = String(raw.card || "").trim();
    if (!name) continue;

    const qty = Math.max(1, Math.min(99, Math.floor(Number(raw.qty) || 1)));
    const zoneRaw = String(raw.zone || "mainboard").toLowerCase();
    const zone: "mainboard" | "sideboard" = zoneRaw === "sideboard" ? "sideboard" : "mainboard";

    const nk = normalizeCardName(name);
    const existing = existingByNorm.get(nk) ?? 0;
    const maxC = rules.maxCopies;
    if (!isBasicLandName(name)) {
      if (existing >= maxC) continue;
      if (existing + qty > maxC) {
        skippedBadQty++;
        continue;
      }
    }

    if (!legalSet.has(nk)) continue;

    const dk = normalizeScryfallCacheName(name);
    let detailRow: CachedSuggestionDetail | undefined = detailsMap.get(dk) as CachedSuggestionDetail | undefined;
    if (!detailRow) {
      for (const [key, val] of detailsMap.entries()) {
        if (normalizeScryfallCacheName(key) === dk) {
          detailRow = val as CachedSuggestionDetail;
          break;
        }
      }
    }

    const evalRes = evaluateCardRecommendationLegality(
      detailRow ?? null,
      dk,
      analyzeFormat,
      banNormForEval,
    );
    if (!evalRes.allowed) continue;

    if (analyzeFormat === "Commander" && commanderCi.length && detailRow) {
      if (!isWithinColorIdentity(detailRow as SfCard, commanderCi)) {
        warnings.push(`Skipped off-color suggestion: ${name}`);
        continue;
      }
    }

    const conf = typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.7;

    const ownership = annotateOwnership(ownershipContext, name);

    suggestionsOut.push({
      card: name,
      qty,
      zone,
      role: typeof raw.role === "string" && raw.role.trim() ? raw.role.trim().slice(0, 120) : "Synergy",
      reason: appendOwnershipToReason(
        typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim().slice(0, 400) : "",
        ownership,
      ),
      priority: normalizePriority(raw.priority),
      confidence: conf,
      legality: "legal",
      ownership: ownership.ownership,
      ownedQty: ownership.ownedQty,
      source: "ai",
    });

    if (suggestionsOut.length >= maxSuggestions) break;
  }

  if (skippedBadQty) warnings.push(`${skippedBadQty} suggestion(s) skipped due to copy limits.`);

  /** Estimated USD from price_cache (best-effort). */
  if (suggestionsOut.length) {
    try {
      const keys = [...new Set(suggestionsOut.map((s) => normalizePriceCacheCardName(s.card)))];
      const { data: prices } = await supabase.from("price_cache").select("card_name, usd_price").in("card_name", keys);
      const priceByKey = new Map<string, number>();
      for (const row of prices ?? []) {
        const cn = (row as { card_name?: string; usd_price?: number }).card_name;
        const usd = Number((row as { usd_price?: number }).usd_price);
        if (cn && Number.isFinite(usd)) priceByKey.set(String(cn), usd);
      }
      for (const s of suggestionsOut) {
        const k = normalizePriceCacheCardName(s.card);
        const p = priceByKey.get(k);
        if (p != null && Number.isFinite(p)) {
          s.estimatedUsd = Math.round(p * s.qty * 100) / 100;
        }
      }
    } catch {
      /* ignore */
    }
  }

  try {
    let anonId: string | null = null;
    if (user?.id) {
      const { hashString } = await import("@/lib/guest-tracking");
      anonId = await hashString(user.id);
    } else {
      const { cookies } = await import("next/headers");
      const guestToken = (await cookies()).get("guest_session_token")?.value;
      if (guestToken) {
        const { hashGuestToken } = await import("@/lib/guest-tracking");
        anonId = await hashGuestToken(guestToken);
      }
    }

    const { recordAiUsage } = await import("@/lib/ai/log-usage");
    await recordAiUsage({
      user_id: user?.id ?? null,
      anon_id: anonId,
      thread_id: null,
      model: modelRes.model,
      input_tokens: Math.ceil((systemPrompt.length + userPromptParts.join("\n").length) / 4),
      output_tokens: Math.ceil(rawContent.length / 4),
      cost_usd: 0,
      route: "deck_finish_suggestions",
      format_key: analyzeFormat,
      deck_card_count: target.currentMainboardCount,
      deck_id: typeof body.deckId === "string" ? body.deckId : null,
      latency_ms: Date.now() - t0,
      model_tier: modelRes.tier,
      user_tier: modelRes.tierLabel,
      is_guest: tierGuest,
      request_kind: "FULL_LLM",
      layer0_mode: "FULL_LLM",
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({
    ok: true,
    format: analyzeFormat,
    ...(resolvedCommander ? { commander: resolvedCommander } : {}),
    target: {
      deckSize: target.deckSize,
      currentMainboardCount: target.currentMainboardCount,
      currentSideboardCount: target.currentSideboardCount,
      missingMainboardSlots: target.missingMainboardSlots,
    },
    suggestions: suggestionsOut,
    warnings,
    meta: {
      route: "deck.finish-suggestions",
      generated_at: new Date().toISOString(),
      model: modelRes.model,
    },
  });
}
