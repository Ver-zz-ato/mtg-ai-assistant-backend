import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_FALLBACK_MODEL, DEFAULT_FREE_MODEL } from "@/lib/ai/default-models";
import {
  buildAiRouteExecutionContext,
  buildCompactGroundingPacket,
  runStructuredAiFlow,
} from "@/lib/ai/structured-pipeline";
import { parseJsonObjectFromLlmText } from "@/lib/mobile/deck-compare-mobile-response";
import {
  buildDeckCompareGrounding,
  type CompareDeckGrounding,
} from "@/lib/mobile/deck-compare-grounding";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleSupabase } from "@/lib/server/serviceRoleSupabase";
import {
  deckFormatStringToAnalyzeFormat,
  getFormatRules,
  normalizeDeckFormat,
} from "@/lib/deck/formatRules";
import {
  mainDeckTextCardCount,
  rowsToDeckTextForAnalysis,
} from "@/lib/deck/formatCompliance";

export const runtime = "nodejs";
export const maxDuration = 120;

const ROUTE_PATH = "/api/mobile/deck/compare-v2";
const FEATURE_KEY = "deck_compare_v2";
const MAX_DECKS = 6;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const deckInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("saved"),
    deckId: z.string().regex(UUID_RE),
  }),
  z.object({
    type: z.literal("pasted"),
    title: z.string().trim().min(1).max(120).optional(),
    deckText: z.string().trim().min(20).max(40000),
    format: z.string().trim().min(1).max(40),
    commander: z.string().trim().max(120).optional().nullable(),
  }),
]);

const requestSchema = z.object({
  ownDeck: deckInputSchema,
  publicDeckIds: z.array(z.string().regex(UUID_RE)).min(1).max(MAX_DECKS - 1),
  sourcePage: z.string().trim().max(80).optional(),
  source_page: z.string().trim().max(80).optional(),
  usageSource: z.string().trim().max(80).optional(),
  usage_source: z.string().trim().max(80).optional(),
});

type DeckCardRow = { name: string; qty: number; zone?: string | null };

type CompareV2InputDeck = {
  id: string;
  source: "own_saved" | "own_pasted" | "public_scan";
  title: string;
  commander: string | null;
  format: string;
  canonicalFormat: string;
  cardCount: number;
  deckText: string;
};

type CompareV2DeckCard = {
  id: string;
  source: CompareV2InputDeck["source"];
  title: string;
  commander: string | null;
  format: string;
  cardCount: number;
  estimatedValueUsd: number | null;
  topExpensiveCards: Array<{ name: string; estimatedPriceUsd: number }>;
  power: {
    deterministicScore: number;
    aiAdjustedScore: number;
    level: number;
    band: CompareDeckGrounding["intelligence"]["powerBand"];
  };
  stats: {
    tempo: number;
    consistency: number;
    interaction: number;
    resilience: number;
    closing: number;
    mana: number;
    synergy: number;
  };
  strengths: string[];
  weaknesses: string[];
  summary: string;
};

type CompareV2Success = {
  ok: true;
  format: string;
  decks: CompareV2DeckCard[];
  overview: {
    strongestDeckId: string | null;
    weakestDeckId: string | null;
    fastestDeckId: string | null;
    bestLongGameDeckId: string | null;
    verdict: string;
    bullets: string[];
  };
  meta: {
    version: 1;
    model: string;
    usedAi: boolean;
    generated_at: string;
  };
};

function titleCaseFormat(format: string | null | undefined): string {
  const n = normalizeDeckFormat(format || "");
  return n ? getFormatRules(n).analyzeAs : deckFormatStringToAnalyzeFormat(format);
}

function minCardsForFormat(format: string): number {
  return normalizeDeckFormat(format) === "commander" ? 50 : 30;
}

function totalRows(rows: DeckCardRow[]): number {
  return rows.reduce((sum, row) => {
    const zone = String(row.zone || "mainboard").toLowerCase();
    if (zone === "sideboard" || zone === "maybeboard") return sum;
    return sum + Math.max(1, Math.floor(Number(row.qty) || 1));
  }, 0);
}

function formatDeckBlock(deck: CompareV2InputDeck, index: number): string {
  const slot = `Deck ${String.fromCharCode(65 + index)}`;
  return `${slot} - ${deck.title} (${deck.commander || "No commander"}):\n${deck.deckText}`;
}

