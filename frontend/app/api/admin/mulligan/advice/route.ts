import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminForApi } from "@/lib/server-admin";
import { buildDeckProfileWithTypes, computeHandFactsWithTypes, type HandFacts } from "@/lib/mulligan/deck-profile";
import {
  buildMulliganAdviceCacheKey,
  getMulliganAdviceCache,
  setMulliganAdviceCache,
  CACHE_TTL_SECONDS,
} from "@/lib/mulligan/advice-cache";
import { evaluateHandDeterministically } from "@/lib/mulligan/hand-score";
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
  simulatedTier: z.enum(["guest", "free", "pro"]).optional(),
});

const ResponseSchema = z.object({
  action: z.enum(["KEEP", "MULLIGAN"]),
  confidence: z.number().min(0).max(100).optional(),
  reasons: z.array(z.string()).min(1).max(5),
  suggestedLine: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).max(2).optional(),
});

const MINI_MODEL = process.env.MODEL_SWAP_WHY || "gpt-4o-mini";
const FULL_MODEL =
  process.env.MODEL_PRO_DECK ||
  process.env.MODEL_PRO_CHAT ||
  process.env.OPENAI_MODEL ||
  "gpt-4o";

/** Check if reason mentions a deck card that is NOT in hand (hallucination) */
function reasonMentionsNonHandCard(
  reason: string,
  hand: string[],
  deckCardNames: string[]
): boolean {
  const handLower = new Set(hand.map((c) => c.toLowerCase().trim()));
  const reasonLower = reason.toLowerCase();
  for (const name of deckCardNames) {
    const n = name.toLowerCase().trim();
    if (n.length < 4) continue; // skip short names like "Opt"
    if (handLower.has(n)) continue; // card is in hand, fine
    if (reasonLower.includes(n)) return true; // mentions deck card not in hand = hallucination
  }
  return false;
}

