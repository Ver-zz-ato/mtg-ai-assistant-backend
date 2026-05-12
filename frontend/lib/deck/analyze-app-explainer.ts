import { callLLM } from "@/lib/ai/unified-llm-client";
import { DEFAULT_FALLBACK_MODEL } from "@/lib/ai/default-models";

type AppSuggestion = { card?: string; reason?: string };

export type AppAnalyzeExplanation = {
  summary: string | null;
  archetype: string | null;
  game_plan: string | null;
  main_problems: string[];
  priority_actions: string[];
  suggestion_explanations: Array<{ index: number; reason: string }>;
};

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function parseSections(text: string): AppAnalyzeExplanation {
  const getSection = (name: string): string => {
    const m = text.match(new RegExp(`##\\s*${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s*[A-Z_]+|$)`, "i"));
    return m?.[1]?.trim() ?? "";
  };
  const summary = getSection("SUMMARY") || null;
  const archetype = getSection("ARCHETYPE") || null;
  const gamePlan = getSection("GAME_PLAN") || null;
  const toBullets = (value: string) =>
    value
      .split(/\n/)
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
  const problems = toBullets(getSection("MAIN_PROBLEMS"));
  const priorities = toBullets(getSection("PRIORITY_ACTIONS"));
  const suggestionLines = getSection("SUGGESTION_EXPLANATIONS")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const suggestion_explanations: Array<{ index: number; reason: string }> = [];
  for (const line of suggestionLines) {
    const m = line.match(/^\d+[\.\)]\s*\[?(\d+)\]?\s*[-:]\s*(.+)$/);
    if (!m) continue;
    const idx = Number(m[1]);
    if (!Number.isFinite(idx)) continue;
    const reason = m[2].trim();
    if (!reason) continue;
    suggestion_explanations.push({ index: idx, reason });
  }
  return {
    summary,
    archetype,
    game_plan: gamePlan,
    main_problems: problems,
    priority_actions: priorities,
    suggestion_explanations,
  };
}

export async function generateAppSafeDeckExplanation(params: {
  score: number | null;
  whatsGood: string[];
  quickFixes: string[];
  suggestions: AppSuggestion[];
  counts?: Record<string, unknown> | null;
  commander?: string | null;
  format?: string | null;
  userId?: string | null;
  isPro?: boolean;
}): Promise<AppAnalyzeExplanation> {
  const model = process.env.MODEL_DECK_ANALYZE_APP_EXPLAIN || DEFAULT_FALLBACK_MODEL;
  const compactSuggestions = params.suggestions.slice(0, 8).map((s, index) => ({
    index,
    card: typeof s.card === "string" ? s.card : "",
    original_reason: typeof s.reason === "string" ? s.reason : "",
  }));

  const systemPrompt = `You are ManaTap AI.
Generate a concise deck analysis explanation for mobile.
Use ONLY the provided suggestion list. Do NOT invent new card names.
When referencing a suggestion, use its index from the provided list.
If uncertain, be conservative.

Output exactly these sections:
## SUMMARY
## ARCHETYPE
## GAME_PLAN
## MAIN_PROBLEMS
- bullet points
## PRIORITY_ACTIONS
- bullet points
## SUGGESTION_EXPLANATIONS
1. [0] - reason for suggestion index 0
2. [1] - reason for suggestion index 1`;

  const userPrompt = `DECK_FACTS:
${JSON.stringify(
  {
    format: params.format ?? null,
    commander: params.commander ?? null,
    score: params.score,
    counts: params.counts ?? null,
    whatsGood: params.whatsGood.slice(0, 6),
    quickFixes: params.quickFixes.slice(0, 8),
    suggestions: compactSuggestions,
  },
  null,
  2
)}`;

  try {
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        route: "/api/mobile/deck/analyze",
        feature: "deck_analyze_mobile_explain",
        model,
        fallbackModel: DEFAULT_FALLBACK_MODEL,
        timeout: 90000,
        maxTokens: 2048,
        apiType: "chat",
        userId: params.userId ?? null,
        isPro: params.isPro ?? false,
      }
    );
    const parsed = parseSections((response.text || "").trim());
    const hasStructured =
      parsed.summary ||
      parsed.archetype ||
      parsed.game_plan ||
      parsed.main_problems.length > 0 ||
      parsed.priority_actions.length > 0 ||
      parsed.suggestion_explanations.length > 0;
    if (hasStructured) return parsed;
  } catch {
    // fall through to deterministic fallback
  }

  const fallbackSummary =
    params.quickFixes.length > 0
      ? "This deck has clear upgrade opportunities in consistency and interaction."
      : params.whatsGood.length > 0
      ? "This deck's baseline fundamentals look stable, with room for targeted tuning."
      : null;

  return {
    summary: fallbackSummary,
    archetype: null,
    game_plan: null,
    main_problems: toStringArray(params.quickFixes).slice(0, 5),
    priority_actions: toStringArray(params.quickFixes).slice(0, 5),
    suggestion_explanations: compactSuggestions
      .map((s) => ({
        index: s.index,
        reason: s.original_reason || "Supports the deck's stated game plan and role needs.",
      }))
      .slice(0, 6),
  };
}
