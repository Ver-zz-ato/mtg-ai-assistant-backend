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
import {
  parseCollectionConstructedIdeasFromMessage,
  stripMarkdownJsonFences,
} from "@/lib/deck/collectionConstructedIdeasParse";

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
          code: "NOT_ENOUGH_LEGAL_COLLECTION_CARDS",
          error: `Not enough format-legal cards in this collection for ${formatLabel}.`,
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

Return ONLY valid JSON. No markdown code fences. No commentary before or after the JSON.

The root object MUST be exactly:
{ "ideas": [ idea, idea, idea ] }

Include exactly 3 objects in "ideas". Each idea object MUST use these keys:
- "title": string (short deck name)
- "archetype": string
- "colors": array of color letters, each one of "W","U","B","R","G"
- "ownedCoreCards": array of strings (4–10 card names copied EXACTLY from the provided owned list)
- "missingKeyCards": array of strings (0–8 names not in the owned list; may be empty if buildMode is collection_only)
- "reason": string (keep under ~600 characters)
- "warnings": array of strings (optional; may be empty)

Rules:
- Every string in ownedCoreCards MUST match a line in the provided owned card list (exact Oracle name as listed).
- Names in missingKeyCards must NOT appear in the owned list.
- Use only real MTG card names legal in the requested format where possible.
- Do not describe Commander decks or Commander-only rules.`;

    const userPrompt = `Format: ${formatLabel} (60-card constructed; sideboard not generated in this step).

Build mode: ${body.buildMode}. ${buildModeHint}

Play direction: ${body.direction}. ${directionHint}

${prefLines.join("\n")}

Owned cards (prioritize — sample of their collection; full collection may be larger):
${prep.promptLines}`;

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
    let messageContent = extractChatCompletionContent(data);
    let parsedIdeasResult = parseCollectionConstructedIdeasFromMessage(messageContent);
    let didRepair = false;
    const firstPassLen = messageContent.length;
    let repairPromptChars = 0;

    if (!parsedIdeasResult.ok) {
      console.warn(
        "[collection-constructed-ideas] Initial JSON parse:",
        parsedIdeasResult.reason,
        "contentLen=",
        firstPassLen
      );
      didRepair = true;
      const repairSystem = `You repair invalid or partial JSON. Return ONLY valid JSON.

The root object MUST be: { "ideas": [ ... ] } with 1 to 3 idea objects.
Each idea MUST have keys: "title", "archetype", "colors" (array of W/U/B/R/G letters as strings), "ownedCoreCards" (string array), "missingKeyCards" (string array), "reason" (string), "warnings" (string array).
No markdown. No commentary.`;
      const repairUser = `Fix the following into valid JSON matching the schema. Use empty strings or empty arrays only when necessary.\n\n${stripMarkdownJsonFences(messageContent).slice(0, 14000)}`;
      repairPromptChars = repairSystem.length + repairUser.length;

      const repairPayload = prepareOpenAIBody({
        model,
        messages: [
          { role: "system", content: repairSystem },
          { role: "user", content: repairUser },
        ],
        max_completion_tokens: COMPLETION_TOKENS,
        temperature: 0.15,
        response_format: { type: "json_object" },
      } as Record<string, unknown>);

      const repairResp = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(repairPayload),
      });

      if (!repairResp.ok) {
        const errText = await repairResp.text();
        console.error("[collection-constructed-ideas] Repair OpenAI error:", repairResp.status, errText.slice(0, 500));
        return NextResponse.json(
          { ok: false, code: "AI_IDEA_PARSE_FAILED", error: "Could not read ideas from the model." },
          { status: 502 }
        );
      }

      const repairData = await repairResp.json();
      messageContent = extractChatCompletionContent(repairData);
      parsedIdeasResult = parseCollectionConstructedIdeasFromMessage(messageContent);
    }

    if (!parsedIdeasResult.ok) {
      console.error("[collection-constructed-ideas] Parse failed after repair:", parsedIdeasResult.reason);
      return NextResponse.json(
        { ok: false, code: "AI_IDEA_PARSE_FAILED", error: "Could not read ideas from the model." },
        { status: 502 }
      );
    }

    const allParsed = parsedIdeasResult.ideas;
    const metaNotes: string[] = [];
    if (allParsed.length > 3) {
      metaNotes.push("Showing the first three ideas.");
    }
    if (allParsed.length < 3) {
      metaNotes.push("The model returned fewer than three ideas; shorter list returned.");
    }
    const ideasRaw = allParsed.slice(0, 3);

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
      const displayTitle = title || `Deck idea ${ideasOut.length + 1}`;
      const archetype = (idea.archetype ?? "").trim().slice(0, 120) || "General";
      let colors = normalizeColorLetters(idea.colors ?? []);
      if (!colors.length && prefColors.length) colors = prefColors;

      const mergeWarnings = [...(idea.warnings ?? []).map((w) => w.trim()).filter(Boolean), ...resolved.warnings];

      ideasOut.push({
        id: randomUUID(),
        title: displayTitle,
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

    if (ideasOut.length === 0) {
      return NextResponse.json(
        { ok: false, code: "NO_USABLE_IDEAS", error: "No usable deck ideas could be produced." },
        { status: 502 }
      );
    }

    const inputTokEst =
      Math.ceil((systemPrompt.length + userPrompt.length) / 4) +
      (didRepair ? Math.ceil(repairPromptChars / 4) : 0);
    const outputTokEst = Math.ceil((didRepair ? firstPassLen + messageContent.length : messageContent.length) / 4);
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
