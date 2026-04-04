import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { sanitizeName } from "@/lib/profanity";
import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";
import { GENERATE_FROM_COLLECTION_FREE, GENERATE_FROM_COLLECTION_PRO } from "@/lib/feature-limits";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import { norm, aggregateCards, parseAiDeckOutputLines, getCommanderColorIdentity } from "@/lib/deck/generation-helpers";
import {
  normalizeGenerationBody,
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
} from "@/lib/deck/generation-input";
import { buildGenerationPreviewFacts } from "@/lib/deck/generation-preview-facts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export const runtime = "nodejs";

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

    if (!collectionId && !commander) {
      return NextResponse.json(
        { ok: false, error: "Provide collectionId and/or commander (at least one required)" },
        { status: 400 }
      );
    }

    // Rate limit by tier (free vs pro)
    let isPro = false;
    try {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(user.id);
    } catch {}
    const dailyLimit = isPro ? GENERATE_FROM_COLLECTION_PRO : GENERATE_FROM_COLLECTION_FREE;
    const keyHash = `user:${user.id}`;
    try {
      const durableLimit = await checkDurableRateLimit(
        supabase,
        keyHash,
        "/api/deck/generate-from-collection",
        dailyLimit,
        1
      );
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
      console.error("[generate-from-collection] Rate limit check failed:", e);
    }

    // Fetch collection cards if collectionId provided
    let collectionItems: Array<{ name: string; qty: number }> = [];
    if (collectionId) {
      const { data: col } = await supabase
        .from("collections")
        .select("id, user_id")
        .eq("id", collectionId)
        .maybeSingle();
      if (!col || col.user_id !== user.id) {
        return NextResponse.json({ ok: false, error: "Collection not found or access denied" }, { status: 403 });
      }
      const { data: cards } = await supabase
        .from("collection_cards")
        .select("name, qty")
        .eq("collection_id", collectionId);
      collectionItems = (cards ?? []).map((c) => ({ name: c.name, qty: Number(c.qty) || 1 }));
    }

    const collectionList =
      collectionItems.length > 0
        ? collectionItems.map((c) => `- ${c.name} x${c.qty}`).join("\n")
        : "No collection provided; generate a deck from the full card pool.";

    const systemPrompt = buildGenerationSystemPrompt();
    const userPrompt = buildGenerationUserPrompt(input, collectionList);

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

    const payload = prepareOpenAIBody({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 12000,
      temperature: 0.7,
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
      return NextResponse.json(
        { ok: false, error: "Deck generation failed" },
        { status: 500 }
      );
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const finishReason = data?.choices?.[0]?.finish_reason as string | undefined;
    const parsed = parseAiDeckOutputLines(content);
    let cards = aggregateCards(parsed);

    if (cards.length < 30) {
      console.error("[generate-from-collection] deck too short", {
        finishReason,
        contentLen: typeof content === "string" ? content.length : 0,
        parsedLines: parsed.length,
        uniqueCards: cards.length,
        head: typeof content === "string" ? content.slice(0, 500) : "",
      });
      const hint =
        finishReason === "length"
          ? " Output hit the size limit — tap try again."
          : "";
      return NextResponse.json(
        { ok: false, error: `Generated decklist too short; please try again.${hint}` },
        { status: 500 }
      );
    }

    const commanderName = commander || cards[0]?.name || "Unknown";
    const allowedColors = (await getCommanderColorIdentity(commanderName)).map((c) => c.toUpperCase());
    const allNames = cards.map((c) => c.name);
    const details = await getDetailsForNamesCached(allNames);

    // Filter out color identity violations
    const filtered = cards.filter((c) => {
      const entry = details.get(norm(c.name));
      if (!entry) return true; // Unknown cards: keep (e.g. basic lands)
      return isWithinColorIdentity(entry as SfCard, allowedColors);
    });

    // Trim to exactly 100 cards (prioritize order from AI; remove extras from end)
    if (filtered.length > 100) {
      cards = filtered.slice(0, 100);
    } else {
      cards = filtered;
    }

    const deckText = cards.map((c) => `${c.qty} ${c.name}`).join("\n");
    const colors = allowedColors;
    const overallAim = playstyle
      ? `A ${powerLevel} ${playstyle} Commander deck led by ${commanderName}.`
      : `A ${powerLevel} Commander deck led by ${commanderName}.`;
    const title = sanitizeName(
      commander ? `${commander} (AI)` : `AI Deck from Collection`,
      120
    );

    let previewFacts: Awaited<ReturnType<typeof buildGenerationPreviewFacts>> = undefined;
    try {
      previewFacts = await buildGenerationPreviewFacts(deckText, commanderName === "Unknown" ? null : commanderName);
    } catch {
      // optional
    }

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
      plan: "Optimized",
      ...(previewFacts ? { previewFacts } : {}),
    });
  } catch (e: unknown) {
    console.error("[generate-from-collection]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
