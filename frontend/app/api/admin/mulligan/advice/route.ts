import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminForApi } from "@/lib/server-admin";
import { buildDeckProfile } from "@/lib/mulligan/deck-profile";
import { parseDecklist } from "@/lib/mulligan/parse-decklist";
import { callLLM } from "@/lib/ai/unified-llm-client";

export const runtime = "nodejs";

const AdviceSchema = z.object({
  modelTier: z.enum(["mini", "full"]),
  format: z.literal("commander"),
  playDraw: z.enum(["play", "draw"]),
  mulliganCount: z.number().min(0).max(7),
  hand: z.array(z.string()).min(1).max(7),
  deck: z.object({
    cards: z.array(z.object({ name: z.string(), count: z.number() })),
    commander: z.string().nullable().optional(),
  }),
});

const MINI_MODEL = process.env.MODEL_SWAP_WHY || "gpt-4o-mini";
const FULL_MODEL =
  process.env.MODEL_PRO_DECK ||
  process.env.MODEL_PRO_CHAT ||
  process.env.OPENAI_MODEL ||
  "gpt-4o";

export async function POST(req: NextRequest) {
  const admin = await requireAdminForApi();
  if (!admin.ok) {
    return admin.response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = AdviceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { modelTier, playDraw, mulliganCount, hand, deck } = parsed.data;

  const profile = buildDeckProfile(deck.cards, deck.commander ?? null);

  const systemPrompt = `You are an MTG mulligan coach for Commander. You MUST output valid JSON only, no markdown or extra text.
Be specific. Use the deck profile and hand. Consider play/draw and mulligan count.
Do not invent cards not in the hand. If uncertain, say so briefly in reasons.
Output format: {"action":"KEEP"|"MULLIGAN","confidence":0-100,"reasons":["...","..."],"suggestedLine":"...","warnings":["..."]}
- action: KEEP or MULLIGAN
- confidence: 0-100 (optional but preferred)
- reasons: 2-5 bullet points, each max 140 chars
- suggestedLine: 0-1 short line for ideal first 2 turns (optional)
- warnings: optional array of caveats`;

  const userPrompt = `DeckProfile: ${JSON.stringify(profile)}
Hand: ${JSON.stringify(hand)}
Context: playDraw=${playDraw}, mulliganCount=${mulliganCount}
Task: Decide KEEP or MULLIGAN and explain succinctly. Output JSON only.`;

  const model = modelTier === "mini" ? MINI_MODEL : FULL_MODEL;

  if (process.env.NODE_ENV === "development") {
    console.log("[admin/mulligan/advice] modelTier=%s model=%s mulliganCount=%s handSize=%s", modelTier, model, mulliganCount, hand.length);
  }

  try {
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        route: "/api/admin/mulligan/advice",
        feature: "mulligan_advice",
        model,
        fallbackModel: MINI_MODEL,
        timeout: 30000,
        maxTokens: 300,
        apiType: "chat",
        userId: admin.user.id,
        isPro: true,
        anonId: null,
        skipRecordAiUsage: false,
        source: "admin_mulligan_playground",
      }
    );

    let text = response.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }

    let result: {
      action: "KEEP" | "MULLIGAN";
      confidence?: number;
      reasons: string[];
      suggestedLine?: string;
      warnings?: string[];
    };

    try {
      result = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Model did not return valid JSON", raw: response.text.slice(0, 500) },
        { status: 500 }
      );
    }

    if (result.action !== "KEEP" && result.action !== "MULLIGAN") {
      result.action = result.reasons?.length ? "MULLIGAN" : "KEEP";
    }

    result.reasons = (result.reasons || []).slice(0, 5).map((r: string) => String(r).slice(0, 140));
    if (result.confidence != null) {
      result.confidence = Math.max(0, Math.min(100, Number(result.confidence)));
    }

    return NextResponse.json({
      ok: true,
      action: result.action,
      confidence: result.confidence,
      reasons: result.reasons,
      suggestedLine: result.suggestedLine,
      warnings: result.warnings,
      model: response.actualModel,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "LLM call failed";
    console.error("[admin/mulligan/advice] Error:", e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}