function clampPowerScore(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function deterministicStrengths(deck: CompareDeckGrounding): string[] {
  const i = deck.intelligence;
  return [
    i.tempoScore >= 65 ? `Fast pressure: tempo ${i.tempoScore}.` : "",
    i.consistencyScore >= 65 ? `Reliable setup: consistency ${i.consistencyScore}.` : "",
    i.interactionScore >= 65 ? `Good answers: interaction ${i.interactionScore}.` : "",
    i.synergyScore >= 65 ? `Clear synergy package: synergy ${i.synergyScore}.` : "",
    i.closingScore >= 65 ? `Strong finishers: closing ${i.closingScore}.` : "",
  ].filter(Boolean).slice(0, 3);
}

function deterministicWeaknesses(deck: CompareDeckGrounding): string[] {
  const i = deck.intelligence;
  return [
    ...i.weakSignals,
    i.interactionScore < 45 ? "Interaction may be too light." : "",
    i.consistencyScore < 45 ? "Consistency tools may be thin." : "",
    i.manaQualityScore < 45 ? "Mana quality looks shaky." : "",
  ].filter(Boolean).slice(0, 3);
}

function deckCardFromGrounding(
  inputDeck: CompareV2InputDeck,
  grounded: CompareDeckGrounding,
  aiPowerByTitle: Map<string, number>,
): CompareV2DeckCard {
  const deterministicLevel = clampPowerScore(grounded.intelligence.powerScore / 10, 5);
  const aiAdjustedScore = aiPowerByTitle.get(inputDeck.title.toLowerCase()) ?? deterministicLevel;
  return {
    id: inputDeck.id,
    source: inputDeck.source,
    title: inputDeck.title,
    commander: inputDeck.commander,
    format: inputDeck.format,
    cardCount: inputDeck.cardCount,
    estimatedValueUsd: grounded.intelligence.estimatedPriceUsd,
    topExpensiveCards: grounded.intelligence.premiumCardDetails,
    power: {
      deterministicScore: deterministicLevel,
      aiAdjustedScore,
      level: aiAdjustedScore,
      band: grounded.intelligence.powerBand,
    },
    stats: {
      tempo: grounded.intelligence.tempoScore,
      consistency: grounded.intelligence.consistencyScore,
      interaction: grounded.intelligence.interactionScore,
      resilience: grounded.intelligence.resilienceScore,
      closing: grounded.intelligence.closingScore,
      mana: grounded.intelligence.manaQualityScore,
      synergy: grounded.intelligence.synergyScore,
    },
    strengths: deterministicStrengths(grounded),
    weaknesses: deterministicWeaknesses(grounded),
    summary: grounded.summary,
  };
}

function pickDeckId(decks: CompareV2DeckCard[], score: (deck: CompareV2DeckCard) => number, direction: "max" | "min"): string | null {
  const sorted = [...decks].sort((a, b) => {
    const diff = direction === "max" ? score(b) - score(a) : score(a) - score(b);
    return diff || a.title.localeCompare(b.title);
  });
  return sorted[0]?.id ?? null;
}

function buildDeterministicResult(inputDecks: CompareV2InputDeck[], grounded: Awaited<ReturnType<typeof buildDeckCompareGrounding>>, model: string): CompareV2Success {
  const emptyAiMap = new Map<string, number>();
  const cards = grounded.decks.map((deck, index) => deckCardFromGrounding(inputDecks[index], deck, emptyAiMap));
  const strongestDeckId = pickDeckId(cards, (deck) => deck.power.level, "max");
  const weakestDeckId = pickDeckId(cards, (deck) => deck.power.level, "min");
  const fastestDeckId = pickDeckId(cards, (deck) => deck.stats.tempo, "max");
  const bestLongGameDeckId = pickDeckId(cards, (deck) => deck.stats.resilience + deck.stats.consistency + deck.stats.closing, "max");

  return {
    ok: true,
    format: inputDecks[0]?.format ?? "Commander",
    decks: cards,
    overview: {
      strongestDeckId,
      weakestDeckId,
      fastestDeckId,
      bestLongGameDeckId,
      verdict: grounded.matrix.verdict,
      bullets: [
        strongestDeckId ? `${cards.find((deck) => deck.id === strongestDeckId)?.title ?? "Top deck"} has the best overall power read.` : "",
        fastestDeckId ? `${cards.find((deck) => deck.id === fastestDeckId)?.title ?? "Fastest deck"} has the strongest tempo score.` : "",
        bestLongGameDeckId ? `${cards.find((deck) => deck.id === bestLongGameDeckId)?.title ?? "Long-game deck"} has the best long-game profile.` : "",
      ].filter(Boolean),
    },
    meta: {
      version: 1,
      model,
      usedAi: false,
      generated_at: new Date().toISOString(),
    },
  };
}

function normalizeAiAdjustedResult(
  parsed: unknown,
  current: CompareV2Success,
): CompareV2Success {
  const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const aiDecks = Array.isArray(obj.decks) ? obj.decks : [];
  const byTitle = new Map<string, number>();
  for (const raw of aiDecks) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim().toLowerCase() : "";
    if (!title) continue;
    byTitle.set(title, clampPowerScore(row.powerLevel ?? row.power_level ?? row.power, current.decks.find((deck) => deck.title.toLowerCase() === title)?.power.level ?? 5));
  }
  const decks = current.decks.map((deck) => {
    const aiAdjustedScore = byTitle.get(deck.title.toLowerCase()) ?? deck.power.aiAdjustedScore;
    const strengthsRaw = aiDecks.find((raw) => raw && typeof raw === "object" && String((raw as Record<string, unknown>).title || "").trim().toLowerCase() === deck.title.toLowerCase()) as Record<string, unknown> | undefined;
    const strengths = Array.isArray(strengthsRaw?.strengths)
      ? strengthsRaw!.strengths.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3)
      : deck.strengths;
    const weaknesses = Array.isArray(strengthsRaw?.weaknesses)
      ? strengthsRaw!.weaknesses.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3)
      : deck.weaknesses;
    return {
      ...deck,
      power: { ...deck.power, aiAdjustedScore, level: aiAdjustedScore },
      strengths,
      weaknesses,
      summary: typeof strengthsRaw?.summary === "string" && strengthsRaw.summary.trim() ? strengthsRaw.summary.trim().slice(0, 220) : deck.summary,
    };
  });
  const strongestDeckId = pickDeckId(decks, (deck) => deck.power.level, "max");
  const weakestDeckId = pickDeckId(decks, (deck) => deck.power.level, "min");
  return {
    ...current,
    decks,
    overview: {
      ...current.overview,
      strongestDeckId,
      weakestDeckId,
      verdict: typeof obj.verdict === "string" && obj.verdict.trim() ? obj.verdict.trim().slice(0, 420) : current.overview.verdict,
      bullets: Array.isArray(obj.bullets)
        ? obj.bullets.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 4)
        : current.overview.bullets,
    },
    meta: { ...current.meta, usedAi: true },
  };
}

