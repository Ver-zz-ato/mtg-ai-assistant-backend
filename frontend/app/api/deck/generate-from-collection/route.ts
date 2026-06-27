import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetchAllRows";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { sanitizeName } from "@/lib/profanity";
import { GENERATE_FROM_COLLECTION_FREE, GENERATE_FROM_COLLECTION_PRO } from "@/lib/feature-limits";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import {
  norm,
  aggregateCards,
  parseAiDeckOutputLines,
  totalDeckQty,
  trimDeckToMaxQty,
  extractChatCompletionContent,
} from "@/lib/deck/generation-helpers";
import {
  normalizeGenerationBody,
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
} from "@/lib/deck/generation-input";
import { buildGenerationPreviewFacts } from "@/lib/deck/generation-preview-facts";
import { canonicalizeGeneratedDeckRows } from "@/lib/deck/canonicalize-generated-deck-names";
import { recordUserFeatureUsage } from "@/lib/badges/feature-usage";
import {
  aggregateCollectionQtyRows,
  preparePromptCardSample,
} from "@/lib/deck/collectionConstructedIdeasPrep";
import {
  computeCollectionFitSummary,
  countBasicLandSlots,
  enforceCommanderCollectionManaBase,
  filterDeckToCommanderColorIdentity,
  filterDeckToCollectionOwnership,
  isBasicLandName,
  normalizeCommanderDeckQtyForCollection,
  ownedSlotStats,
  rebalanceLandHeavyMostlyCollectionDeck,
  rebalanceMostlyCollectionDeck,
  MOSTLY_COLLECTION_TARGET_OWNED_PERCENT,
  COMMANDER_MAX_LAND_SHARE,
} from "@/lib/deck/collection-commander-generation";
import { buildCommanderReferencePromptBlock } from "@/lib/deck/commander-generation-context";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/** Deck lists are long; gpt-5* may use part of the budget before visible text — keep headroom. */
const DECK_GEN_MAX_COMPLETION_TOKENS = 16_384;
const MAX_LENGTH_CONTINUATIONS = 4;
const COMMANDER_TARGET_QTY = 100;
const COMMANDER_REPAIRABLE_MIN_QTY = 75;
const BUDGET_FRIENDLY_MAX_USD = 100;
const MAX_BUDGET_REPAIR_RETRIES = 2;

type CommanderBuildShapeTarget = {
  mode: "full_deck" | "core_shell" | "staples_flex";
  label: string;
  minQty: number;
  maxQty: number;
  retryMinQty: number;
  exactQty: number | null;
  targetInstruction: string;
};

type CommanderQtyNormalizeOptions = Parameters<typeof normalizeCommanderDeckQtyForCollection>[2];
type CommanderQtyNormalizeResult = ReturnType<typeof normalizeCommanderDeckQtyForCollection>;
type CommanderIdentityResolution = { colors: string[]; known: boolean };

function normalizeBuildShapeMode(buildMode: string | null | undefined): CommanderBuildShapeTarget["mode"] {
  const m = String(buildMode || "full_deck")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (m === "core_shell") return "core_shell";
  if (m === "staples_flex") return "staples_flex";
  return "full_deck";
}

function commanderBuildShapeTarget(buildMode: string | null | undefined): CommanderBuildShapeTarget {
  const mode = normalizeBuildShapeMode(buildMode);
  if (mode === "core_shell") {
    return {
      mode,
      label: "core shell",
      minQty: 35,
      maxQty: 45,
      retryMinQty: 20,
      exactQty: null,
      targetInstruction: "about 35-45 cards total; do not pad to 100",
    };
  }
  if (mode === "staples_flex") {
    return {
      mode,
      label: "staples/flex shell",
      minQty: 55,
      maxQty: 75,
      retryMinQty: 35,
      exactQty: null,
      targetInstruction: "about 55-75 cards total; do not pad to 100",
    };
  }
  return {
    mode,
    label: "full deck",
    minQty: COMMANDER_TARGET_QTY,
    maxQty: COMMANDER_TARGET_QTY,
    retryMinQty: COMMANDER_REPAIRABLE_MIN_QTY,
    exactQty: COMMANDER_TARGET_QTY,
    targetInstruction: "exactly 100 cards total",
  };
}

function commanderQtyFitsTarget(totalQty: number, target: CommanderBuildShapeTarget): boolean {
  return target.exactQty != null
    ? totalQty === target.exactQty
    : totalQty >= target.minQty && totalQty <= target.maxQty;
}

function fitCommanderCardsToBuildShape(
  cards: Array<{ name: string; qty: number }>,
  target: CommanderBuildShapeTarget,
  colors: string[],
  options: CommanderQtyNormalizeOptions
): CommanderQtyNormalizeResult {
  if (target.exactQty != null) {
    return normalizeCommanderDeckQtyForCollection(cards, colors, options);
  }

  return {
    ok: true,
    cards: totalDeckQty(cards) > target.maxQty ? trimDeckToMaxQty(cards, target.maxQty) : cards,
  };
}

