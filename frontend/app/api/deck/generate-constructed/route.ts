import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/server-supabase";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { costUSD } from "@/lib/ai/pricing";
import { recordAiUsage } from "@/lib/ai/log-usage";
import {
  aggregateCards,
  extractChatCompletionContent,
  parseAiDeckOutputLines,
  totalDeckQty,
  trimDeckToMaxQty,
} from "@/lib/deck/generation-helpers";
import {
  filterExplanationBulletsForDeck,
  filterWarningsForDeck,
  logConstructedDiag,
  padMainboardNearSixty,
  padSideboardTowardFifteen,
  parseConstructedAiJsonDetailed,
} from "@/lib/deck/generate-constructed-post";
import { filterDecklistQtyRowsForFormat } from "@/lib/deck/recommendation-legality";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import {
  buildConstructedRepairRetryPrompt,
  buildConstructedSystemPrompt,
  buildConstructedUserPrompt,
  type ConstructedPromptInput,
} from "@/lib/prompts/generate-constructed";
import {
  GENERATE_CONSTRUCTED_FREE,
  GENERATE_CONSTRUCTED_GUEST,
  GENERATE_CONSTRUCTED_PRO,
} from "@/lib/feature-limits";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";

export const runtime = "nodejs";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const COMPLETION_TOKENS = 8192;

const constructedBodySchema = z.object({
  format: z.enum(["Modern", "Pioneer", "Standard", "Pauper"]),
  colors: z.array(z.string().min(1).max(12)).max(8).optional(),
  archetype: z.string().max(120).optional(),
  budget: z.enum(["budget", "balanced", "premium"]).optional(),
  powerLevel: z.enum(["casual", "strong", "competitive"]).optional(),
  ownedCards: z.array(z.string().max(200)).max(200).optional(),
  notes: z.string().max(4000).optional(),
});

/** Same normalization as `app/api/deck/finish-suggestions/route.ts` for `price_cache.card_name`. */
function normalizePriceCacheCardName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeColorLetters(colors: unknown): string[] {
  if (!Array.isArray(colors)) return [];
  const out: string[] = [];
  const allowed = new Set(["W", "U", "B", "R", "G"]);
  for (const c of colors) {
    const s = String(c || "")
      .trim()
      .toUpperCase();
    const letters = s.replace(/[^WUBRG]/g, "");
    for (const ch of letters) {
      if (allowed.has(ch) && !out.includes(ch)) out.push(ch);
    }
  }
  return out;
}

function linesFromAiField(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
}

async function estimateDeckPriceUsd(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Array<{ name: string; qty: number }>
): Promise<number | null> {
  if (!rows.length) return null;
  try {
    const uniqKeys = [...new Set(rows.map((r) => normalizePriceCacheCardName(r.name)))];
    const priceByKey = new Map<string, number>();
    const chunkSize = 120;
    for (let i = 0; i < uniqKeys.length; i += chunkSize) {
      const slice = uniqKeys.slice(i, i + chunkSize);
      const { data: prices } = await supabase.from("price_cache").select("card_name, usd_price").in("card_name", slice);
      for (const row of prices ?? []) {
        const cn = (row as { card_name?: string; usd_price?: number | null }).card_name;
        const usd = Number((row as { usd_price?: number | null }).usd_price);
        if (cn && Number.isFinite(usd)) priceByKey.set(String(cn), usd);
      }
    }
    let sum = 0;
    let anyPrice = false;
    for (const r of rows) {
      const k = normalizePriceCacheCardName(r.name);
      const p = priceByKey.get(k);
      if (p != null && Number.isFinite(p)) {
        sum += p * Math.max(0, r.qty);
        anyPrice = true;
      }
    }
    return anyPrice ? Math.round(sum * 100) / 100 : null;
  } catch {
    return null;
  }
}

async function filterConstructedLists(
  formatLabel: string,
  mainLines: string[],
  sideLines: string[]
): Promise<{
  mainRows: Array<{ name: string; qty: number }>;
  sideRows: Array<{ name: string; qty: number }>;
  removedTotal: number;
}> {
  const mainRowsRaw = aggregateCards(parseAiDeckOutputLines(mainLines.join("\n")));
  const sideRowsRaw = aggregateCards(parseAiDeckOutputLines(sideLines.join("\n")));

  const fm = await filterDecklistQtyRowsForFormat(mainRowsRaw, formatLabel, {
    logPrefix: "/api/deck/generate-constructed main",
  });
  const fs = await filterDecklistQtyRowsForFormat(sideRowsRaw, formatLabel, {
    logPrefix: "/api/deck/generate-constructed side",
  });

  return {
    mainRows: trimDeckToMaxQty(fm.lines, 60),
    sideRows: trimDeckToMaxQty(fs.lines, 15),
    removedTotal: fm.removed.length + fs.removed.length,
  };
}