async function getRequestUser(req: Request) {
  let supabase = await createClient();
  let { data: ures } = await supabase.auth.getUser();
  let user = ures?.user ?? null;

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

  return { supabase, user };
}

function devEmailAllowed(userEmail: string | null | undefined): boolean {
  const expected = (process.env.MANATAP_DEV_LOGIN_EMAIL || process.env.DEV_LOGIN_EMAIL || "").trim().toLowerCase();
  if (!expected) return false;
  return String(userEmail || "").trim().toLowerCase() === expected;
}

async function loadSavedDeck(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, deckId: string): Promise<CompareV2InputDeck | { error: string; status: number; code?: string }> {
  const { data: deck, error } = await supabase
    .from("decks")
    .select("id, user_id, title, commander, format, deck_text")
    .eq("id", deckId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !deck) return { error: "Deck not found.", status: 404, code: "OWN_DECK_NOT_FOUND" };

  const { data: rows } = await supabase
    .from("deck_cards")
    .select("name, qty, zone")
    .eq("deck_id", deckId);
  const cardRows = (rows ?? []) as DeckCardRow[];
  const format = titleCaseFormat((deck as { format?: string | null }).format);
  const deckText = rowsToDeckTextForAnalysis(cardRows, format) || String((deck as { deck_text?: string }).deck_text || "");
  const cardCount = totalRows(cardRows) || mainDeckTextCardCount(deckText, format);
  const canonicalFormat = normalizeDeckFormat(format);
  if (!canonicalFormat) return { error: "Unsupported deck format.", status: 400, code: "UNSUPPORTED_FORMAT" };
  if (cardCount < minCardsForFormat(format)) {
    return { error: `This ${format} deck needs at least ${minCardsForFormat(format)} cards before comparison.`, status: 400, code: "DECK_TOO_SMALL" };
  }
  return {
    id: String((deck as { id: string }).id),
    source: "own_saved",
    title: String((deck as { title?: string }).title || "My deck"),
    commander: typeof (deck as { commander?: unknown }).commander === "string" ? (deck as { commander: string }).commander : null,
    format,
    canonicalFormat,
    cardCount,
    deckText,
  };
}