async function resolveCommanderIdentity(commanderName: string): Promise<CommanderIdentityResolution> {
  if (!commanderName?.trim()) return { colors: [], known: false };
  const allColors = new Set<string>();
  let known = false;

  try {
    const details = await getDetailsForNamesCached([commanderName]);
    const fullCardData = details.get(norm(commanderName));
    if (fullCardData) {
      known = true;
      if (Array.isArray(fullCardData.color_identity)) {
        fullCardData.color_identity.forEach((c: string) => allColors.add(c.toUpperCase()));
      }
    }

    const parts = commanderName.split(/\s*\/\/\s*/).filter(Boolean);
    if (parts.length > 1) {
      const partDetails = await getDetailsForNamesCached(parts);
      for (const part of parts) {
        const cardData = partDetails.get(norm(part));
        if (!cardData) continue;
        known = true;
        if (Array.isArray(cardData.color_identity)) {
          cardData.color_identity.forEach((c: string) => allColors.add(c.toUpperCase()));
        }
      }
    }
  } catch {
    // Unknown identity is handled by the caller without blocking generation.
  }

  const wubrgOrder = ["W", "U", "B", "R", "G"];
  return { colors: wubrgOrder.filter((c) => allColors.has(c)), known };
}

export const runtime = "nodejs";

function normalizePriceCacheCardName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function budgetFriendlyMaxUsd(budget: string): number | null {
  const b = budget.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return b === "budget" || b === "budget_friendly" || b.includes("cheap") ? BUDGET_FRIENDLY_MAX_USD : null;
}

async function estimateDeckPriceUsd(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Array<{ name: string; qty: number }>
): Promise<{
  totalUsd: number | null;
  pricedRows: number;
  expensive: Array<{ name: string; qty: number; unitUsd: number; subtotalUsd: number }>;
}> {
  if (!rows.length) return { totalUsd: null, pricedRows: 0, expensive: [] };
  try {
    const uniqKeys = [...new Set(rows.map((r) => normalizePriceCacheCardName(r.name)).filter(Boolean))];
    const priceByKey = new Map<string, number>();
    const chunkSize = 120;
    for (let i = 0; i < uniqKeys.length; i += chunkSize) {
      const slice = uniqKeys.slice(i, i + chunkSize);
      const { data: prices } = await supabase.from("price_cache").select("card_name, usd_price").in("card_name", slice);
      for (const row of prices ?? []) {
        const cn = (row as { card_name?: string; usd_price?: number | null }).card_name;
        const usd = Number((row as { usd_price?: number | null }).usd_price);
        if (cn && Number.isFinite(usd) && usd > 0) priceByKey.set(String(cn), usd);
      }
    }

    let total = 0;
    let pricedRows = 0;
    const expensive: Array<{ name: string; qty: number; unitUsd: number; subtotalUsd: number }> = [];
    for (const row of rows) {
      const unitUsd = priceByKey.get(normalizePriceCacheCardName(row.name));
      if (unitUsd == null || !Number.isFinite(unitUsd) || unitUsd <= 0) continue;
      const qty = Math.max(0, Number(row.qty) || 0);
      const subtotalUsd = unitUsd * qty;
      total += subtotalUsd;
      pricedRows += 1;
      if (unitUsd >= 8 || subtotalUsd >= 12) {
        expensive.push({
          name: row.name,
          qty,
          unitUsd: Math.round(unitUsd * 100) / 100,
          subtotalUsd: Math.round(subtotalUsd * 100) / 100,
        });
      }
    }

    expensive.sort((a, b) => b.subtotalUsd - a.subtotalUsd || b.unitUsd - a.unitUsd);
    return {
      totalUsd: pricedRows > 0 ? Math.round(total * 100) / 100 : null,
      pricedRows,
      expensive: expensive.slice(0, 18),
    };
  } catch (e) {
    console.warn("[generate-from-collection] budget price estimate failed", e);
    return { totalUsd: null, pricedRows: 0, expensive: [] };
  }
}

function buildBudgetRepairPrompt(args: {
  currentTotalUsd: number;
  maxUsd: number;
  commanderName: string;
  targetInstruction: string;
  buildShapeLabel: string;
  expensive: Array<{ name: string; qty: number; unitUsd: number; subtotalUsd: number }>;
}): string {
  const expensiveLines = args.expensive.length
    ? args.expensive
        .map((row) => `- ${row.qty} ${row.name}: about $${row.subtotalUsd} total ($${row.unitUsd} each)`)
        .join("\n")
    : "- Price cache did not identify individual expensive rows; rebuild with cheap cards throughout.";

  return [
    `The previous deck is too expensive for Budget: estimated about $${args.currentTotalUsd}, but Budget must stay under about $${args.maxUsd}.`,
    `Commander: ${args.commanderName}. Output a replacement ${args.buildShapeLabel} decklist only, ${args.targetInstruction}.`,
    "Use cheap functional alternatives, basics, budget tapped/slow lands, affordable ramp/draw/removal, and synergy pieces. Avoid premium staples and luxury mana bases.",
    "Replace or avoid these expensive rows:",
    expensiveLines,
    'Output only plain deck lines in the form "qty Card Name". No markdown, no commentary.',
  ].join("\n");
}

