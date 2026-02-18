/**
 * Shared mulligan advice logic for admin and production APIs.
 */

import { z } from "zod";
import { buildDeckProfileWithTypes, computeHandFactsWithTypes, type HandFacts } from "@/lib/mulligan/deck-profile";
import {
  buildMulliganAdviceCacheKey,
  getMulliganAdviceCache,
  setMulliganAdviceCache,
  CACHE_TTL_SECONDS,
} from "@/lib/mulligan/advice-cache";
import { logMulliganRun } from "@/lib/mulligan/run-logger";
import { evaluateHandDeterministically } from "@/lib/mulligan/hand-eval";
import { computeHandTags } from "@/lib/mulligan/hand-tags";
import { callLLM } from "@/lib/ai/unified-llm-client";
import { costUSD } from "@/lib/ai/pricing";

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

function reasonMentionsNonHandCard(reason: string, hand: string[], deckCardNames: string[]): boolean {
  const handLower = new Set(hand.map((c) => c.toLowerCase().trim()));
  const reasonLower = reason.toLowerCase();
  for (const name of deckCardNames) {
    const n = name.toLowerCase().trim();
    if (n.length < 4) continue;
    if (handLower.has(n)) continue;
    if (reasonLower.includes(n)) return true;
  }
  return false;
}

