import { NextRequest, NextResponse } from "next/server";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import {
  CARD_EXPLAIN_FREE,
  CARD_EXPLAIN_GUEST,
  CARD_EXPLAIN_PRO,
} from "@/lib/feature-limits";
import { hashGuestToken, hashString } from "@/lib/guest-tracking";
import { createClient, createClientWithBearerToken } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE_PATH = "/api/mobile/card/explain";
const FEATURE = "card_explain_mobile";
const VALID_MODES = new Set(["eli5", "tactics"]);
const MAX_CARD_FIELD_CHARS = 4_000;

type ExplainMode = "eli5" | "tactics";
type Tier = "guest" | "free" | "pro";

type CardExplainRequestBody = {
  mode?: unknown;
  card?: {
    name?: unknown;
    displayName?: unknown;
    oracleText?: unknown;
    typeLine?: unknown;
    manaCost?: unknown;
    setCode?: unknown;
    collectorNumber?: unknown;
  };
  priorExplanation?: unknown;
  sourcePage?: unknown;
  source_page?: unknown;
};

function trimmedString(value: unknown, maxLength = MAX_CARD_FIELD_CHARS): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function jsonError(
  status: number,
  payload: {
    code: string;
    error: string;
    tier?: Tier;
    limit?: number;
    remaining?: number;
    resetAt?: string | null;
    requiresAuth?: boolean;
    proRequired?: boolean;
  }
) {
  return NextResponse.json({ ok: false, ...payload }, { status });
}

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0]?.trim() || "unknown" : req.headers.get("x-real-ip") || "unknown";
}

function isSupabaseAnonymousUser(user: unknown): boolean {
  return Boolean((user as { is_anonymous?: unknown } | null)?.is_anonymous === true);
}

function buildSystemPrompt(mode: ExplainMode): string {
  if (mode === "tactics") {
    return `You are ManaTap AI, an expert Magic: The Gathering coach.

Explain tactical uses for one Magic card from its supplied oracle text.
Be specific, practical, and concise.
Use 3-5 short bullets.
Cover timing, use-cases, synergies, deck fit, and common pitfalls when relevant.
Do not invent card text, prices, formats, combos, or unsupported rulings.
If the supplied text is ambiguous, explain the likely practical meaning without pretending to be an official judge.`;
  }

  return `You are ManaTap AI, a friendly Magic: The Gathering teacher.

Explain one Magic card from its supplied oracle text like the reader is new to the game.
Use 2-4 short sentences.
Focus on what the card does and why that matters in play.
Avoid jargon where possible, and do not invent card text, prices, combos, or unsupported rulings.`;
}

function buildUserPrompt(params: {
  mode: ExplainMode;
  name: string;
  displayName: string;
  oracleText: string;
  typeLine: string;
  manaCost: string;
  setCode: string;
  collectorNumber: string;
  priorExplanation: string;
}): string {
  const cardLines = [
    `Card name: ${params.displayName || params.name}`,
    params.manaCost ? `Mana cost: ${params.manaCost}` : null,
    params.typeLine ? `Type line: ${params.typeLine}` : null,
    params.setCode ? `Set code: ${params.setCode}` : null,
    params.collectorNumber ? `Collector number: ${params.collectorNumber}` : null,
    `Oracle text:\n${params.oracleText}`,
  ].filter(Boolean);

  if (params.mode === "tactics") {
    return `${cardLines.join("\n")}${params.priorExplanation ? `\n\nShort explanation already shown:\n${params.priorExplanation}` : ""}

Give deeper tactics and use-cases for this card. Keep the answer useful inside a mobile card detail modal.`;
  }

  return `${cardLines.join("\n")}

Explain this card in simple terms for a newer player. Keep the answer short enough for a mobile card detail modal.`;
}

