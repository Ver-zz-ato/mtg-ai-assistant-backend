import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/server-supabase";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetchAllRows";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { sanitizeName } from "@/lib/profanity";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { GENERATE_FROM_COLLECTION_FREE, GENERATE_FROM_COLLECTION_PRO } from "@/lib/feature-limits";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import { extractChatCompletionContent } from "@/lib/deck/generation-helpers";
import { filterSuggestedCardNamesForFormat } from "@/lib/deck/recommendation-legality";
import { costUSD } from "@/lib/ai/pricing";
import { recordAiUsage } from "@/lib/ai/log-usage";
import {
  aggregateCollectionQtyRows,
  preparePromptCardSample,
} from "@/lib/deck/collectionConstructedIdeasPrep";

const ROUTE_PATH = "/api/deck/collection-constructed-ideas";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const COMPLETION_TOKENS = 4096;

export const runtime = "nodejs";

const formatEnum = z.enum(["Modern", "Pioneer", "Standard", "Pauper"]);
const buildEnum = z.enum(["collection_only", "mostly_collection", "best_with_missing"]);
const directionEnum = z.enum(["competitive", "casual", "budget", "theme"]);

const requestSchema = z.object({
  collectionId: z.string().uuid(),
  format: formatEnum,
  buildMode: buildEnum,
  direction: directionEnum,
  preferences: z
    .object({
      colors: z.array(z.string().max(4)).max(8).optional(),
      archetype: z.string().max(200).optional(),
      include: z.string().max(2000).optional(),
      avoid: z.string().max(2000).optional(),
      notes: z.string().max(8000).optional(),
    })
    .optional(),
});

const aiIdeaInner = z.object({
  title: z.string().max(220),
  archetype: z.string().max(120).optional(),
  colors: z.array(z.string().max(4)).optional(),
  ownedCoreCards: z.array(z.string().max(200)).optional(),
  missingKeyCards: z.array(z.string().max(200)).optional(),
  reason: z.string().max(3000).optional(),
  warnings: z.array(z.string()).optional(),
});

const aiResponseInner = z.object({
  ideas: z.array(aiIdeaInner).min(1).max(5),
});

export type IdeaFormatSlug = "modern" | "pioneer" | "standard" | "pauper";

export type CollectionDeckIdeaPayload = {
  id: string;
  title: string;
  format: IdeaFormatSlug;
  colors: string[];
  archetype: string;
  direction: string;
  ownedCoreCards: string[];
  missingKeyCards: string[];
  estimatedOwnedPercent: null;
  estimatedMissingCost: null;
  reason: string;
  warnings: string[];
};

function formatToSlug(fmt: z.infer<typeof formatEnum>): IdeaFormatSlug {
  return fmt.toLowerCase() as IdeaFormatSlug;
}

function normalizeColorLetters(colors: unknown): string[] {
  if (!Array.isArray(colors)) return [];
  const out: string[] = [];
  const allowed = new Set(["W", "U", "B", "R", "G"]);
  for (const c of colors) {
    const s = String(c ?? "")
      .trim()
      .toUpperCase();
    const letters = s.replace(/[^WUBRG]/g, "");
    for (const ch of letters) {
      if (allowed.has(ch) && !out.includes(ch)) out.push(ch);
    }
  }
  return out;
}