function trimOverBudgetRows(
  rows: Array<{ name: string; qty: number }>,
  estimate: {
    totalUsd: number | null;
    expensive: Array<{ name: string; qty: number; unitUsd: number; subtotalUsd: number }>;
  },
  commanderName: string,
  maxUsd: number
): { cards: Array<{ name: string; qty: number }>; removed: Array<{ name: string; qty: number }> } {
  if (estimate.totalUsd == null || estimate.totalUsd <= maxUsd || estimate.expensive.length === 0) {
    return { cards: rows, removed: [] };
  }

  const working = rows.map((row) => ({ ...row, qty: Math.max(0, Number(row.qty) || 0) }));
  const removed: Array<{ name: string; qty: number }> = [];
  const commanderKey = norm(commanderName);
  let estimatedTotal = estimate.totalUsd;

  for (const row of estimate.expensive) {
    if (estimatedTotal <= maxUsd) break;
    if (norm(row.name) === commanderKey || isBasicLandName(row.name)) continue;

    const idx = working.findIndex((candidate) => norm(candidate.name) === norm(row.name));
    if (idx < 0) continue;

    while (working[idx] && working[idx].qty > 0 && estimatedTotal > maxUsd) {
      working[idx].qty -= 1;
      estimatedTotal = Math.max(0, estimatedTotal - row.unitUsd);
      const existing = removed.find((r) => norm(r.name) === norm(row.name));
      if (existing) existing.qty += 1;
      else removed.push({ name: row.name, qty: 1 });
    }
  }

  return { cards: working.filter((row) => row.qty > 0), removed };
}

function planLabelForResponse(powerLevel: string, budget: string, buildMode: string | null): string {
  const power = powerLevel?.trim() || "Casual";
  const cost = budget?.trim() || "Moderate";
  const shape =
    buildMode === "core_shell"
      ? "Core shell"
      : buildMode === "staples_flex"
        ? "Staples + flex"
        : "Full deck";
  return `${power} ${cost} ${shape}`;
}

