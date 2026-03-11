/**
 * Admin-only: test chat flow with tier override and detailed debug output.
 * POST body: { text, tier: "guest"|"free"|"pro", messages?: [], decklist?: string }
 */

import { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { classifyPromptTier, estimateSystemPromptTokens, MICRO_PROMPT } from "@/lib/ai/prompt-tier";
import { buildSystemPromptForRequest } from "@/lib/ai/prompt-path";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { MAX_TOKENS_STREAM } from "@/lib/config/streaming";
import { NO_FILLER_INSTRUCTION } from "@/lib/ai/chat-generation-config";
import { CHAT_STOP_SEQUENCES } from "@/lib/ai/chat-generation-config";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { deckHash, buildDeckContextSummary, estimateSummaryTokens } from "@/lib/deck/deck-context-summary";
import { isDecklist, extractCommanderFromDecklistText } from "@/lib/chat/decklistDetector";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: "OPENAI_API_KEY not set" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const tierOverride = body.tier === "guest" || body.tier === "free" || body.tier === "pro" ? body.tier : "free";
  const messages: Array<{ role: string; content: string }> = Array.isArray(body.messages) ? body.messages : [];
  const decklist = typeof body.decklist === "string" ? body.decklist.trim() : "";

  const isGuest = tierOverride === "guest";
  const isPro = tierOverride === "pro";
  const userId = tierOverride === "guest" ? null : "admin-test-user";

  const modelRes = getModelForTier({ isGuest, userId, isPro });
  const effectiveModel = modelRes.model;

  const deckContextForCompose = decklist && isDecklist(decklist)
    ? (() => {
        const entries = parseDeckText(decklist).map((e) => ({ name: e.name, count: e.qty }));
        const commander = extractCommanderFromDecklistText(decklist, text);
        return { deckCards: entries, commanderName: commander, colorIdentity: null as string[] | null, deckId: undefined };
      })()
    : null;

  const hasDeckContextForTier = !!(deckContextForCompose?.deckCards?.length);
  const tierResult = classifyPromptTier({ text: text || "hi", hasDeckContext: hasDeckContextForTier, deckContextForCompose });
  const selectedTier = tierResult.tier;

  const CHAT_HARDCODED_DEFAULT = "You are ManaTap AI, a concise, budget-aware Magic: The Gathering assistant. When mentioning card names, wrap them in [[Double Brackets]]. Put a space after colons. Do NOT suggest cards already in the decklist.";

  let sys = "";
  let promptResult: Awaited<ReturnType<typeof buildSystemPromptForRequest>>;

  if (selectedTier === "micro") {
    sys = MICRO_PROMPT + "\n\n" + NO_FILLER_INSTRUCTION;
    promptResult = { systemPrompt: MICRO_PROMPT, promptPath: "composed", formatKey: "commander", modulesAttached: [] };
  } else if (selectedTier === "standard") {
    promptResult = await buildSystemPromptForRequest({
      kind: "chat",
      formatKey: "commander",
      deckContextForCompose: null,
      supabase,
      hardcodedDefaultPrompt: CHAT_HARDCODED_DEFAULT,
    });
    sys = promptResult.systemPrompt + "\n\n" + NO_FILLER_INSTRUCTION;
  } else {
    promptResult = await buildSystemPromptForRequest({
      kind: "chat",
      formatKey: "commander",
      deckContextForCompose,
      supabase,
      hardcodedDefaultPrompt: CHAT_HARDCODED_DEFAULT,
    });
    sys = promptResult.systemPrompt + "\n\n" + NO_FILLER_INSTRUCTION;
  }

  let v2Summary: Awaited<ReturnType<typeof buildDeckContextSummary>> | null = null;
  let streamContextSource: "linked_db" | "paste_ttl" | "raw_fallback" = "raw_fallback";

  if (decklist && decklist.length >= 20) {
    try {
      v2Summary = await buildDeckContextSummary(decklist, { format: "Commander", commander: deckContextForCompose?.commanderName ?? null });
      streamContextSource = "paste_ttl";
    } catch (e) {
      // ignore
    }
  }

  if (selectedTier === "full" && v2Summary) {
    const cardNamesForPrompt = v2Summary.card_names?.slice(0, 50) ?? [];
    if (v2Summary.deck_facts && v2Summary.synergy_diagnostics) {
      const { formatForLLM } = await import("@/lib/deck/intelligence-formatter");
      const deckFactsProse = formatForLLM(v2Summary.deck_facts, v2Summary.synergy_diagnostics);
      sys += `\n\n${deckFactsProse}\n`;
    } else {
      sys += `\n\nDECK CONTEXT SUMMARY (v2):\n${JSON.stringify({ ...v2Summary, card_names: cardNamesForPrompt })}\n`;
    }
    sys += `\nCards in deck (do NOT suggest these): ${cardNamesForPrompt.join(", ")}\n`;
  }

  const lastUserMsg = text || (messages.filter((m) => m.role === "user").pop()?.content ?? "");

  const openAIMessages: Array<{ role: string; content: string }> = [
    { role: "system", content: sys },
    ...(messages.length > 0 ? messages.slice(-8).map((m) => ({ role: m.role, content: m.content })) : []),
    { role: "user", content: lastUserMsg || "hi" },
  ].filter((m) => m.content);

  const modelsWithoutStop = ["gpt-5-mini", "gpt-5-nano", "gpt-5.1", "gpt-5"];
  const useStop = !modelsWithoutStop.some((m) => effectiveModel?.toLowerCase().includes(m));
  const body2 = prepareOpenAIBody({
    model: effectiveModel,
    messages: openAIMessages,
    stream: false,
    max_completion_tokens: MAX_TOKENS_STREAM,
    ...(useStop && { stop: CHAT_STOP_SEQUENCES }),
  } as Record<string, unknown>);

  const t0 = Date.now();
  const openaiRes = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body2),
  });
  const elapsed = Date.now() - t0;

  let responseText = "";
  let openaiError: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  if (openaiRes.ok) {
    const j = await openaiRes.json();
    responseText = j?.choices?.[0]?.message?.content ?? "";
    inputTokens = j?.usage?.prompt_tokens ?? null;
    outputTokens = j?.usage?.completion_tokens ?? null;
  } else {
    openaiError = await openaiRes.text();
  }

  const hasBrackets = /\[\[[^\]]+\]\]/.test(responseText);
  const accuracyChecks = {
    cardNamesBracketed: hasBrackets,
    noRawCardDump: !/^\d+\s+\w+/.test(responseText.slice(0, 200)),
    reasonableLength: responseText.length >= 20 && responseText.length <= 10000,
  };

  const metadata = {
    tierOverride,
    modelTier: modelRes.tier,
    modelTierLabel: modelRes.tierLabel,
    effectiveModel,
    promptTier: selectedTier,
    promptTierReason: tierResult.reason,
    promptPath: promptResult.promptPath,
    formatKey: promptResult.formatKey ?? "commander",
    modulesAttached: promptResult.modulesAttached ?? [],
    systemPromptTokenEstimate: estimateSystemPromptTokens(sys),
    v2SummaryUsed: !!v2Summary,
    v2SummaryTokens: v2Summary ? estimateSummaryTokens(v2Summary) : null,
    deckContextSource: streamContextSource,
    deckCommander: v2Summary?.commander ?? deckContextForCompose?.commanderName ?? null,
    deckCardCount: v2Summary?.card_count ?? null,
    deckFactsPresent: !!(v2Summary?.deck_facts),
    synergyDiagnosticsPresent: !!(v2Summary?.synergy_diagnostics),
    messageCount: messages.length,
    openaiElapsedMs: elapsed,
    openaiOk: openaiRes.ok,
    openaiError: openaiError ?? undefined,
    inputTokens,
    outputTokens,
    accuracyChecks,
    systemPromptPreview: sys.slice(0, 1500) + (sys.length > 1500 ? "\n...[truncated]" : ""),
  };

  return new Response(
    JSON.stringify({
      ok: openaiRes.ok,
      response: responseText,
      metadata,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