async function resolveAndFilterIdeaCards(params: {
  ownedRaw: string[];
  missingRaw: string[];
  ownerNormKeys: Set<string>;
  ownerNormToDisplay: Map<string, string>;
  formatLabel: string;
}): Promise<{
  ownedCoreCards: string[];
  missingKeyCards: string[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const { ownerNormKeys, ownerNormToDisplay, formatLabel } = params;

  const ownedCoreCards: string[] = [];
  const ownedNormSeen = new Set<string>();
  for (const raw of params.ownedRaw) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    const nk = normalizeScryfallCacheName(t);
    if (ownerNormKeys.has(nk)) {
      const disp = ownerNormToDisplay.get(nk) ?? t;
      if (!ownedNormSeen.has(nk)) {
        ownedNormSeen.add(nk);
        ownedCoreCards.push(disp);
      }
    } else {
      warnings.push(`"${t}" is not in this collection (removed from owned core list).`);
    }
  }

  const missingCandidates: string[] = [];
  for (const raw of params.missingRaw) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    const nk = normalizeScryfallCacheName(t);
    if (ownerNormKeys.has(nk)) {
      warnings.push(`"${t}" was listed as missing but is owned — dropped from missing list.`);
      continue;
    }
    missingCandidates.push(t);
  }

  const { allowed: legalMissing } = await filterSuggestedCardNamesForFormat(missingCandidates, formatLabel);
  const legalNormMissing = new Set(legalMissing.map((n) => normalizeScryfallCacheName(n)));
  const missingKeyCards: string[] = [];
  for (const t of missingCandidates) {
    const nk = normalizeScryfallCacheName(t);
    if (legalNormMissing.has(nk)) {
      if (!missingKeyCards.some((x) => normalizeScryfallCacheName(x) === nk)) {
        missingKeyCards.push(t);
      }
    } else {
      warnings.push(`"${t}" is not legal in ${formatLabel} or could not be verified (removed from missing list).`);
    }
  }

  let ownedFinal = ownedCoreCards;
  if (ownedFinal.length) {
    const { allowed: legalOwned } = await filterSuggestedCardNamesForFormat(ownedFinal, formatLabel);
    const allowNorm = new Set(legalOwned.map((n) => normalizeScryfallCacheName(n)));
    const dropped = ownedFinal.filter((n) => !allowNorm.has(normalizeScryfallCacheName(n)));
    for (const d of dropped) {
      warnings.push(`"${d}" is not legal in ${formatLabel} (removed from owned core list).`);
    }
    ownedFinal = legalOwned.filter(
      (n, i, arr) => arr.findIndex((x) => normalizeScryfallCacheName(x) === normalizeScryfallCacheName(n)) === i
    );
  }

  return { ownedCoreCards: ownedFinal, missingKeyCards, warnings };
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    let supabase = await createClient();
    const { data: userResp } = await supabase.auth.getUser();
    let user = userResp?.user;

    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const {
          data: { user: bearerUser },
        } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsedReq = requestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return NextResponse.json(
        { ok: false, error: "validation_error", details: parsedReq.error.flatten() },
        { status: 400 }
      );
    }
    const body = parsedReq.data;
    const formatLabel = body.format;

    let isPro = false;
    try {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(user.id);
    } catch {
      /* ignore */
    }
    const dailyLimit = isPro ? GENERATE_FROM_COLLECTION_PRO : GENERATE_FROM_COLLECTION_FREE;
    const keyHash = `user:${user.id}`;
    try {
      const durableLimit = await checkDurableRateLimit(supabase, keyHash, ROUTE_PATH, dailyLimit, 1);
      if (!durableLimit.allowed) {
        const errMsg = isPro
          ? "You've reached your daily limit. Contact support if you need higher limits."
          : `You've used your ${GENERATE_FROM_COLLECTION_FREE} free deck generations today. Upgrade to Pro for more!`;
        return NextResponse.json(
          {
            ok: false,
            code: "RATE_LIMIT_DAILY",
            error: errMsg,
            resetAt: durableLimit.resetAt,
            remaining: 0,
          },
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      console.error("[collection-constructed-ideas] Rate limit check failed:", e);
    }

    const { data: col } = await supabase
      .from("collections")
      .select("id, user_id")
      .eq("id", body.collectionId)
      .maybeSingle();
    if (!col || col.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Collection not found or access denied" }, { status: 403 });
    }

    const rows = await fetchAllSupabaseRows<{ name: string; qty: number | null }>(() =>
      supabase
        .from("collection_cards")
        .select("name, qty")
        .eq("collection_id", body.collectionId)
        .order("id", { ascending: true })
    );

    const aggregated = aggregateCollectionQtyRows(rows);
    if (aggregated.length === 0) {
      return NextResponse.json({ ok: false, error: "This collection has no cards." }, { status: 400 });
    }

    const prep = await preparePromptCardSample(aggregated, formatLabel);
    if (!prep.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Not enough format-legal collection cards found for this format.",
        },
        { status: 400 }
      );
    }

    const prefs = body.preferences ?? {};
    const prefColors = normalizeColorLetters(prefs.colors ?? []);
    const prefLines: string[] = [];
    if (prefColors.length) prefLines.push(`Preferred colors: ${prefColors.join("")}.`);
    if (prefs.archetype?.trim()) prefLines.push(`Archetype / theme: ${prefs.archetype.trim()}.`);
    if (prefs.include?.trim()) prefLines.push(`Cards to lean on or include: ${prefs.include.trim()}.`);
    if (prefs.avoid?.trim()) prefLines.push(`Cards to avoid: ${prefs.avoid.trim()}.`);
    if (prefs.notes?.trim()) prefLines.push(`Notes: ${prefs.notes.trim()}.`);

    const buildModeHint =
      body.buildMode === "collection_only"
        ? "Use ONLY cards the user owns (listed). Do not treat missing cards as part of the game plan except briefly in missingKeyCards."
        : body.buildMode === "mostly_collection"
          ? "Bias heavily toward owned cards; missingKeyCards may list a few format staples they likely need."
          : "Optimize power: ownedCoreCards from their list, missingKeyCards can name competitive pieces they do not own.";

    const directionHint =
      body.direction === "competitive"
        ? "Competitive / tournament-style direction."
        : body.direction === "casual"
          ? "Casual / fun direction."
          : body.direction === "budget"
            ? "Budget-conscious direction."
            : "Thematic or archetype-first direction.";

    const systemPrompt = `You are an expert Magic: The Gathering deck designer for 60-card constructed formats (mainboard only in this step — no sideboard lists).

Output a single JSON object with key "ideas" (array of exactly 3 objects). No markdown, no commentary outside JSON.

Each idea must include:
- title: short deck title
- archetype: short label
- colors: array of color letters from the deck (subset of W,U,B,R,G)
- ownedCoreCards: 4–10 card names that appear in the user's owned list and anchor the strategy
- missingKeyCards: 0–8 card names NOT in the owned list that would be important purchases or crafts (may be empty if buildMode is collection_only)
- reason: 2–4 sentences explaining the plan and how it uses their collection
- warnings: optional strings (e.g. manabase risks)

Rules:
- Every name in ownedCoreCards MUST be copied from the provided owned card list (exact Oracle name as listed).
- Cards in missingKeyCards must NOT appear in the owned list.
- Respect the format's card pool; use only real MTG card names.
- Do not include Commander-specific cards or deck construction rules.`;

    const userPrompt = `Format: ${formatLabel} (60-card constructed; sideboard not generated in this step).

Build mode: ${body.buildMode}. ${buildModeHint}

Play direction: ${body.direction}. ${directionHint}

${prefLines.join("\n")}

Owned cards (PRIORITIZE these — sample of their collection, ordered by importance; total collection may be larger):
${prep.promptLines}

Respond with JSON: { "ideas": [ {...}, {...}, {...} ] }`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 500 });
    }

    const tierRes = getModelForTier({
      isGuest: false,
      userId: user.id,
      isPro,
      useCase: "deck_analysis",
    });
    const { model } = tierRes;

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const payload = prepareOpenAIBody({
      model,
      messages,
      max_completion_tokens: COMPLETION_TOKENS,
      temperature: 0.65,
      response_format: { type: "json_object" },
    } as Record<string, unknown>);

    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[collection-constructed-ideas] OpenAI error:", resp.status, errText);
      return NextResponse.json({ ok: false, error: "Ideas generation failed" }, { status: 502 });
    }

    const data = await resp.json();
    const messageContent = extractChatCompletionContent(data);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(messageContent);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid AI response" }, { status: 502 });
    }

    const parsedAi = aiResponseInner.safeParse(parsedJson);
    if (!parsedAi.success) {
      return NextResponse.json({ ok: false, error: "Could not parse ideas from AI" }, { status: 502 });
    }

    const metaNotes: string[] = [];
    let ideasRaw = parsedAi.data.ideas.slice(0, 3);
    if (parsedAi.data.ideas.length < 3) {
      metaNotes.push("The model returned fewer than three ideas; shorter list returned.");
    }

    const fmtSlug = formatToSlug(formatLabel);
    const ideasOut: CollectionDeckIdeaPayload[] = [];

    for (const idea of ideasRaw) {
      const ownedRaw = idea.ownedCoreCards ?? [];
      const missingRaw = idea.missingKeyCards ?? [];
      const resolved = await resolveAndFilterIdeaCards({
        ownedRaw,
        missingRaw,
        ownerNormKeys: prep.ownerNormKeys,
        ownerNormToDisplay: prep.ownerNormToDisplay,
        formatLabel,
      });
      const title = sanitizeName(idea.title.trim().slice(0, 120), 120);
      const archetype = (idea.archetype ?? "").trim().slice(0, 120) || "General";
      let colors = normalizeColorLetters(idea.colors ?? []);
      if (!colors.length && prefColors.length) colors = prefColors;

      const mergeWarnings = [...(idea.warnings ?? []).map((w) => w.trim()).filter(Boolean), ...resolved.warnings];

      ideasOut.push({
        id: randomUUID(),
        title,
        format: fmtSlug,
        colors,
        archetype,
        direction: body.direction,
        ownedCoreCards: resolved.ownedCoreCards,
        missingKeyCards: resolved.missingKeyCards,
        estimatedOwnedPercent: null,
        estimatedMissingCost: null,
        reason: (idea.reason ?? "").trim().slice(0, 3000) || "—",
        warnings: mergeWarnings,
      });
    }

    const inputTokEst = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    const outputTokEst = Math.ceil(messageContent.length / 4);
    try {
      const { hashString } = await import("@/lib/guest-tracking");
      const anonId = await hashString(user.id);
      await recordAiUsage({
        user_id: user.id,
        anon_id: anonId,
        thread_id: null,
        model,
        input_tokens: inputTokEst,
        output_tokens: outputTokEst,
        cost_usd: costUSD(model, inputTokEst, outputTokEst),
        route: "deck_collection_constructed_ideas",
        prompt_preview: userPrompt.slice(0, 800),
        response_preview: messageContent.slice(0, 800),
        format_key: formatLabel,
        deck_card_count: ideasOut.length * 20,
        latency_ms: Date.now() - t0,
        model_tier: tierRes.tier,
        user_tier: tierRes.tierLabel,
        is_guest: false,
        request_kind: "FULL_LLM",
        layer0_mode: "FULL_LLM",
      });
    } catch (e) {
      console.warn("[collection-constructed-ideas] recordAiUsage failed:", e);
    }

    return NextResponse.json({
      ok: true,
      ideas: ideasOut,
      meta: {
        collectionSampleSize: prep.collectionSampleSize,
        notes: metaNotes,
      },
    });
  } catch (e: unknown) {
    console.error("[collection-constructed-ideas]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