export async function POST(req: NextRequest) {
  try {
    let supabase = await createClient();
    const { data: userResp } = await supabase.auth.getUser();
    let user = userResp?.user;

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

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const input = normalizeGenerationBody(rawBody);
    const collectionId = input.collectionId;
    const commander = input.commander;
    const playstyle = input.playstyle;
    const powerLevel = input.powerLevel;
    const format = input.format;
    const seedCard = input.seedCard;
    const isCommanderRequest = String(format || "Commander").toLowerCase().includes("commander");
    const commanderTarget = commanderBuildShapeTarget(input.buildMode);
    const isFullCommanderDeck = commanderTarget.exactQty === COMMANDER_TARGET_QTY;

    if (!collectionId && !commander && !(isCommanderRequest && seedCard)) {
      return NextResponse.json(
        { ok: false, error: "Provide collectionId, commander, or a Commander seed card (at least one required)" },
        { status: 400 }
      );
    }

    // Rate limit by tier (free vs pro)
    let isPro = false;
    try {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(user.id);
    } catch {}
    if (!isPro) {
      const keyHash = `user:${user.id}`;
      try {
        const durableLimit = await checkDurableRateLimit(
          supabase,
          keyHash,
          "/api/deck/generate-from-collection",
          GENERATE_FROM_COLLECTION_FREE,
          1,
          {
            identity: 'free',
            verifiedUserId: null,
          }
        );
        if (!durableLimit.allowed) {
          return NextResponse.json(
            {
              ok: false,
              code: "RATE_LIMIT_DAILY",
              error: `You've used your ${GENERATE_FROM_COLLECTION_FREE} free deck generations today. Upgrade to Pro for more!`,
              resetAt: durableLimit.resetAt,
              remaining: 0,
            },
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (e) {
        console.error("[generate-from-collection] Rate limit check failed:", e);
        return NextResponse.json(
          {
            ok: false,
            code: "RATE_LIMIT_UNAVAILABLE",
            error: "AI deck generation from collection is temporarily unavailable. Please try again shortly.",
          },
          { status: 503 }
        );
      }
    }

  // Fetch collection cards if collectionId provided
    let collectionTotalCards = 0;
    let collectionSampleSize = 0;
    let ownerNormKeys = new Set<string>();
    let ownerNormToDisplay = new Map<string, string>();
    let qtyByNormKey = new Map<string, number>();
    let rebalanceSwaps = 0;
    let landHeavySwaps = 0;
    const ownershipMode =
      input.collectionOwnershipMode ?? (collectionId ? "mostly_collection" : null);
    const fmtLabel = String(format || "Commander").trim();

    let collectionList = "No collection provided; generate a deck from the full card pool.";
    if (collectionId) {
      const { data: col } = await supabase
        .from("collections")
        .select("id, user_id")
        .eq("id", collectionId)
        .maybeSingle();
      if (!col || col.user_id !== user.id) {
        return NextResponse.json({ ok: false, error: "Collection not found or access denied" }, { status: 403 });
      }
      const cards = await fetchAllSupabaseRows<{ name: string; qty: number | null }>(() =>
        supabase
          .from("collection_cards")
          .select("name, qty")
          .eq("collection_id", collectionId)
          .order("id", { ascending: true }),
      );
      const aggregated = aggregateCollectionQtyRows(cards);
      if (aggregated.length === 0) {
        return NextResponse.json({ ok: false, error: "This collection has no cards." }, { status: 400 });
      }
      collectionTotalCards = aggregated.reduce((sum, r) => sum + r.qty, 0);
      const prep = await preparePromptCardSample(aggregated, fmtLabel);
      if (!prep.ok) {
        return NextResponse.json(
          {
            ok: false,
            code: "NOT_ENOUGH_LEGAL_COLLECTION_CARDS",
            error: `Not enough format-legal cards in this collection for ${fmtLabel}.`,
          },
          { status: 400 }
        );
      }
      ownerNormKeys = prep.ownerNormKeys;
      ownerNormToDisplay = prep.ownerNormToDisplay;
      qtyByNormKey = prep.qtyByNormKey;
      collectionSampleSize = prep.collectionSampleSize;
      collectionList = prep.promptLines;
    }

    const systemPrompt = buildGenerationSystemPrompt();
    let userPrompt = buildGenerationUserPrompt(
      input,
      collectionList,
      collectionId
        ? { totalCards: collectionTotalCards, sampleSize: collectionSampleSize }
        : null
    );
    const promptCommanderName = commander?.trim() || "";
    const requestedCommanderIdentity =
      isCommanderRequest && promptCommanderName
        ? await resolveCommanderIdentity(promptCommanderName)
        : null;

    if (requestedCommanderIdentity?.known) {
      const identityLabel = requestedCommanderIdentity.colors.length
        ? requestedCommanderIdentity.colors.join(", ")
        : "colorless";
      const forbiddenLabel = requestedCommanderIdentity.colors.length
        ? `outside ${requestedCommanderIdentity.colors.join("")}`
        : "with any colored color identity";
      userPrompt = `${userPrompt}\n\nCOMMANDER COLOR IDENTITY (mandatory): ${promptCommanderName} is ${identityLabel}. Do not include cards ${forbiddenLabel}. This includes lands, hybrid cards, MDFCs, split cards, and signets/talismans.`;
    }

    if (isCommanderRequest) {
      const refCommander = (commander || seedCard || "").trim();
      if (refCommander) {
        try {
          const refBlock = await buildCommanderReferencePromptBlock(refCommander);
          if (refBlock) userPrompt = `${userPrompt}\n\n${refBlock}`;
        } catch (e) {
          console.warn("[generate-from-collection] commander reference block failed", e);
        }
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 500 });
    }

    const { model } = getModelForTier({
      isGuest: false,
      userId: user.id,
      isPro,
      useCase: "deck_analysis",
    });

    const baseMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const runCompletion = async (messages: Array<{ role: string; content: string }>) => {
      const payload = prepareOpenAIBody({
        model,
        messages,
        max_completion_tokens: DECK_GEN_MAX_COMPLETION_TOKENS,
      } as Record<string, unknown>);
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
        const errText = await resp.text();
        console.error("[generate-from-collection] OpenAI error:", resp.status, errText);
        return { ok: false as const, error: "Deck generation failed" };
      }
      const data = await resp.json();
      const messageContent = extractChatCompletionContent(data);
      const fr = data?.choices?.[0]?.finish_reason as string | undefined;
      return { ok: true as const, content: messageContent, finishReason: fr };
    };

    let completion = await runCompletion(baseMessages);
    if (!completion.ok) {
      return NextResponse.json({ ok: false, error: completion.error }, { status: 500 });
    }
    let content = completion.content;
    let finishReason = completion.finishReason;
    let cards = aggregateCards(parseAiDeckOutputLines(content));

    let totalQty = totalDeckQty(cards);

    /** Commander checks use physical cards (sum of line quantities), not unique row count. */
    const minCommanderQty = commanderTarget.minQty;
    const minOtherQty = 30;

    let lengthContinuationRound = 0;
    while (
      isCommanderRequest &&
      isFullCommanderDeck &&
      totalQty < minCommanderQty &&
      finishReason === "length" &&
      lengthContinuationRound < MAX_LENGTH_CONTINUATIONS
    ) {
      lengthContinuationRound++;
      const followUp =
        totalQty === 0
          ? "Your previous reply hit the output limit before any deck lines appeared (or content was not plain lines). Output ONLY a complete 100-card Commander decklist: each line \"qty Card Name\", group basics (e.g. 30 Mountain). No markdown fences, no explanation — first line must be a card."
          : `Your previous reply was truncated with about ${totalQty} cards total. Output ONLY additional \"qty Card Name\" lines so the full deck reaches exactly 100 cards. Do not repeat cards already listed above.`;
      const cont = await runCompletion([
        ...baseMessages,
        { role: "assistant", content },
        { role: "user", content: followUp },
      ]);
      if (!cont.ok) break;
      content = `${content.trimEnd()}\n${cont.content.trimStart()}`;
      cards = aggregateCards(parseAiDeckOutputLines(content));
      totalQty = totalDeckQty(cards);
      finishReason = cont.finishReason;
      console.warn("[generate-from-collection] length continuation", {
        round: lengthContinuationRound,
        totalQty,
        finishReason,
        contentLen: content.length,
      });
    }

    if (
      isCommanderRequest &&
      isFullCommanderDeck &&
      totalQty >= 40 &&
      totalQty < minCommanderQty &&
      finishReason !== "length"
    ) {
      const retryMsg = [
        `Your previous reply totals only ${totalQty} cards (add quantities on each line; e.g. "35 Mountain" counts as 35).`,
        "Commander requires exactly 100 cards total. Output a COMPLETE replacement decklist only: 100 cards total, same commander and constraints, one entry per line as \"qty Card Name\". No markdown or commentary.",
      ].join(" ");
      const retry = await runCompletion([
        ...baseMessages,
        { role: "assistant", content: content },
        { role: "user", content: retryMsg },
      ]);
      if (retry.ok) {
        const retryParsed = parseAiDeckOutputLines(retry.content);
        const retryCards = aggregateCards(retryParsed);
        const retryTotal = totalDeckQty(retryCards);
        if (retryTotal > totalQty) {
          const beforeTotal = totalQty;
          content = retry.content;
          finishReason = retry.finishReason;
          cards = retryCards;
          totalQty = retryTotal;
          console.warn("[generate-from-collection] Applied completion retry (short first pass)", {
            before: beforeTotal,
            after: retryTotal,
          });
        }
      }
    }

    if (
      isCommanderRequest &&
      !isFullCommanderDeck &&
      totalQty >= commanderTarget.retryMinQty &&
      totalQty < commanderTarget.minQty &&
      finishReason !== "length"
    ) {
      const retryMsg = [
        `Your previous reply totals only ${totalQty} cards.`,
        `Output a replacement Commander ${commanderTarget.label} only: ${commanderTarget.targetInstruction}, same commander and constraints, one entry per line as "qty Card Name".`,
        "Do not output a full 100-card deck. No markdown or commentary.",
      ].join(" ");
      const retry = await runCompletion([
        ...baseMessages,
        { role: "assistant", content },
        { role: "user", content: retryMsg },
      ]);
      if (retry.ok) {
        const retryCards = aggregateCards(parseAiDeckOutputLines(retry.content));
        const retryTotal = totalDeckQty(retryCards);
        if (retryTotal > totalQty && retryTotal <= commanderTarget.maxQty) {
          const beforeTotal = totalQty;
          content = retry.content;
          finishReason = retry.finishReason;
          cards = retryCards;
          totalQty = retryTotal;
          console.warn("[generate-from-collection] Applied shell retry (short first pass)", {
            before: beforeTotal,
            after: retryTotal,
            buildMode: commanderTarget.mode,
          });
        }
      }
    }

    const budgetMaxUsd = isCommanderRequest ? budgetFriendlyMaxUsd(input.budget) : null;
    if (budgetMaxUsd != null && totalQty >= commanderTarget.retryMinQty) {
      let budgetRepairRound = 0;
      let priceEstimate = await estimateDeckPriceUsd(supabase, cards);
      while (
        priceEstimate.totalUsd != null &&
        priceEstimate.totalUsd > budgetMaxUsd &&
        budgetRepairRound < MAX_BUDGET_REPAIR_RETRIES
      ) {
        budgetRepairRound++;
        const commanderNameForRepair = commander?.trim() || cards[0]?.name || "Unknown";
        const budgetRetry = await runCompletion([
          ...baseMessages,
          { role: "assistant", content },
          {
            role: "user",
            content: buildBudgetRepairPrompt({
              currentTotalUsd: priceEstimate.totalUsd,
              maxUsd: budgetMaxUsd,
              commanderName: commanderNameForRepair,
              targetInstruction: commanderTarget.targetInstruction,
              buildShapeLabel: commanderTarget.label,
              expensive: priceEstimate.expensive,
            }),
          },
        ]);
        if (!budgetRetry.ok) break;

        const retryCards = aggregateCards(parseAiDeckOutputLines(budgetRetry.content));
        const retryTotal = totalDeckQty(retryCards);
        const budgetRetryMinQty = isFullCommanderDeck ? commanderTarget.retryMinQty : commanderTarget.minQty;
        if (retryTotal < budgetRetryMinQty || retryTotal > commanderTarget.maxQty) {
          console.warn("[generate-from-collection] budget repair retry too short", {
            round: budgetRepairRound,
            retryTotal,
            minQty: budgetRetryMinQty,
            maxQty: commanderTarget.maxQty,
            currentTotalUsd: priceEstimate.totalUsd,
          });
          break;
        }

        const retryPriceEstimate = await estimateDeckPriceUsd(supabase, retryCards);
        const retryImproved =
          retryPriceEstimate.totalUsd == null ||
          priceEstimate.totalUsd == null ||
          retryPriceEstimate.totalUsd < priceEstimate.totalUsd;
        if (!retryImproved) {
          console.warn("[generate-from-collection] budget repair retry did not improve price", {
            round: budgetRepairRound,
            beforeUsd: priceEstimate.totalUsd,
            afterUsd: retryPriceEstimate.totalUsd,
          });
          break;
        }

        content = budgetRetry.content;
        finishReason = budgetRetry.finishReason;
        cards = retryCards;
        totalQty = retryTotal;
        priceEstimate = retryPriceEstimate;
        console.warn("[generate-from-collection] budget repair retry applied", {
          round: budgetRepairRound,
          totalQty,
          estimatedUsd: priceEstimate.totalUsd,
          budgetMaxUsd,
        });
      }
    }

    const tooShort = isCommanderRequest ? totalQty < commanderTarget.retryMinQty : totalQty < minOtherQty;
    if (tooShort) {
      console.error("[generate-from-collection] deck too short", {
        finishReason,
        isCommanderRequest,
        contentLen: typeof content === "string" ? content.length : 0,
        parsedLines: parseAiDeckOutputLines(content).length,
        uniqueRows: cards.length,
        totalQty,
        head: typeof content === "string" ? content.slice(0, 500) : "",
      });
      const hint =
        finishReason === "length"
          ? " Output hit the size limit — tap try again."
          : "";
      const errMsg = isCommanderRequest
        ? `Generated Commander ${commanderTarget.label} too short (${totalQty} cards total; target is ${commanderTarget.targetInstruction}). Please try again.${hint}`
        : `Generated decklist too short; please try again.${hint}`;
      return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
    }

    const commanderName = commander?.trim() || cards[0]?.name || "Unknown";
    const commanderIdentity =
      commander?.trim() && requestedCommanderIdentity
        ? requestedCommanderIdentity
        : await resolveCommanderIdentity(commanderName);
    const allowedColors = commanderIdentity.colors.map((c) => c.toUpperCase());
    const allNames = cards.map((c) => c.name);
    const details = await getDetailsForNamesCached(allNames);

    /**
     * Unknown commander identity cannot be validated safely.
     * Known colorless commanders still enforce colorless-only cards.
     */
    let filtered: typeof cards;
    if (!commanderIdentity.known) {
      console.warn("[generate-from-collection] Skipping color-identity filter (commander not found in cache)", {
        commanderName,
      });
      filtered = cards;
    } else {
      const identityFiltered = filterDeckToCommanderColorIdentity(cards, details, allowedColors, {
        commanderName,
        commanderKnown: true,
      });
      filtered = identityFiltered.cards;
      if (identityFiltered.removed.length > 0) {
        console.warn("[generate-from-collection] Removed off-color cards from generated list", {
          commanderName,
          colors: allowedColors,
          beforeRows: cards.length,
          beforeQty: totalDeckQty(cards),
          afterRows: filtered.length,
          afterQty: totalDeckQty(filtered),
          removed: identityFiltered.removed.map((row) => row.name).slice(0, 20),
        });
      }
    }

    const ownershipFiltered = filterDeckToCollectionOwnership(
      filtered,
      ownerNormKeys,
      ownershipMode,
      commanderName
    );
    if (ownershipFiltered.removed.length > 0) {
      console.warn("[generate-from-collection] Removed off-collection cards (collection_only)", {
        removedRows: ownershipFiltered.removed.length,
        ownershipMode,
      });
    }
    filtered = ownershipFiltered.cards;

    if (isCommanderRequest) {
      const qtyNorm = fitCommanderCardsToBuildShape(filtered, commanderTarget, allowedColors, {
        ownershipMode,
        ownerNormKeys,
        qtyByNormKey,
      });
      if (!qtyNorm.ok) {
        return NextResponse.json(
          { ok: false, code: qtyNorm.code, error: qtyNorm.error },
          { status: 400 }
        );
      }
      cards = qtyNorm.cards;
    } else {
      cards = filtered;
    }

    if (isCommanderRequest && totalDeckQty(cards) < commanderTarget.minQty) {
      console.error("[generate-from-collection] Commander deck under repairable card threshold after processing", {
        commanderName,
        rows: cards.length,
        totalQty: totalDeckQty(cards),
        buildMode: commanderTarget.mode,
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            `Generated Commander ${commanderTarget.label} was too short after checks; please try again or pick a different commander.`,
        },
        { status: 500 }
      );
    }

    try {
      const { filterDecklistQtyRowsForFormat } = await import("@/lib/deck/recommendation-legality");
      const { lines: legalLines } = await filterDecklistQtyRowsForFormat(cards, fmtLabel, {
        logPrefix: "/api/deck/generate-from-collection",
      });
      if (isCommanderRequest) {
        const qtyNorm = fitCommanderCardsToBuildShape(legalLines, commanderTarget, allowedColors, {
          ownershipMode,
          ownerNormKeys,
          qtyByNormKey,
        });
        if (!qtyNorm.ok) {
          return NextResponse.json(
            { ok: false, code: qtyNorm.code, error: qtyNorm.error },
            { status: 400 }
          );
        }
        cards = qtyNorm.cards;
      } else {
        cards = legalLines;
      }
    } catch (legErr) {
      console.warn("[generate-from-collection] Legality filter failed:", legErr);
    }

    if (isCommanderRequest && isFullCommanderDeck && ownerNormKeys.size > 0 && ownerNormToDisplay.size > 0) {
      const manaEnforced = enforceCommanderCollectionManaBase(cards, {
        ownershipMode,
        ownerNormKeys,
        ownerNormToDisplay,
        qtyByNormKey,
        colors: allowedColors,
        commanderName,
      });
      if (manaEnforced.trimmedBasics > 0) {
        console.warn("[generate-from-collection] Commander mana base capped", {
          trimmedBasics: manaEnforced.trimmedBasics,
          landSlots: manaEnforced.landSlots,
        });
      }
      cards = manaEnforced.cards;

      if (ownershipMode === "mostly_collection") {
        const { deckSlots, ownedSlots } = ownedSlotStats(cards, ownerNormKeys, commanderName);
        const landSlots = countBasicLandSlots(cards);
        const ownedPercent = deckSlots > 0 ? Math.round((ownedSlots / deckSlots) * 100) : 0;
        const landShare = deckSlots > 0 ? landSlots / deckSlots : 0;

        if (
          ownedPercent >= MOSTLY_COLLECTION_TARGET_OWNED_PERCENT &&
          landShare > COMMANDER_MAX_LAND_SHARE
        ) {
          const landFix = rebalanceLandHeavyMostlyCollectionDeck(cards, {
            ownerNormKeys,
            ownerNormToDisplay,
            qtyByNormKey,
            commanderName,
          });
          landHeavySwaps = landFix.swaps;
          if (landFix.swaps > 0) {
            cards = landFix.cards;
            console.warn("[generate-from-collection] Land-heavy rebalance applied", {
              swaps: landFix.swaps,
              landSlots: countBasicLandSlots(cards),
              ownedPercent,
            });
          }
        }

        const rebalanced = rebalanceMostlyCollectionDeck(cards, {
          ownerNormKeys,
          ownerNormToDisplay,
          qtyByNormKey,
          commanderName,
        });
        rebalanceSwaps = rebalanced.swaps;
        if (rebalanced.swaps > 0) {
          cards = rebalanced.cards;
          console.warn("[generate-from-collection] mostly_collection rebalance applied", {
            swaps: rebalanced.swaps,
            totalQty: totalDeckQty(cards),
          });
        }

        const afterRebalance = enforceCommanderCollectionManaBase(cards, {
          ownershipMode,
          ownerNormKeys,
          ownerNormToDisplay,
          qtyByNormKey,
          colors: allowedColors,
          commanderName,
        });
        cards = afterRebalance.cards;

        const qtyNorm = normalizeCommanderDeckQtyForCollection(cards, allowedColors, {
          ownershipMode,
          ownerNormKeys,
          qtyByNormKey,
        });
        cards = qtyNorm.ok ? qtyNorm.cards : cards;
      } else if (ownershipMode === "collection_only") {
        const qtyNorm = normalizeCommanderDeckQtyForCollection(cards, allowedColors, {
          ownershipMode,
          ownerNormKeys,
          qtyByNormKey,
        });
        cards = qtyNorm.ok ? qtyNorm.cards : cards;
      }
    }

    if (isCommanderRequest && totalDeckQty(cards) < commanderTarget.minQty) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `Generated Commander ${commanderTarget.label} was too short after legality filtering; please try again or pick a different commander.`,
        },
        { status: 500 }
      );
    }

    if (isCommanderRequest && !commanderQtyFitsTarget(totalDeckQty(cards), commanderTarget)) {
      const qtyNorm = fitCommanderCardsToBuildShape(cards, commanderTarget, allowedColors, {
        ownershipMode,
        ownerNormKeys,
        qtyByNormKey,
      });
      if (qtyNorm.ok) {
        cards = qtyNorm.cards;
      }
    }

    if (isCommanderRequest && !commanderQtyFitsTarget(totalDeckQty(cards), commanderTarget)) {
      console.error("[generate-from-collection] Commander deck not in requested build shape after processing", {
        commanderName,
        buildMode: commanderTarget.mode,
        rows: cards.length,
        totalQty: totalDeckQty(cards),
        target: commanderTarget.targetInstruction,
      });
      return NextResponse.json(
        {
          ok: false,
          error: `Generated Commander ${commanderTarget.label} was not ${commanderTarget.targetInstruction} after checks; please try again.`,
        },
        { status: 500 }
      );
    }

    const canonicalized = await canonicalizeGeneratedDeckRows(cards);
    cards = canonicalized.rows;

    if (isCommanderRequest && commanderIdentity.known) {
      const finalDetails = await getDetailsForNamesCached(cards.map((c) => c.name));
      const finalIdentityFiltered = filterDeckToCommanderColorIdentity(cards, finalDetails, allowedColors, {
        commanderName,
        commanderKnown: true,
      });
      if (finalIdentityFiltered.removed.length > 0) {
        const qtyNorm = fitCommanderCardsToBuildShape(finalIdentityFiltered.cards, commanderTarget, allowedColors, {
          ownershipMode,
          ownerNormKeys,
          qtyByNormKey,
        });
        if (!qtyNorm.ok) {
          return NextResponse.json(
            { ok: false, code: qtyNorm.code, error: qtyNorm.error },
            { status: 400 }
          );
        }
        cards = qtyNorm.cards;
        console.warn("[generate-from-collection] Final color-identity guard removed cards", {
          commanderName,
          colors: allowedColors,
          removed: finalIdentityFiltered.removed.map((row) => row.name).slice(0, 20),
          totalQty: totalDeckQty(cards),
        });
      }
    }

    if (isCommanderRequest && budgetMaxUsd != null) {
      const finalBudgetEstimate = await estimateDeckPriceUsd(supabase, cards);
      if (finalBudgetEstimate.totalUsd != null && finalBudgetEstimate.totalUsd > budgetMaxUsd) {
        const trimmed = trimOverBudgetRows(cards, finalBudgetEstimate, commanderName, budgetMaxUsd);
        if (trimmed.removed.length > 0) {
          const qtyNorm = fitCommanderCardsToBuildShape(trimmed.cards, commanderTarget, allowedColors, {
            ownershipMode,
            ownerNormKeys,
            qtyByNormKey,
          });
          if (qtyNorm.ok && commanderQtyFitsTarget(totalDeckQty(qtyNorm.cards), commanderTarget)) {
            cards = qtyNorm.cards;
            console.warn("[generate-from-collection] final budget guard trimmed expensive rows", {
              beforeUsd: finalBudgetEstimate.totalUsd,
              budgetMaxUsd,
              buildMode: commanderTarget.mode,
              removed: trimmed.removed.map((row) => row.name).slice(0, 12),
            });
          }
        }

        const afterBudgetEstimate = await estimateDeckPriceUsd(supabase, cards);
        if (afterBudgetEstimate.totalUsd != null && afterBudgetEstimate.totalUsd > budgetMaxUsd) {
          console.error("[generate-from-collection] budget guard could not reach target", {
            commanderName,
            estimatedUsd: afterBudgetEstimate.totalUsd,
            budgetMaxUsd,
          });
          return NextResponse.json(
            {
              ok: false,
              error:
                "Could not keep this Commander draft inside the Budget target after checks. Try a cheaper commander or run Generate again.",
            },
            { status: 500 }
          );
        }
      }
    }

    if (isCommanderRequest && !commanderQtyFitsTarget(totalDeckQty(cards), commanderTarget)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Generated Commander ${commanderTarget.label} was not ${commanderTarget.targetInstruction} after final checks; please try again.`,
        },
        { status: 500 }
      );
    }

    const deckText = cards.map((c) => `${c.qty} ${c.name}`).join("\n");
    const colors = allowedColors;
    const overallAim = playstyle
      ? `A ${powerLevel} ${playstyle} Commander deck led by ${commanderName}.`
      : `A ${powerLevel} Commander deck led by ${commanderName}.`;
    const title = sanitizeName(
      commanderName && commanderName !== "Unknown" ? `${commanderName} (AI)` : `AI Deck from Collection`,
      120
    );

    let previewFacts: Awaited<ReturnType<typeof buildGenerationPreviewFacts>> = undefined;
    try {
      previewFacts = await buildGenerationPreviewFacts(
        deckText,
        commanderName === "Unknown" ? null : commanderName,
        "Commander",
      );
    } catch {
      // optional
    }

    if (user?.id && (input.generationIntent === "idea_to_deck" || input.generationIntent === "build_around_card")) {
      const featureKey = input.generationIntent;
      void recordUserFeatureUsage({
        userId: user.id,
        featureKey,
        source: "api/deck/generate-from-collection",
        metadata: {
          format: format || "Commander",
          commander: commanderName,
          build_mode: input.buildMode,
        },
      }).catch(() => undefined);
    }

    const collectionFit =
      collectionId && ownerNormKeys.size > 0
        ? computeCollectionFitSummary(cards, ownerNormKeys, {
            ownershipMode,
            collectionTotalCards,
            promptSampleSize: collectionSampleSize,
            commanderName,
            rebalanceSwaps,
          })
        : undefined;

    // Return preview only; client will call decks/create when user confirms
    return NextResponse.json({
      ok: true,
      preview: true,
      decklist: cards,
      commander: commanderName,
      colors,
      overallAim,
      title,
      deckText,
      format: format || "Commander",
      plan: planLabelForResponse(powerLevel, input.budget, input.buildMode),
      ...(previewFacts ? { previewFacts } : {}),
      ...(collectionFit ? { collectionFit } : {}),
    });
  } catch (e: unknown) {
    console.error("[generate-from-collection]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