export async function POST(req: NextRequest) {
  try {
    let supabase = await createClient();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
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

    const body = (await req.json().catch(() => ({}))) as CardExplainRequestBody;
    const modeRaw = trimmedString(body.mode, 20).toLowerCase();
    if (!VALID_MODES.has(modeRaw)) {
      return jsonError(400, {
        code: "VALIDATION_ERROR",
        error: "mode must be eli5 or tactics",
      });
    }
    const mode = modeRaw as ExplainMode;

    const card = body.card && typeof body.card === "object" ? body.card : null;
    const name = trimmedString(card?.name, 240);
    const oracleText = trimmedString(card?.oracleText);
    if (!name) {
      return jsonError(400, {
        code: "VALIDATION_ERROR",
        error: "card.name required",
      });
    }
    if (!oracleText) {
      return jsonError(400, {
        code: "MISSING_ORACLE_TEXT",
        error: "card.oracleText required",
      });
    }

    const isAnonymousUser = isSupabaseAnonymousUser(user);
    const realUserId = user && !isAnonymousUser ? user.id : null;
    let isPro = false;
    if (realUserId) {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(realUserId);
    }

    const tier: Tier = realUserId ? (isPro ? "pro" : "free") : "guest";
    const dailyLimit =
      tier === "pro" ? CARD_EXPLAIN_PRO : tier === "free" ? CARD_EXPLAIN_FREE : CARD_EXPLAIN_GUEST;

    if (mode === "tactics" && !isPro) {
      return jsonError(403, {
        code: "PRO_REQUIRED",
        error: "Deeper tactics are a Pro feature.",
        tier,
        limit: dailyLimit,
        remaining: 0,
        resetAt: null,
        proRequired: true,
      });
    }

    const { getGuestToken } = await import("@/lib/api/get-guest-token");
    const { guestToken } = await getGuestToken(req);
    const ip = getIp(req);
    const keyHash = realUserId
      ? `user:${await hashString(realUserId)}`
      : guestToken
        ? `guest:${await hashGuestToken(guestToken)}`
        : isAnonymousUser && user?.id
          ? `guest:${await hashString(`anonymous-user:${user.id}`)}`
          : `ip:${await hashString(ip)}`;

    const rateLimit = await checkDurableRateLimit(supabase, keyHash, ROUTE_PATH, dailyLimit, 1);
    if (!rateLimit.allowed) {
      return jsonError(429, {
        code: "RATE_LIMIT_DAILY",
        error: "Daily card explanation limit reached. Try again tomorrow.",
        tier,
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt ?? null,
        requiresAuth: tier === "guest",
      });
    }

    const { allowAIRequest } = await import("@/lib/server/budgetEnforcement");
    const budgetCheck = await allowAIRequest(supabase);
    if (!budgetCheck.allow) {
      return jsonError(429, {
        code: "BUDGET_LIMIT",
        error: budgetCheck.reason || "Server AI budget limit reached. Try again later.",
        tier,
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt ?? null,
        requiresAuth: tier === "guest",
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return jsonError(500, {
        code: "AI_UNAVAILABLE",
        error: "OpenAI API key not configured",
        tier,
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt ?? null,
        requiresAuth: tier === "guest",
      });
    }

    const sourcePage =
      (typeof body.sourcePage === "string"
        ? body.sourcePage
        : typeof body.source_page === "string"
          ? body.source_page
          : null
      )?.trim() || null;
    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const usageSource = resolveAiUsageSourceForRequest(req, body, null);
    const anonId = realUserId
      ? await hashString(realUserId)
      : guestToken
        ? await hashGuestToken(guestToken)
        : isAnonymousUser && user?.id
          ? await hashString(`anonymous-user:${user.id}`)
          : await hashString(`card-explain:ip:${ip}`);

    const displayName = trimmedString(card?.displayName, 240);
    const typeLine = trimmedString(card?.typeLine, 500);
    const manaCost = trimmedString(card?.manaCost, 120);
    const setCode = trimmedString(card?.setCode, 40);
    const collectorNumber = trimmedString(card?.collectorNumber, 80);
    const priorExplanation = trimmedString(body.priorExplanation, 2_000);

    const { getModelForTier } = await import("@/lib/ai/model-by-tier");
    const modelForTier = getModelForTier({
      isGuest: tier === "guest",
      userId: realUserId,
      isPro,
      useCase: "chat",
    });

    const systemPrompt = buildSystemPrompt(mode);
    const userPrompt = buildUserPrompt({
      mode,
      name,
      displayName,
      oracleText,
      typeLine,
      manaCost,
      setCode,
      collectorNumber,
      priorExplanation,
    });

    try {
      const { callLLM } = await import("@/lib/ai/unified-llm-client");
      const response = await callLLM(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        {
          route: ROUTE_PATH,
          feature: FEATURE,
          model: modelForTier.model,
          fallbackModel: modelForTier.fallbackModel,
          timeout: 45000,
          maxTokens: mode === "tactics" ? 700 : 300,
          apiType: "chat",
          userId: realUserId,
          isPro,
          source_page: sourcePage,
          source: usageSource ?? null,
          anonId,
          promptPreview: userPrompt.slice(0, 500),
        }
      );

      return NextResponse.json({
        ok: true,
        mode,
        tier,
        text: response.text.trim(),
        remaining: rateLimit.remaining,
        limit: rateLimit.limit,
        resetAt: rateLimit.resetAt,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to explain card";
      console.error("[mobile/card/explain] AI error:", e);
      return jsonError(500, {
        code: "AI_UNAVAILABLE",
        error: message,
        tier,
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt ?? null,
        requiresAuth: tier === "guest",
      });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("[mobile/card/explain] route error:", e);
    return jsonError(500, {
      code: "SERVER_ERROR",
      error: message,
    });
  }
}
