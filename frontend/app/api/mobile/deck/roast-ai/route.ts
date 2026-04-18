import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractCommanderFromDecklistText } from "@/lib/chat/decklistDetector";
import { prepareDeckCardsForRoast } from "@/lib/roast/deck-roast-prep";
import { computeRoastDeckSignals, ROAST_COMEDY_ANGLE_POOL } from "@/lib/roast/roast-deck-signals";
import { buildMobileRoastAiSystemPrompt, buildMobileRoastAiUserPrompt } from "@/lib/mobile/roast-ai-prompt";
import {
  normalizeMobileRoastAiResponse,
  parseMobileRoastAiJson,
  stripMobileRoastForFormat,
} from "@/lib/mobile/roast-ai-response";
import type { MobileRoastHeat } from "@/lib/mobile/roast-ai-types";

export const runtime = "nodejs";

const ROUTE_PATH = "/api/mobile/deck/roast-ai";

const VALID_FORMATS = ["Commander", "Modern", "Pioneer", "Standard"] as const;

function resolveHeat(body: Record<string, unknown>): { heat: MobileRoastHeat; roastScore: number } {
  const hRaw = body.heat;
  if (typeof hRaw === "string") {
    const h = hRaw.trim().toLowerCase();
    if (h === "mild" || h === "medium" || h === "spicy") {
      const scores = { mild: 2, medium: 5, spicy: 8 } as const;
      return { heat: h, roastScore: scores[h] };
    }
  }
  const rawSavageness =
    typeof body.savageness === "number"
      ? body.savageness
      : body.keepFriendly === false
        ? 8
        : 5;
  const s = Math.max(1, Math.min(10, Math.round(Number(rawSavageness) || 5)));
  if (s <= 3) return { heat: "mild", roastScore: s };
  if (s <= 6) return { heat: "medium", roastScore: s };
  return { heat: "spicy", roastScore: s };
}

export async function POST(req: NextRequest) {
  try {
    let userId: string | null = null;
    let isPro = false;
    try {
      let supabase = await createClient();
      let {
        data: { user },
      } = await supabase.auth.getUser();
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
      if (user) {
        userId = user.id;
        const { checkProStatus } = await import("@/lib/server-pro-check");
        isPro = await checkProStatus(user.id);
      }
    } catch {
      /* optional auth — same class as POST /api/deck/roast */
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const usageSource = resolveAiUsageSourceForRequest(req, body, null);
    const sourcePage =
      (typeof body.sourcePage === "string"
        ? body.sourcePage
        : typeof body.source_page === "string"
          ? body.source_page
          : null
      )?.trim() || null;

    const deckText = String(body?.deckText || "").trim();
    const format = String(body?.format || "Commander").trim();
    const commanderName = typeof body?.commanderName === "string" ? body.commanderName.trim() || null : null;
    const deckNameHint = typeof body?.deckName === "string" ? body.deckName.trim() || null : null;

    if (!deckText) {
      return NextResponse.json({ ok: false, error: "deckText required" }, { status: 400 });
    }

    if (!VALID_FORMATS.includes(format as (typeof VALID_FORMATS)[number])) {
      return NextResponse.json(
        { ok: false, error: `format must be one of: ${VALID_FORMATS.join(", ")}` },
        { status: 400 }
      );
    }

    const deck = await prepareDeckCardsForRoast(req, deckText);
    if (deck.cards.length === 0) {
      return NextResponse.json({ ok: false, error: "Decklist is empty" }, { status: 400 });
    }

    let commander: string | null = commanderName;
    if (format === "Commander" && !commander) {
      commander = extractCommanderFromDecklistText(deckText);
    } else if (format !== "Commander") {
      commander = null;
    }

    const { heat, roastScore } = resolveHeat(body);

    const signals = computeRoastDeckSignals(deck.cards);
    const varietyAngle =
      ROAST_COMEDY_ANGLE_POOL[Math.floor(Math.random() * ROAST_COMEDY_ANGLE_POOL.length)];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OpenAI API key not configured" }, { status: 500 });
    }

    const systemPrompt = buildMobileRoastAiSystemPrompt({
      deck,
      format,
      commander,
      heat,
      deckNameHint,
      signalsBlock: signals.blockForPrompt,
      varietyAngle,
    });
    const userPrompt = buildMobileRoastAiUserPrompt();

    const model = process.env.MODEL_MOBILE_ROAST_AI || "gpt-4o-mini";

    try {
      const { callLLM } = await import("@/lib/ai/unified-llm-client");
      const response = await callLLM(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        {
          route: ROUTE_PATH,
          feature: "deck_roast_mobile",
          model,
          fallbackModel: "gpt-4o-mini",
          maxTokens: 1536,
          apiType: "chat",
          userId,
          isPro,
          source_page: sourcePage,
          source: usageSource ?? null,
          jsonResponse: true,
          promptPreview: systemPrompt.slice(0, 400),
        }
      );

      let parsed: unknown = parseMobileRoastAiJson(response.text);
      if (parsed == null) {
        parsed = {};
      }

      const formatLabel =
        format.length > 0 ? format.charAt(0).toUpperCase() + format.slice(1).toLowerCase() : "Commander";

      let roast = normalizeMobileRoastAiResponse(parsed, {
        heat,
        commander,
        format: formatLabel,
        model: response.actualModel,
      });

      try {
        roast = await stripMobileRoastForFormat(roast, formatLabel, ROUTE_PATH);
      } catch {
        /* non-fatal */
      }

      return NextResponse.json({
        ok: true,
        roast,
        roastScore,
        meta: {
          model: response.actualModel,
          generated_at: new Date().toISOString(),
          route: ROUTE_PATH,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to generate roast";
      console.error("[mobile/deck/roast-ai] AI error:", e);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[mobile/deck/roast-ai] route error:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
