import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";
import { GENERATE_FROM_COLLECTION_FREE, GENERATE_FROM_COLLECTION_PRO } from "@/lib/feature-limits";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import { norm, aggregateCards, parseAiDeckOutputLines, getCommanderColorIdentity } from "@/lib/deck/generation-helpers";
import {
  normalizeTransformBody,
  buildTransformSystemPrompt,
  buildTransformUserPrompt,
} from "@/lib/deck/generation-input";
import { summarizeTransformIntent } from "@/lib/deck/transform-intent";
import { warnSourceOffColor } from "@/lib/deck/transform-warnings";
import { buildGenerationPreviewFacts } from "@/lib/deck/generation-preview-facts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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
    const parsed = normalizeTransformBody(rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    const input = parsed.input;

    if (input.format.toLowerCase() !== "commander") {
      return NextResponse.json(
        { ok: false, error: "Only Commander format is supported for deck transform at this time" },
        { status: 400 }
      );
    }

    let isPro = false;
    try {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(user.id);
    } catch {}
    // Share daily cap with generate-from-collection (same family; do not double quota).
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
      console.error("[deck/transform] Rate limit check failed:", e);
    }

    const systemPrompt = buildTransformSystemPrompt(input.format);
    const userPrompt = buildTransformUserPrompt(input);

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
      max_completion_tokens: 8000,
      temperature: 0.55,
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
      console.error("[deck/transform] OpenAI error:", resp.status, errText);
      return NextResponse.json(
        { ok: false, error: "Deck transform failed" },
        { status: 500 }
      );
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const parsedLines = parseAiDeckOutputLines(content);
    let cards = aggregateCards(parsedLines);

    if (cards.length < 30) {
      return NextResponse.json(
        { ok: false, error: "Transformed decklist too short; please try again" },
        { status: 500 }
      );
    }

    const commanderName = input.commander || cards[0]?.name || "Unknown";
    const allowedColors = (await getCommanderColorIdentity(commanderName)).map((c) => c.toUpperCase());
    const allNames = cards.map((c) => c.name);
    const details = await getDetailsForNamesCached(allNames);

    const warnings: string[] = [];
    const warnSrc = await warnSourceOffColor(input.sourceDeckText, input.commander);
    if (warnSrc) warnings.push(warnSrc);

    const beforeCi = cards.length;
    const filtered = cards.filter((c) => {
      const entry = details.get(norm(c.name));
      if (!entry) return true;
      return isWithinColorIdentity(entry as SfCard, allowedColors);
    });
    const droppedCi = beforeCi - filtered.length;
    if (droppedCi > 0) {
      warnings.push(
        `Color identity validation removed ${droppedCi} card line(s) from the model output (off-color or unknown).`
      );
    }

    if (filtered.length > 100) {
      warnings.push(`Model output had ${filtered.length} cards after color filter; list trimmed to 100.`);
      cards = filtered.slice(0, 100);
    } else {
      cards = filtered;
    }

    try {
      const { filterDecklistQtyRowsForFormat } = await import("@/lib/deck/recommendation-legality");
      const { lines: legalLines, removed } = await filterDecklistQtyRowsForFormat(cards, input.format, {
        logPrefix: "/api/deck/transform",
      });
      if (removed.length > 0) {
        warnings.push(
          `Legality filter removed ${removed.length} card line(s) not legal in ${input.format}.`
        );
      }
      cards = legalLines;
    } catch (legErr) {
      console.warn("[deck/transform] Legality filter failed:", legErr);
    }

    const deckText = cards.map((c) => `${c.qty} ${c.name}`).join("\n");
    const colors = allowedColors;

    let previewFacts: Awaited<ReturnType<typeof buildGenerationPreviewFacts>> = undefined;
    try {
      previewFacts = await buildGenerationPreviewFacts(deckText, commanderName === "Unknown" ? null : commanderName);
    } catch {
      // optional
    }

    if (cards.length < 100) {
      warnings.push(`List has ${cards.length} cards after validation; target is 100 for Commander.`);
    }

    const intentLabel = summarizeTransformIntent(input.transformIntent);
    let summary = `Transformed: ${intentLabel}. Power ${input.powerLevel}, budget ${input.budget}.`;
    if (previewFacts?.avg_cmc != null && previewFacts.avg_cmc > 0) {
      summary += ` Avg CMC ~${previewFacts.avg_cmc}.`;
    }

    return NextResponse.json({
      ok: true,
      preview: true,
      decklist: cards,
      commander: commanderName,
      colors,
      deckText,
      format: input.format,
      summary,
      warnings: warnings.length ? warnings : undefined,
      transformIntent: input.transformIntent,
      ...(previewFacts ? { previewFacts } : {}),
    });
  } catch (e: unknown) {
    console.error("[deck/transform]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