/** Check if reason claims a fact that contradicts handFacts. Bidirectional: presence vs absence. */
function reasonContradictsHandFacts(reason: string, facts: HandFacts): boolean {
  const r = reason.toLowerCase();

  // --- Positive claims when fact is false: "has ramp" but !hasRamp ---
  if (!facts.hasRamp && /\b(has|includes?|with|got|provides?)\s+(ramp|acceleration|early mana|mana rock)\b/i.test(r)) return true;
  if (!facts.hasRamp && /\b(ramp|acceleration|dork|signet)\s+(in|for)\s+(hand|opener)\b/i.test(r)) return true;
  if (!facts.hasTutor && /\b(has|includes?|with|got)\s+tutor\b/i.test(r)) return true;
  if (!facts.hasTutor && /\btutor\s+(in|for|finds?)\s+(hand|opener)\b/i.test(r)) return true;
  if (!facts.hasDrawEngine && /\b(has|includes?|with|got)\s+(draw|engine|rhystic|remora)\b/i.test(r)) return true;
  if (!facts.hasDrawEngine && /\b(draw|engine)\s+(in|for)\s+(hand|opener)\b/i.test(r)) return true;
  if (!facts.hasInteraction && /\b(has|includes?|with|got)\s+(interaction|counter|removal)\b/i.test(r)) return true;
  if (!facts.hasProtection && /\b(has|includes?|with|got)\s+protection\b/i.test(r)) return true;
  if (!facts.hasFastMana && /\b(has|includes?|with|got)\s+(fast mana|mana crypt|explosive start)\b/i.test(r)) return true;

  // --- Inverse: "no acceleration" / "lacks ramp" when hasFastMana || hasRamp ---
  const hasAccel = facts.hasFastMana || facts.hasRamp;
  if (hasAccel && /\b(no|lack|lacks|without|missing)\s+(acceleration|ramp|early mana|mana rock|fast mana)\b/i.test(r)) return true;
  if (hasAccel && /\b(doesn't|does not)\s+(have|include)\s+(ramp|acceleration)\b/i.test(r)) return true;
  if (facts.hasInteraction && /\b(no|lack|lacks|without|missing)\s+interaction\b/i.test(r)) return true;
  if (facts.hasInteraction && /\b(doesn't|does not)\s+(have|include)\s+interaction\b/i.test(r)) return true;

  // --- "Mana is shaky" when handLandCount >= 3 and colors look fine ---
  const manaStable = facts.handLandCount >= 3 && facts.colorsAvailable.length >= 2;
  if (manaStable && /\b(mana is shaky|mana screw|color screw|color issues|colorless|no colors)\b/i.test(r)) return true;
  if (manaStable && /\b(shaky|unreliable)\s+mana\b/i.test(r)) return true;

  return false;
}

/** Check if reason references generic commander averages (banhammer) */
function reasonReferencesGenericCommander(reason: string): boolean {
  const r = reason.toLowerCase();
  return (
    /average (for )?commander|typical commander|in commander you usually|commander (land )?average|typical (land )?count/i.test(r) ||
    /\b(usually|typically|on average)\s+(in|for)\s+commander\b/i.test(r)
  );
}

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

  const { modelTier, playDraw, mulliganCount, hand, deck, simulatedTier } = parsed.data;

  // Tier simulation: guest/free cannot use FULL model
  const effectiveTier = simulatedTier ?? "pro";
  const effectiveModelTier =
    effectiveTier !== "pro" ? "mini" : (modelTier as "mini" | "full");

  const [profile, handFacts] = await Promise.all([
    buildDeckProfileWithTypes(deck.cards, deck.commander ?? null),
    computeHandFactsWithTypes(hand),
  ]);

  const handEval = evaluateHandDeterministically({
    profile,
    handFacts,
    hand,
    playDraw,
    mulliganCount,
  });

  const cacheKey = buildMulliganAdviceCacheKey(
    deck,
    hand,
    playDraw,
    mulliganCount,
    effectiveModelTier,
    "commander"
  );

  const cached = await getMulliganAdviceCache(cacheKey);
  if (cached?.response_json) {
    const parsedResp = ResponseSchema.safeParse(cached.response_json);
    if (parsedResp.success) {
      const result = parsedResp.data;
      return NextResponse.json({
        ok: true,
        action: result.action,
        confidence: result.confidence,
        reasons: result.reasons,
        suggestedLine: result.suggestedLine,
        warnings: result.warnings,
        dependsOn: result.dependsOn,
        model: cached.model_used,
        modelUsed: cached.model_used,
        profileSummary: `${profile.archetype} v${profile.velocityScore} ${profile.mulliganStyle}`,
        handFacts,
        handEval: { score: handEval.score, tags: handEval.tags, keepBias: handEval.keepBias },
        cached: true,
        cacheKey,
        cacheTtlSeconds: CACHE_TTL_SECONDS,
        effectiveTier,
        effectiveModelTier,
      });
    }
  }

  const systemPrompt = `You are an MTG Commander mulligan coach. Output valid JSON only, no markdown or extra text.

RULES:
- Use the DeckProfile and keepHeuristics. Compare the hand RELATIVE to this deck's density only.
- Do NOT reference "average commander land count", "typical commander", or "in commander you usually" at all. Only talk about this deck's landPercent and density.
- You MUST NOT claim the hand contains ramp/tutor/draw/interaction/protection/fast mana unless handFacts says so. handFacts is authoritative.
- deterministicKeepBias is a policy anchor: If KEEP, only output MULLIGAN if you can cite a specific strong reason (e.g. 0 lands, uncastable colors). If MULLIGAN, only output KEEP if you can cite specific stabilizers (e.g. multiple lands + acceleration + engine).
- Every reason MUST reference either: (a) a specific card actually in the hand, or (b) a profile baseline (e.g. "deck expects early acceleration").
- Do not invent cards. If uncertain, say so briefly.

Output format:
{"action":"KEEP"|"MULLIGAN","confidence":0-100,"reasons":["...","..."],"suggestedLine":"...","warnings":["..."],"dependsOn":["..."]}
- action: KEEP or MULLIGAN
- confidence: 0-100 (required)
- reasons: 2-5 bullets, each max 140 chars, each must cite a hand card or profile baseline
- suggestedLine: 1 short line for ideal first 2 turns (e.g. "T1 dork, T2 Rhystic; hold up Offer")
- warnings: optional array of caveats
- dependsOn: optional 0-2 items for matchup/pod speed dependencies`;

  const userPrompt = `DeckProfile (use these baselines; do not use generic commander stats):
${JSON.stringify(profile)}

handFacts (authoritative; do NOT claim hand has ramp/tutor/etc unless handFacts says so):
${JSON.stringify(handFacts)}

deterministicKeepBias: ${handEval.keepBias}
deterministicScore: ${handEval.score}
deterministicTags: ${JSON.stringify(handEval.tags)}

Hand: ${JSON.stringify(hand)}

Context: playDraw=${playDraw}, mulliganCount=${mulliganCount}

Task: Decide KEEP or MULLIGAN for this specific deck. Respect deterministicKeepBias as policy anchor. Explain relative to the deck's profile. Output JSON only.`;

  const model = effectiveModelTier === "mini" ? MINI_MODEL : FULL_MODEL;

  if (process.env.NODE_ENV === "development") {
    console.log(
      "[admin/mulligan/advice] effectiveModelTier=%s model=%s mulliganCount=%s handSize=%s profile=%s cached=%s",
      effectiveModelTier,
      model,
      mulliganCount,
      hand.length,
      `${profile.archetype}/${profile.velocityScore}`,
      !!cached?.response_json
    );
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
        maxTokens: 400,
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

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Model did not return valid JSON", raw: response.text.slice(0, 500) },
        { status: 500 }
      );
    }

    const parsedResp = ResponseSchema.safeParse(raw);
    let result: z.infer<typeof ResponseSchema>;

    if (parsedResp.success) {
      result = parsedResp.data;
    } else {
      result = {
        action: (raw as { action?: string })?.action === "MULLIGAN" ? "MULLIGAN" : "KEEP",
        confidence: 50,
        reasons: ["Unable to parse model output; defaulting to KEEP with low confidence."],
        suggestedLine: (raw as { suggestedLine?: string })?.suggestedLine,
        warnings: ["Model response validation failed."],
      };
    }

    // Sanity check: reasons must not mention cards not in hand (hallucination) or contradict handFacts
    const deckCardNames = deck.cards.map((c) => c.name);
    const validReasons: string[] = [];
    for (const r of result.reasons) {
      const trimmed = String(r).slice(0, 140);
      if (reasonMentionsNonHandCard(trimmed, hand, deckCardNames)) {
        validReasons.push("Hand lacks the deck's typical early acceleration density.");
      } else if (reasonReferencesGenericCommander(trimmed)) {
        validReasons.push("Hand evaluated relative to deck profile.");
      } else if (reasonContradictsHandFacts(trimmed, handFacts)) {
        validReasons.push("Hand evaluated relative to deck profile and hand facts.");
      } else {
        validReasons.push(trimmed);
      }
    }

    result.reasons =
      validReasons.length >= 2
        ? validReasons
        : [
            validReasons[0] || "Hand evaluated relative to deck profile.",
            "Consider deck's velocity and keep heuristics.",
          ];

    if (result.confidence == null) {
      result.confidence = 50;
    }
    result.confidence = Math.max(0, Math.min(100, Number(result.confidence)));

    // Hard overrides: universal rules
    if (handFacts.handLandCount === 0) {
      result.action = "MULLIGAN";
      result.confidence = Math.max(result.confidence, 85);
    } else if (
      handFacts.handLandCount === 1 &&
      !handFacts.hasRamp &&
      !handFacts.hasFastMana
    ) {
      result.action = "MULLIGAN";
      result.confidence = Math.max(result.confidence, 75);
    }

    // Post-process: enforce consistency with deterministicKeepBias (clamp confidence, add honesty)
    if (handEval.keepBias === "KEEP" && result.action === "MULLIGAN" && result.confidence >= 75) {
      result.confidence = 60;
      result.reasons = [
        "Deterministic check rates this as a stable keep for this deck; mulligan only if pod is very fast.",
        ...result.reasons.slice(0, 3),
      ].slice(0, 5);
    } else if (
      handEval.keepBias === "MULLIGAN" &&
      result.action === "KEEP" &&
      result.confidence >= 75
    ) {
      result.confidence = 60;
      result.reasons = [
        "Deterministic check flags this as risky; keep only if you accept a slow start.",
        ...result.reasons.slice(0, 3),
      ].slice(0, 5);
    }

    const profileSummary = `${profile.archetype} v${profile.velocityScore} ${profile.mulliganStyle} (${profile.landPercent}% lands, ${profile.fastManaCount} fastMana, ${profile.tutorCount} tutors)`;

    const payload = {
      ok: true,
      action: result.action,
      confidence: result.confidence,
      reasons: result.reasons,
      suggestedLine: result.suggestedLine,
      warnings: result.warnings,
      dependsOn: result.dependsOn,
      model: response.actualModel,
      modelUsed: response.actualModel,
      profileSummary,
      handFacts,
      handEval: { score: handEval.score, tags: handEval.tags, keepBias: handEval.keepBias },
      cached: false,
      cacheKey,
      cacheTtlSeconds: CACHE_TTL_SECONDS,
      effectiveTier,
      effectiveModelTier,
    };

    await setMulliganAdviceCache(cacheKey, payload, response.actualModel);

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "LLM call failed";
    console.error("[admin/mulligan/advice] Error:", e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}