type QtyRow = { name: string; qty: number };

function needsUnifiedRepair(params: {
  mainQty: number;
  sideQty: number;
  removedTotal: number;
  colorRatio: number;
  requestDeckColorsLen: number;
}): boolean {
  const { mainQty, sideQty, removedTotal, colorRatio, requestDeckColorsLen } = params;
  if (mainQty < 58) return true;
  if (sideQty < 10) return true;
  if (removedTotal >= 10) return true;
  if (requestDeckColorsLen > 0 && colorRatio > 0.25) return true;
  return false;
}

/**
 * null = cache miss / unknown — keep row (best effort).
 * true = within identity; false = off-color.
 */
function rowMatchesDeckColors(
  details: Map<string, unknown>,
  cardName: string,
  allowed: Set<string>
): boolean | null {
  const k = normalizeScryfallCacheName(cardName.trim());
  let raw: unknown = details.get(k);
  if (!raw) {
    for (const [key, val] of details.entries()) {
      if (normalizeScryfallCacheName(key) === k) {
        raw = val;
        break;
      }
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const ci = (raw as { color_identity?: string[] | null }).color_identity;
  if (!ci || ci.length === 0) return true;
  return ci.every((c) => allowed.has(String(c).toUpperCase()));
}

/**
 * Drop main/side rows not contained in `allowedLetters` (subset on color_identity).
 * Only runs when `allowedLetters` is non-empty.
 */
async function filterQtyRowsByDeckColors(
  mainRows: QtyRow[],
  sideRows: QtyRow[],
  allowedLetters: string[]
): Promise<{ mainRows: QtyRow[]; sideRows: QtyRow[]; removedQty: number }> {
  const allowed = new Set(
    allowedLetters.map((c) => c.toUpperCase()).filter((c) => "WUBRG".includes(c))
  );
  if (allowed.size === 0) {
    return { mainRows, sideRows, removedQty: 0 };
  }

  const uniq = [...new Set([...mainRows.map((r) => r.name), ...sideRows.map((r) => r.name)])];
  const details = await getDetailsForNamesCached(uniq);

  let removedQty = 0;

  function filterRows(rows: QtyRow[]): QtyRow[] {
    const out: QtyRow[] = [];
    for (const line of rows) {
      const m = rowMatchesDeckColors(details, line.name, allowed);
      if (m === false) {
        removedQty += Math.max(0, Number(line.qty) || 0);
        continue;
      }
      out.push(line);
    }
    return out;
  }

  return {
    mainRows: filterRows(mainRows),
    sideRows: filterRows(sideRows),
    removedQty,
  };
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

    let isPro = false;
    if (user) {
      try {
        const { checkProStatus } = await import("@/lib/server-pro-check");
        isPro = await checkProStatus(user.id);
      } catch {
        /* ignore */
      }
    }

    const { isAdmin } = await import("@/lib/admin-check");
    const isAdminUser = Boolean(user && isAdmin(user));

    if (!isAdminUser) {
      try {
        const { hashString, hashGuestToken } = await import("@/lib/guest-tracking");
        const { cookies } = await import("next/headers");

        let keyHash: string;
        let dailyLimit: number;

        if (user) {
          keyHash = `user:${await hashString(user.id)}`;
          dailyLimit = isPro ? GENERATE_CONSTRUCTED_PRO : GENERATE_CONSTRUCTED_FREE;
        } else {
          const cookieStore = await cookies();
          const guestToken = cookieStore.get("guest_session_token")?.value;
          if (guestToken) {
            const tokenHash = await hashGuestToken(guestToken);
            keyHash = `guest:${tokenHash}`;
          } else {
            const forwarded = req.headers.get("x-forwarded-for");
            const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "unknown";
            keyHash = `ip:${await hashString(ip)}`;
          }
          dailyLimit = GENERATE_CONSTRUCTED_GUEST;
        }

        const durableLimit = await checkDurableRateLimit(
          supabase,
          keyHash,
          "/api/deck/generate-constructed",
          dailyLimit,
          1
        );
        if (!durableLimit.allowed) {
          const errMsg = user
            ? isPro
              ? "You've reached your daily limit for AI constructed decks. Contact support if you need higher limits."
              : `You've used your ${GENERATE_CONSTRUCTED_FREE} free AI constructed deck generation today. Upgrade to Pro for more!`
            : `You've used your guest allowance for AI constructed decks. Sign in for more!`;
          return NextResponse.json(
            {
              ok: false,
              code: "RATE_LIMIT_DAILY",
              error: errMsg,
              resetAt: durableLimit.resetAt,
              remaining: 0,
            },
            { status: 429 }
          );
        }
      } catch (e) {
        console.error("[generate-constructed] Rate limit check failed:", e);
      }
    }

    const { allowAIRequest } = await import("@/lib/server/budgetEnforcement");
    const budgetCheck = await allowAIRequest(supabase);
    if (!budgetCheck.allow) {
      return NextResponse.json(
        { ok: false, code: "BUDGET_LIMIT", error: budgetCheck.reason ?? "AI budget limit reached. Try again later." },
        { status: 429 }
      );
    }

    const { checkMaintenance } = await import("@/lib/maintenance-check");
    const maint = await checkMaintenance();
    if (maint.enabled) {
      return NextResponse.json({ ok: false, code: "maintenance", error: maint.message }, { status: 503 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = constructedBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const formatLabel = body.format;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 500 });
    }

    const tierRes = getModelForTier({
      isGuest: !user,
      userId: user?.id ?? null,
      isPro,
      useCase: "deck_analysis",
    });
    const model = tierRes.model;

    const promptInput: ConstructedPromptInput = {
      format: formatLabel,
      colors: body.colors,
      archetype: body.archetype,
      budget: body.budget,
      powerLevel: body.powerLevel,
      ownedCards: body.ownedCards,
      notes: body.notes,
    };

    const systemPrompt = buildConstructedSystemPrompt(formatLabel);
    const userPrompt = buildConstructedUserPrompt(promptInput);

    const baseMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const runCompletion = async (messages: Array<{ role: string; content: string }>) => {
      const payload = prepareOpenAIBody({
        model,
        messages,
        max_completion_tokens: COMPLETION_TOKENS,
        response_format: { type: "json_object" },
      } as Record<string, unknown>);
      // eslint-disable-next-line no-restricted-globals -- OpenAI Chat Completions (vendor endpoint; not JSON helpers)
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
        console.error("[generate-constructed] OpenAI error:", resp.status, errText);
        return { ok: false as const, content: "" };
      }
      const data = await resp.json();
      const messageContent = extractChatCompletionContent(data);
      return { ok: true as const, content: messageContent };
    };

    const completionRecord = await runCompletion(baseMessages);
    if (!completionRecord.ok) {
      return NextResponse.json({ ok: false, error: "GENERATION_FAILED" }, { status: 502 });
    }

    let rawAiContent = completionRecord.content;
    let didRepairRetry = false;

    /** Final assistant JSON string passed to pricing/recording (possibly repair pass). */
    let completionContentForUsage = rawAiContent;

    let aiParsed: Record<string, unknown>;
    let mainRows: QtyRow[];
    let sideRows: QtyRow[];
    let removedTotal = 0;
    let colorIdentityRemovedQty = 0;
    let initialMainQty = 0;
    let initialSideQty = 0;

    /** Subset filter on Scryfall `color_identity` when client supplied deck colors (constructed registration). */
    const requestDeckColors = normalizeColorLetters(body.colors);

    while (true) {
      const pr = parseConstructedAiJsonDetailed(rawAiContent);
      if (!pr.ok) {
        logConstructedDiag({
          phase: "parse_failed",
          format: formatLabel,
          archetype: body.archetype?.slice(0, 120),
          requestedColors: requestDeckColors.join("") || undefined,
          parseError: pr.error,
          failureStage: "parse",
          standardDiag: formatLabel === "Standard" ? true : undefined,
        });
        return NextResponse.json({ ok: false, error: "GENERATION_FAILED" }, { status: 502 });
      }

      aiParsed = pr.data;
      const mbRaw = aiParsed.mainboard;
      if (!Array.isArray(mbRaw) || mbRaw.length === 0) {
        logConstructedDiag({
          phase: "missing_mainboard_array",
          format: formatLabel,
          archetype: body.archetype?.slice(0, 120),
          requestedColors: requestDeckColors.join("") || undefined,
          failureStage: "parse",
          standardDiag: formatLabel === "Standard" ? true : undefined,
        });
        return NextResponse.json({ ok: false, error: "GENERATION_FAILED" }, { status: 502 });
      }

      const mainLines = linesFromAiField(mbRaw);
      const sideLines = linesFromAiField(aiParsed.sideboard);

      const initialAggMain = aggregateCards(parseAiDeckOutputLines(mainLines.join("\n")));
      const initialAggSide = aggregateCards(parseAiDeckOutputLines(sideLines.join("\n")));
      initialMainQty = totalDeckQty(initialAggMain);
      initialSideQty = totalDeckQty(initialAggSide);

      const filtered = await filterConstructedLists(formatLabel, mainLines, sideLines);
      removedTotal = filtered.removedTotal;

      const postLegalityMainQty = totalDeckQty(filtered.mainRows);
      const postLegalitySideQty = totalDeckQty(filtered.sideRows);

      mainRows = filtered.mainRows;
      sideRows = filtered.sideRows;
      colorIdentityRemovedQty = 0;

      const beforeIdentityQty = totalDeckQty(mainRows) + totalDeckQty(sideRows);

      if (requestDeckColors.length > 0) {
        const ciOut = await filterQtyRowsByDeckColors(mainRows, sideRows, requestDeckColors);
        mainRows = ciOut.mainRows;
        sideRows = ciOut.sideRows;
        colorIdentityRemovedQty = ciOut.removedQty;
      }

      const snapMainQty = totalDeckQty(mainRows);
      const snapSideQty = totalDeckQty(sideRows);

      const colorRatio = beforeIdentityQty > 0 ? colorIdentityRemovedQty / beforeIdentityQty : 0;

      logConstructedDiag({
        phase: "post_filter_snapshot",
        format: formatLabel,
        archetype: body.archetype?.slice(0, 120),
        requestedColors: requestDeckColors.join("") || undefined,
        initialMainQty,
        initialSideQty,
        postLegalityMainQty,
        postLegalitySideQty,
        postFilterMainQty: snapMainQty,
        postFilterSideQty: snapSideQty,
        legalityRemovals: removedTotal,
        colorRemovals: colorIdentityRemovedQty,
        didRepairRetry,
      });

      const unified = needsUnifiedRepair({
        mainQty: snapMainQty,
        sideQty: snapSideQty,
        removedTotal,
        colorRatio,
        requestDeckColorsLen: requestDeckColors.length,
      });

      if (!unified || didRepairRetry) break;

      const retryMessages: Array<{ role: string; content: string }> = [
        ...baseMessages,
        { role: "assistant", content: rawAiContent },
        { role: "user", content: buildConstructedRepairRetryPrompt(promptInput) },
      ];
      const repairAttempt = await runCompletion(retryMessages);
      if (!repairAttempt.ok) {
        logConstructedDiag({
          phase: "repair_openai_failed",
          format: formatLabel,
          failureStage: "repair_fetch",
          standardDiag: formatLabel === "Standard" ? true : undefined,
        });
        return NextResponse.json({ ok: false, error: "GENERATION_FAILED" }, { status: 502 });
      }

      didRepairRetry = true;
      rawAiContent = repairAttempt.content;
      completionContentForUsage = rawAiContent;
    }

    let mainQty = totalDeckQty(mainRows);
    let sideQty = totalDeckQty(sideRows);

    const mainQtyBeforePad = mainQty;

    if (mainQty < 55) {
      logConstructedDiag({
        phase: "mainboard_floor",
        format: formatLabel,
        archetype: body.archetype?.slice(0, 120),
        requestedColors: requestDeckColors.join("") || undefined,
        failureStage: "main_floor",
        mainQtyBeforePad,
        removedTotal,
        colorRemovals: colorIdentityRemovedQty,
        standardDiag: formatLabel === "Standard" ? true : undefined,
        hint:
          formatLabel === "Standard"
            ? "Standard failure context: main below floor after legality/color filtering — check parse vs removal counts above."
            : undefined,
      });
      return NextResponse.json({ ok: false, error: "GENERATION_FAILED" }, { status: 502 });
    }

    const paddingColors =
      requestDeckColors.length > 0 ? requestDeckColors : normalizeColorLetters(aiParsed.colors);

    const padMain = padMainboardNearSixty(mainRows, paddingColors);
    mainRows = padMain.rows;
    mainQty = totalDeckQty(mainRows);

    const padSide = padSideboardTowardFifteen(sideRows);
    sideRows = padSide.rows;
    sideQty = totalDeckQty(sideRows);

    if (padMain.adjusted || padSide.adjusted) {
      logConstructedDiag({
        phase: "padding_applied",
        format: formatLabel,
        mainAdjusted: padMain.adjusted,
        sideAdjusted: padSide.adjusted,
        mainQtyAfterPad: mainQty,
        sideQtyAfterPad: sideQty,
      });
    }

    if (mainQty < 60 && mainQtyBeforePad >= 55 && mainQtyBeforePad <= 59) {
      logConstructedDiag({
        phase: "padding_incomplete",
        format: formatLabel,
        failureStage: "padding_failed",
        mainQtyBeforePad,
        mainQtyAfterPad: mainQty,
        standardDiag: formatLabel === "Standard" ? true : undefined,
      });
      return NextResponse.json({ ok: false, error: "GENERATION_FAILED" }, { status: 502 });
    }

    const deckText = [`// Mainboard`, ...mainRows.map((c) => `${c.qty} ${c.name}`), ``, `// Sideboard`, ...sideRows.map((c) => `${c.qty} ${c.name}`)].join(
      "\n"
    );

    const title =
      typeof aiParsed.title === "string" && aiParsed.title.trim()
        ? aiParsed.title.trim().slice(0, 120)
        : `${formatLabel} Deck`;

    let colors = normalizeColorLetters(aiParsed.colors);
    if (!colors.length && body.colors?.length) {
      colors = normalizeColorLetters(body.colors);
    }

    const archetype =
      typeof aiParsed.archetype === "string" && aiParsed.archetype.trim()
        ? aiParsed.archetype.trim().slice(0, 80)
        : body.archetype?.trim() || "Constructed";

    const allRows = [...mainRows, ...sideRows];

    const explanationRaw = Array.isArray(aiParsed.explanation)
      ? aiParsed.explanation.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 10)
      : [];

    const explanation = filterExplanationBulletsForDeck(explanationRaw, allRows);

    const metaScore =
      typeof aiParsed.metaScore === "number" && Number.isFinite(aiParsed.metaScore)
        ? Math.max(0, Math.min(100, Math.round(aiParsed.metaScore)))
        : 70;

    const confidence =
      typeof aiParsed.confidence === "number" && Number.isFinite(aiParsed.confidence)
        ? Math.max(0, Math.min(1, aiParsed.confidence))
        : 0.75;

    const warnings: string[] = Array.isArray(aiParsed.warnings)
      ? filterWarningsForDeck(
          aiParsed.warnings.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 12),
          allRows
        )
      : [];

    if (removedTotal > 0) {
      warnings.push(`${removedTotal} card line(s) were removed as not legal in ${formatLabel}.`);
    }
    if (colorIdentityRemovedQty > 0 && requestDeckColors.length > 0) {
      warnings.push(
        `${colorIdentityRemovedQty} card copies removed so every card matches deck colors (${requestDeckColors.join("")}).`
      );
    }
    if (padMain.adjusted || padSide.adjusted) {
      warnings.push("Adjusted final card counts after validation.");
    }

    const priceEst = await estimateDeckPriceUsd(supabase, allRows);
    const estimatedPriceUsd = priceEst ?? 0;

    const rawContent = completionContentForUsage;
    const inputTokEst = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    const outputTokEst = Math.ceil(rawContent.length / 4);

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

      await recordAiUsage({
        user_id: user?.id ?? null,
        anon_id: anonId,
        thread_id: null,
        model,
        input_tokens: inputTokEst,
        output_tokens: outputTokEst,
        cost_usd: costUSD(model, inputTokEst, outputTokEst),
        route: "deck_generate_constructed",
        prompt_preview: userPrompt.slice(0, 800),
        response_preview: rawContent.slice(0, 800),
        format_key: formatLabel,
        deck_card_count: mainQty + sideQty,
        latency_ms: Date.now() - t0,
        model_tier: tierRes.tier,
        user_tier: tierRes.tierLabel,
        is_guest: !user,
        request_kind: "FULL_LLM",
        layer0_mode: "FULL_LLM",
      });
    } catch (e) {
      console.warn("[generate-constructed] recordAiUsage failed:", e);
    }

    return NextResponse.json({
      ok: true,
      format: formatLabel,
      title,
      colors,
      archetype,
      deckText,
      mainboardCount: mainQty,
      sideboardCount: sideQty,
      estimatedPriceUsd,
      explanation,
      metaScore,
      confidence,
      warnings,
    });
  } catch (e: unknown) {
    console.error("[generate-constructed]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