function reasonContradictsHandFacts(reason: string, facts: HandFacts): boolean {
  const r = reason.toLowerCase();
  if (!facts.hasRamp && /\b(has|includes?|with|got|provides?)\s+(ramp|acceleration|early mana|mana rock)\b/i.test(r)) return true;
  if (!facts.hasRamp && /\b(ramp|acceleration|dork|signet)\s+(in|for)\s+(hand|opener)\b/i.test(r)) return true;
  if (!facts.hasTutor && /\b(has|includes?|with|got)\s+tutor\b/i.test(r)) return true;
  if (!facts.hasTutor && /\btutor\s+(in|for|finds?)\s+(hand|opener)\b/i.test(r)) return true;
  if (!facts.hasDrawEngine && /\b(has|includes?|with|got)\s+(draw|engine|rhystic|remora)\b/i.test(r)) return true;
  if (!facts.hasDrawEngine && /\b(draw|engine)\s+(in|for)\s+(hand|opener)\b/i.test(r)) return true;
  if (!facts.hasInteraction && /\b(has|includes?|with|got)\s+(interaction|counter|removal)\b/i.test(r)) return true;
  if (!facts.hasProtection && /\b(has|includes?|with|got)\s+protection\b/i.test(r)) return true;
  if (!facts.hasFastMana && /\b(has|includes?|with|got)\s+(fast mana|mana crypt|explosive start)\b/i.test(r)) return true;
  const hasAccel = facts.hasFastMana || facts.hasRamp;
  if (hasAccel && /\b(no|lack|lacks|without|missing)\s+(acceleration|ramp|early mana|mana rock|fast mana)\b/i.test(r)) return true;
  if (hasAccel && /\b(doesn't|does not)\s+(have|include)\s+(ramp|acceleration)\b/i.test(r)) return true;
  if (facts.hasInteraction && /\b(no|lack|lacks|without|missing)\s+interaction\b/i.test(r)) return true;
  if (facts.hasInteraction && /\b(doesn't|does not)\s+(have|include)\s+interaction\b/i.test(r)) return true;
  const manaStable = facts.handLandCount >= 3 && facts.colorsAvailable.length >= 2;
  if (manaStable && /\b(mana is shaky|mana screw|color screw|color issues|colorless|no colors)\b/i.test(r)) return true;
  if (manaStable && /\b(shaky|unreliable)\s+mana\b/i.test(r)) return true;
  return false;
}

function reasonReferencesGenericCommander(reason: string): boolean {
  const r = reason.toLowerCase();
  return (
    /average (for )?commander|typical commander|in commander you usually|commander (land )?average|typical (land )?count/i.test(r) ||
    /\b(usually|typically|on average)\s+(in|for)\s+commander\b/i.test(r)
  );
}

export type AdviceInput = {
  modelTier: "mini" | "full";
  format: "commander";
  playDraw: "play" | "draw";
  mulliganCount: number;
  hand: string[];
  deck: { cards: { name: string; count: number }[]; commander?: string | null };
};

export type AdviceContext = {
  userId: string | null;
  source: "admin_playground" | "production_widget";
  effectiveTier: "guest" | "free" | "pro";
};

export type AdviceResult =
  | { ok: true; action: string; [k: string]: unknown }
  | { ok: false; error: string };

export async function runMulliganAdvice(
  input: AdviceInput,
  context: AdviceContext
): Promise<AdviceResult> {
  const { modelTier, playDraw, mulliganCount, hand, deck } = input;
  const { userId, source, effectiveTier } = context;

  const effectiveModelTier = effectiveTier !== "pro" ? "mini" : modelTier;

  const [profile, handFacts] = await Promise.all([
    buildDeckProfileWithTypes(deck.cards, deck.commander ?? null),
    computeHandFactsWithTypes(hand),
  ]);

  const deterministicEval = evaluateHandDeterministically({
    profile,
    handFacts,
    hand,
    playDraw,
    mulliganCount,
    commanderName: deck.commander ?? null,
  });

  const handTags = computeHandTags(hand, handFacts, profile, deck.commander ?? null);

  type GateBand = "DETERMINISTIC_STRONG" | "NEEDS_AI";
  let gateBand: GateBand = "NEEDS_AI";
  let gateAction: "SKIP_LLM" | "CALL_LLM" = "CALL_LLM";
  let gateReason = "";

  if (handFacts.handLandCount === 0) {
    gateAction = "SKIP_LLM";
    gateBand = "DETERMINISTIC_STRONG";
    gateReason = "0 lands; universal mulligan.";
  } else if (handFacts.handLandCount === 1 && !handFacts.hasRamp && !handFacts.hasFastMana) {
    gateAction = "SKIP_LLM";
    gateBand = "DETERMINISTIC_STRONG";
    gateReason = "1 land with no acceleration; universal mulligan.";
  } else if (
    deterministicEval.confidence >= 85 &&
    deterministicEval.keepBias !== "NEUTRAL" &&
    deterministicEval.uncertaintyReasons.length === 0
  ) {
    gateAction = "SKIP_LLM";
    gateBand = "DETERMINISTIC_STRONG";
    gateReason = `Deterministic confident (${deterministicEval.confidence}%); ${deterministicEval.keepBias}.`;
  } else {
    gateAction = "CALL_LLM";
    gateReason =
      deterministicEval.uncertaintyReasons.length > 0
        ? `Uncertainty: ${deterministicEval.uncertaintyReasons.join("; ")}`
        : deterministicEval.keepBias === "NEUTRAL"
          ? "Borderline hand; needs AI nuance."
          : `Confidence ${deterministicEval.confidence}% below 85 or has uncertainty.`;
  }

  const deckSummary = `${deck.cards.length} cards, ${deck.commander ?? "no commander"}`;
  const handSummary = hand.join(", ");
  const inputJson = { hand, playDraw, mulliganCount, deck: { cards: deck.cards.length, commander: deck.commander } };

  if (gateAction === "SKIP_LLM") {
    const action = deterministicEval.keepBias === "KEEP" ? "KEEP" : "MULLIGAN";
    const confidence =
      handFacts.handLandCount === 0
        ? 90
        : handFacts.handLandCount === 1 && !handFacts.hasRamp && !handFacts.hasFastMana
          ? 80
          : Math.max(85, deterministicEval.confidence);
    const suggestedLine =
      action === "KEEP"
        ? "Execute your curve; prioritize land drops and acceleration."
        : "Mulligan for more lands and/or acceleration.";
    const payload = {
      ok: true,
      action,
      confidence,
      reasons: deterministicEval.reasons,
      suggestedLine,
      warnings: deterministicEval.warnings,
      dependsOn: [],
      model: "deterministic",
      modelUsed: "deterministic",
      profileSummary: `${profile.archetype} v${profile.velocityScore} ${profile.mulliganStyle}`,
      handFacts,
      handEval: {
        score: deterministicEval.score,
        tags: deterministicEval.reasons,
        keepBias: deterministicEval.keepBias,
        confidence: deterministicEval.confidence,
        uncertaintyReasons: deterministicEval.uncertaintyReasons,
      },
      gate: { band: gateBand, action: gateAction, reason: gateReason },
      cached: false,
      cacheKey: null,
      cacheTtlSeconds: 0,
      effectiveTier,
      effectiveModelTier,
    };
    logMulliganRun({
      source,
      userId,
      deckSummary,
      handSummary,
      inputJson,
      outputJson: payload,
      llmUsed: false,
      cached: false,
      effectiveTier,
      gateAction,
    }).catch(() => {});
    return payload as AdviceResult;
  }

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
      const cachedPayload = {
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
        handEval: {
          score: deterministicEval.score,
          tags: deterministicEval.reasons,
          keepBias: deterministicEval.keepBias,
          confidence: deterministicEval.confidence,
          uncertaintyReasons: deterministicEval.uncertaintyReasons,
        },
        gate: { band: "NEEDS_AI", action: "CALL_LLM", reason: "cached" },
        cached: true,
        cacheKey,
        cacheTtlSeconds: CACHE_TTL_SECONDS,
        effectiveTier,
        effectiveModelTier,
      };
      logMulliganRun({
        source,
        userId,
        deckSummary,
        handSummary,
        inputJson,
        outputJson: cachedPayload,
        llmUsed: false,
        modelUsed: cached.model_used,
        cached: true,
        effectiveTier,
        gateAction: "CALL_LLM",
      }).catch(() => {});
      return cachedPayload as AdviceResult;
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

handTags: ${JSON.stringify(handTags)}

deterministicEval:
- keepBias: ${deterministicEval.keepBias}
- score: ${deterministicEval.score}
- confidence: ${deterministicEval.confidence}
- reasons: ${JSON.stringify(deterministicEval.reasons)}
- uncertaintyReasons: ${JSON.stringify(deterministicEval.uncertaintyReasons)}

Hand: ${JSON.stringify(hand)}

Context: playDraw=${playDraw}, mulliganCount=${mulliganCount}

Task: Decide KEEP or MULLIGAN. If deterministic keepBias is KEEP with high confidence, only recommend MULLIGAN if you cite a specific contradictory risk (colors, missing early plays for turbo, etc). If deterministic keepBias is MULLIGAN, only recommend KEEP if you cite specific stabilizers. Address uncertaintyReasons if present. Output JSON only.`;

  const model = effectiveModelTier === "mini" ? MINI_MODEL : FULL_MODEL;

  try {
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        route: source === "admin_playground" ? "/api/admin/mulligan/advice" : "/api/mulligan/advice",
        feature: "mulligan_advice",
        model,
        fallbackModel: MINI_MODEL,
        timeout: 30000,
        maxTokens: 400,
        apiType: "chat",
        userId: userId ?? undefined,
        isPro: effectiveTier === "pro",
        anonId: null,
        skipRecordAiUsage: false,
        source: source === "admin_playground" ? "admin_mulligan_playground" : "production_widget",
      }
    );

    let text = response.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) text = jsonMatch[0];

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, error: "Model did not return valid JSON" };
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

    if (result.confidence == null) result.confidence = 50;
    result.confidence = Math.max(0, Math.min(100, Number(result.confidence)));

    if (handFacts.handLandCount === 0) {
      result.action = "MULLIGAN";
      result.confidence = Math.max(result.confidence, 85);
    } else if (handFacts.handLandCount === 1 && !handFacts.hasRamp && !handFacts.hasFastMana) {
      result.action = "MULLIGAN";
      result.confidence = Math.max(result.confidence, 75);
    }

    if (deterministicEval.keepBias === "KEEP" && result.action === "MULLIGAN" && result.confidence >= 75) {
      result.confidence = 60;
      result.reasons = [
        "Deterministic check rates this as a stable keep for this deck; mulligan only if pod is very fast.",
        ...result.reasons.slice(0, 3),
      ].slice(0, 5);
    } else if (deterministicEval.keepBias === "MULLIGAN" && result.action === "KEEP" && result.confidence >= 75) {
      result.confidence = 60;
      result.reasons = [
        "Deterministic check flags this as risky; keep only if you accept a slow start.",
        ...result.reasons.slice(0, 3),
      ].slice(0, 5);
    }

    if (deterministicEval.uncertaintyReasons.length > 0 && result.confidence > 90) {
      result.confidence = 75;
      result.warnings = [...(result.warnings || []), "Deterministic flagged uncertainties; confidence capped."].slice(0, 3);
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
      handEval: {
        score: deterministicEval.score,
        tags: deterministicEval.reasons,
        keepBias: deterministicEval.keepBias,
        confidence: deterministicEval.confidence,
        uncertaintyReasons: deterministicEval.uncertaintyReasons,
      },
      gate: { band: "NEEDS_AI", action: "CALL_LLM", reason: gateReason },
      cached: false,
      cacheKey,
      cacheTtlSeconds: CACHE_TTL_SECONDS,
      effectiveTier,
      effectiveModelTier,
    };

    await setMulliganAdviceCache(cacheKey, payload, response.actualModel);

    const cost = costUSD(response.actualModel, response.inputTokens ?? 0, response.outputTokens ?? 0);
    logMulliganRun({
      source,
      userId,
      deckSummary,
      handSummary,
      inputJson,
      outputJson: payload,
      llmUsed: true,
      modelUsed: response.actualModel,
      costUsd: cost,
      cached: false,
      effectiveTier,
      gateAction: "CALL_LLM",
    }).catch(() => {});

    return payload as AdviceResult;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "LLM call failed";
    console.error("[mulligan/advice-handler] Error:", e);
    return { ok: false, error: msg };
  }
}