function loadPastedDeck(input: z.infer<typeof requestSchema>["ownDeck"]): CompareV2InputDeck | { error: string; status: number; code?: string } {
  if (input.type !== "pasted") return { error: "Invalid pasted deck.", status: 400 };
  const format = titleCaseFormat(input.format);
  const canonicalFormat = normalizeDeckFormat(format);
  if (!canonicalFormat) return { error: "Unsupported deck format.", status: 400, code: "UNSUPPORTED_FORMAT" };
  const cardCount = mainDeckTextCardCount(input.deckText, format);
  if (cardCount < minCardsForFormat(format)) {
    return { error: `This ${format} deck needs at least ${minCardsForFormat(format)} cards before comparison.`, status: 400, code: "DECK_TOO_SMALL" };
  }
  return {
    id: "own-pasted",
    source: "own_pasted",
    title: input.title?.trim() || "Pasted decklist",
    commander: input.commander?.trim() || null,
    format,
    canonicalFormat,
    cardCount,
    deckText: input.deckText,
  };
}

async function loadPublicDecks(deckIds: string[]): Promise<CompareV2InputDeck[] | { error: string; status: number; code?: string; details?: unknown }> {
  const admin = getServiceRoleSupabase();
  if (!admin) return { error: "Server deck access is unavailable.", status: 500 };
  const { data: deckRows, error } = await admin
    .from("decks")
    .select("id, title, commander, format, deck_text, is_public")
    .in("id", deckIds)
    .eq("is_public", true);
  if (error) return { error: "Could not load scanned decks.", status: 500, details: error.message };
  if ((deckRows ?? []).length !== deckIds.length) {
    return { error: "One scanned deck is private or no longer available.", status: 404, code: "PUBLIC_DECK_NOT_FOUND" };
  }
  const { data: cardRows } = await admin
    .from("deck_cards")
    .select("deck_id, name, qty, zone")
    .in("deck_id", deckIds);
  const rowsByDeck = new Map<string, DeckCardRow[]>();
  for (const row of cardRows ?? []) {
    const deckId = String((row as { deck_id?: string }).deck_id || "");
    if (!deckId) continue;
    const arr = rowsByDeck.get(deckId) ?? [];
    arr.push(row as DeckCardRow);
    rowsByDeck.set(deckId, arr);
  }
  const decks: CompareV2InputDeck[] = [];
  for (const row of deckRows ?? []) {
    const deck = row as { id: string; title?: string | null; commander?: string | null; format?: string | null; deck_text?: string | null };
    const format = titleCaseFormat(deck.format);
    const canonicalFormat = normalizeDeckFormat(format);
    if (!canonicalFormat) return { error: `${deck.title || "A scanned deck"} uses an unsupported format.`, status: 400, code: "UNSUPPORTED_FORMAT" };
    const rows = rowsByDeck.get(deck.id) ?? [];
    const deckText = rowsToDeckTextForAnalysis(rows, format) || String(deck.deck_text || "");
    const cardCount = totalRows(rows) || mainDeckTextCardCount(deckText, format);
    if (cardCount < minCardsForFormat(format)) {
      return { error: `${deck.title || "A scanned deck"} needs at least ${minCardsForFormat(format)} cards before comparison.`, status: 400, code: "DECK_TOO_SMALL" };
    }
    decks.push({
      id: deck.id,
      source: "public_scan",
      title: deck.title?.trim() || "Scanned public deck",
      commander: deck.commander?.trim() || null,
      format,
      canonicalFormat,
      cardCount,
      deckText,
    });
  }
  const byInputOrder = deckIds.map((id) => decks.find((deck) => deck.id === id)).filter((deck): deck is CompareV2InputDeck => !!deck);
  return byInputOrder;
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getRequestUser(req);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!devEmailAllowed(user.email)) {
      return NextResponse.json({ ok: false, code: "DEV_ONLY", error: "This tool is only enabled for the developer account." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, code: "INVALID_INPUT", error: "Invalid compare request." }, { status: 400 });
    }
    const uniquePublicIds = [...new Set(parsed.data.publicDeckIds)];
    if (uniquePublicIds.length !== parsed.data.publicDeckIds.length) {
      return NextResponse.json({ ok: false, code: "DUPLICATE_DECK", error: "That deck has already been added." }, { status: 400 });
    }

    const ownDeck =
      parsed.data.ownDeck.type === "saved"
        ? await loadSavedDeck(supabase, user.id, parsed.data.ownDeck.deckId)
        : loadPastedDeck(parsed.data.ownDeck);
    if ("error" in ownDeck) return NextResponse.json({ ok: false, code: ownDeck.code, error: ownDeck.error }, { status: ownDeck.status });

    const publicDecks = await loadPublicDecks(uniquePublicIds);
    if ("error" in publicDecks) return NextResponse.json({ ok: false, code: publicDecks.code, error: publicDecks.error }, { status: publicDecks.status });

    const decks = [ownDeck, ...publicDecks];
    if (decks.length < 2 || decks.length > MAX_DECKS) {
      return NextResponse.json({ ok: false, code: "DECK_COUNT_INVALID", error: "Compare between 2 and 6 decks." }, { status: 400 });
    }
    const format = ownDeck.canonicalFormat;
    const mismatch = decks.find((deck) => deck.canonicalFormat !== format);
    if (mismatch) {
      return NextResponse.json(
        {
          ok: false,
          code: "FORMAT_MISMATCH",
          error: `${mismatch.title} is ${mismatch.format}. Deck Compare V2 currently needs all decks to use ${ownDeck.format}.`,
        },
        { status: 400 },
      );
    }

    const decksRaw = decks.map(formatDeckBlock).join("\n\n---\n\n");
    const grounded = await buildDeckCompareGrounding(decksRaw, ownDeck.format, { maxDecks: MAX_DECKS });
    const model = process.env.MODEL_DECK_COMPARE_V2 || process.env.MODEL_DECK_COMPARE_MOBILE_PRO || DEFAULT_FREE_MODEL;
    const deterministic = buildDeterministicResult(decks, grounded, model);

    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const usageSource = resolveAiUsageSourceForRequest(req, body, null);
    const sourcePage = parsed.data.sourcePage ?? parsed.data.source_page ?? "app_deck_compare_v2";
    const executionContext = {
      ...buildAiRouteExecutionContext({
        userId: user.id,
        isGuest: false,
        isPro: true,
        source: usageSource ?? null,
        sourcePage,
        featureKey: FEATURE_KEY,
        rateLimitKey: ROUTE_PATH,
      }),
      model,
      fallbackModel: DEFAULT_FALLBACK_MODEL,
      latencyBudgetMs: 120000,
    };

    const groundingPacket = buildCompactGroundingPacket({
      title: "GROUND TRUTH",
      format: ownDeck.format,
      lines: grounded.decks.map((deck) => {
        const i = deck.intelligence;
        return `${deck.label}: title=${deck.label}; power=${i.powerScore}/100; tempo=${i.tempoScore}; consistency=${i.consistencyScore}; interaction=${i.interactionScore}; resilience=${i.resilienceScore}; closing=${i.closingScore}; mana=${i.manaQualityScore}; synergy=${i.synergyScore}; price=${i.estimatedPriceUsd ?? "unknown"}; top_cards=${i.premiumCards.join(", ")}; risks=${i.weakSignals.join("; ")}.`;
      }),
    });

    const flow = await runStructuredAiFlow<CompareV2Success>({
      context: executionContext,
      routePath: ROUTE_PATH,
      deterministic,
      judge: {
        enabled: true,
        passName: "judge",
        maxTokens: 1800,
        timeoutMs: 120000,
        buildMessages: () => [
          {
            role: "system",
            content: [
              "You are an expert Magic: The Gathering deck power evaluator.",
              "Return only JSON. Do not invent cards. Use the ground truth numbers and deck titles.",
              "You may adjust each deck's final powerLevel from 1 to 10 if the deterministic score misses synergy, combo density, premium card impact, or format context.",
              "Do not let price alone decide power. Price is only one supporting signal.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              groundingPacket,
              "",
              "Return JSON with this shape:",
              '{"decks":[{"title":"exact title","powerLevel":1-10,"summary":"short","strengths":["max 3"],"weaknesses":["max 3"]}],"verdict":"short overview","bullets":["max 4"]}',
              "",
              `Current deterministic result:\n${JSON.stringify(deterministic)}`,
            ].join("\n"),
          },
        ],
        parse: (text, current) => normalizeAiAdjustedResult(parseJsonObjectFromLlmText(text), current),
      },
      writer: { enabled: false, passName: "writer", buildMessages: () => [], parse: (_text, current) => current },
      critic: { enabled: false, passName: "critic", buildMessages: () => [], parse: (_text, current) => current },
    });

    return NextResponse.json({
      ...flow.value,
      meta: {
        ...flow.value.meta,
        model: flow.model,
        usedAi: flow.usedAi,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("[mobile/deck/compare-v2] route error:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
