import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";
import { DECK_TRANSFORM_FREE } from "@/lib/feature-limits";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import { norm, aggregateCards, parseAiDeckOutputLines, getCommanderColorIdentity, totalDeckQty, trimDeckToMaxQty } from "@/lib/deck/generation-helpers";
import {
  getFormatRules,
  isCommanderFormatString,
  tryDeckFormatStringToAnalyzeFormat,
} from "@/lib/deck/formatRules";
import {
  normalizeTransformBody,
  buildTransformSystemPrompt,
  buildTransformUserPrompt,
} from "@/lib/deck/generation-input";
import { summarizeTransformIntent } from "@/lib/deck/transform-intent";
import { warnSourceOffColor } from "@/lib/deck/transform-warnings";
import { buildGenerationPreviewFacts } from "@/lib/deck/generation-preview-facts";
import { precheckFixLegalitySourceDeck } from "@/lib/deck/transform-legality-check";

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
    const analyzeFormat = tryDeckFormatStringToAnalyzeFormat(input.format);
    if (!analyzeFormat) {
      return NextResponse.json(
        { ok: false, error: "Unsupported format. Use Commander, Modern, Pioneer, Standard, or Pauper." },
        { status: 400 }
      );
    }
    const rules = getFormatRules(analyzeFormat);
    const isCommander = isCommanderFormatString(analyzeFormat);

    if (input.transformIntent === "fix_legality") {
      const precheck = await precheckFixLegalitySourceDeck(input, {
        getCommanderColors: getCommanderColorIdentity,
        warnOffColor: (sourceDeckText, commander) => warnSourceOffColor(sourceDeckText, commander ?? null),
      }).catch((legErr) => {
        console.warn("[deck/transform] Source legality pre-check failed:", legErr);
        return null;
      });

      if (precheck?.alreadyLegal || precheck?.needsDeckSizeOnlyReview) {
        const previewFacts = await buildGenerationPreviewFacts(
          precheck.validatedRows.map((c) => `${c.qty} ${c.name}`).join("\n"),
          precheck.commanderName === "Unknown" ? null : precheck.commanderName,
          precheck.analyzeFormat as "Commander" | "Modern" | "Pioneer" | "Standard" | "Pauper",
        ).catch(() => undefined);

        return NextResponse.json({
          ok: true,
          preview: true,
          decklist: precheck.validatedRows,
          commander: precheck.commanderName,
          colors: precheck.colors,
          deckText: precheck.validatedRows.map((c) => `${c.qty} ${c.name}`).join("\n"),
          format: precheck.analyzeFormat,
          summary: precheck.alreadyLegal
            ? `No legality changes needed. This deck already passes current ${precheck.analyzeFormat} legality and color identity checks.`
            : `Deck size needs review. This list passed legality checks, but it is ${precheck.validatedRows.reduce((sum, row) => sum + row.qty, 0)} cards after validation instead of the expected ${rules.mainDeckTarget}.`,
          warnings: precheck.needsDeckSizeOnlyReview ? precheck.warnings : undefined,
          transformIntent: input.transformIntent,
          ...(previewFacts ? { previewFacts } : {}),
        });
      }
    }

    let isPro = false;
    try {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(user.id);
    } catch {}
    const keyHash = `user:${user.id}`;
    if (!isPro) {
      try {
        const durableLimit = await checkDurableRateLimit(
          supabase,
          keyHash,
          "/api/deck/transform",
          DECK_TRANSFORM_FREE,
          1
        );
        if (!durableLimit.allowed) {
          return NextResponse.json(
            {
              ok: false,
              code: "RATE_LIMIT_DAILY",
              error: `You've used your ${DECK_TRANSFORM_FREE} free AI Workshop refinements today. Upgrade to Pro for unlimited passes.`,
              resetAt: durableLimit.resetAt,
              remaining: 0,
            },
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (e) {
        console.error("[deck/transform] Rate limit check failed:", e);
      }
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

    if (cards.length < 30 && totalDeckQty(cards) < 30) {
      return NextResponse.json(
        { ok: false, error: "Transformed decklist too short; please try again" },
        { status: 500 }
      );
    }

    const commanderName = isCommander ? input.commander || cards[0]?.name || "Unknown" : null;
    const allowedColors = isCommander && commanderName
      ? (await getCommanderColorIdentity(commanderName)).map((c) => c.toUpperCase())
      : [];
    const allNames = cards.map((c) => c.name);
    const details = await getDetailsForNamesCached(allNames);

    const warnings: string[] = [];
    if (isCommander) {
      const warnSrc = await warnSourceOffColor(input.sourceDeckText, input.commander);
      if (warnSrc) warnings.push(warnSrc);
    }

    if (isCommander) {
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
      const filteredQty = totalDeckQty(filtered);
      if (filteredQty > rules.mainDeckTarget) {
        warnings.push(`Model output had ${filteredQty} cards after color filter; list trimmed to ${rules.mainDeckTarget}.`);
        cards = trimDeckToMaxQty(filtered, rules.mainDeckTarget);
      } else {
        cards = filtered;
      }
    }

    try {
      const { filterDecklistQtyRowsForFormat } = await import("@/lib/deck/recommendation-legality");
      const { lines: legalLines, removed } = await filterDecklistQtyRowsForFormat(cards, analyzeFormat, {
        logPrefix: "/api/deck/transform",
      });
      if (removed.length > 0) {
        warnings.push(
          `Legality filter removed ${removed.length} card line(s) not legal in ${analyzeFormat}.`
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
      previewFacts = await buildGenerationPreviewFacts(
        deckText,
        commanderName === "Unknown" ? null : commanderName,
        analyzeFormat,
      );
    } catch {
      // optional
    }

    const finalQty = totalDeckQty(cards);
    if (finalQty < rules.mainDeckTarget) {
      warnings.push(`List has ${finalQty} cards after validation; target is ${rules.mainDeckTarget} for ${analyzeFormat}.`);
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
      format: analyzeFormat,
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
