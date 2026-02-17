/**
 * Rubric-based pairwise judge for A/B evaluation.
 * Blind, grounded, strict about hallucinations. Winner determined by human-taste-aligned rubric.
 */

import { z } from "zod";
import { prepareOpenAIBody } from "./openai-params";
import { recordAiUsage } from "./log-usage";

const RubricOutputSchema = z.object({
  winner: z.enum(["A", "B", "TIE"]),
  confidence: z.number().min(0).max(1),
  scores: z.object({
    clarity: z.number().min(0).max(10),
    specificity: z.number().min(0).max(10),
    actionability: z.number().min(0).max(10),
    correctness: z.number().min(0).max(10),
    constraint_following: z.number().min(0).max(10),
    tone: z.number().min(0).max(10),
    calibration: z.number().min(0).max(10),
  }),
  reasons: z.array(z.string()).max(5),
  major_faults: z.object({
    A: z.array(z.string()),
    B: z.array(z.string()),
  }),
  notes: z.string().max(200).optional(),
});

export type RubricOutput = z.infer<typeof RubricOutputSchema>;

export type PairwiseJudgeOptions = {
  apiKey: string;
  model?: string;
  evalRunId?: number | null;
  supabase?: any;
};

/**
 * Build blind, grounded prompt for pairwise judge.
 * Answer 1 and Answer 2 have no labels; judge sees test intent and constraints.
 */
export function buildPairwiseJudgePrompt(
  testCase: { name?: string; type?: string; input: any; expectedChecks?: any; tags?: string[] },
  answerA: string,
  answerB: string,
  contextFacts?: string
): { system: string; user: string } {
  const intent = testCase.input?.userMessage || "User question";
  const format = testCase.input?.format || "Commander";
  const constraints: string[] = [];
  if (format) constraints.push(`Format: ${format}`);
  if (testCase.input?.commander) constraints.push(`Commander: ${testCase.input.commander}`);
  if (testCase.input?.budget) constraints.push(`Budget: ${testCase.input.budget}`);
  if (testCase.input?.archetype) constraints.push(`Archetype: ${testCase.input.archetype}`);
  const checks = testCase.expectedChecks;
  if (checks?.requireLegalIdentity) constraints.push("Must respect color identity and format legality.");
  if (checks?.requireNoHallucinatedCards) constraints.push("Must not suggest made-up or hallucinated cards.");
  if (checks?.requireBudgetAware) constraints.push("Must consider budget constraints.");
  const constraintBlock = constraints.length > 0 ? `\nConstraints:\n${constraints.map((c) => `- ${c}`).join("\n")}` : "";

  const system = `You are a Magic: The Gathering expert judge. Compare two AI assistant answers side-by-side. You see "Answer 1" and "Answer 2" with NO labels (A/B). Be blind and impartial.

RUBRIC (0-10 each):
- clarity: How clear and readable?
- specificity: Concrete card names and numbers, not generic fluff?
- actionability: Actionable steps the user can take?
- correctness: Factually correct (cards, rules, format legality)?
- constraint_following: Follows format, budget, commander constraints?
- tone: Helpful, appropriate tone?
- calibration: Asks for clarification when info missing; doesn't overclaim?

REWARD: clarity, specificity, prioritization, actionable steps, correct assumptions, asking for clarifications when needed.
PENALIZE: generic fluff, overconfidence, ignoring constraints, missing key checks (legality/budget), unsafe content, hallucinated cards.

Return JSON only. No markdown. No explanation outside JSON. Be brief.`;

  const user = `Test: ${testCase.name || "Unknown"}
User intent: ${intent}
${constraintBlock}
${contextFacts ? `\nReference facts (use to check correctness):\n${contextFacts}\n` : ""}

--- Answer 1 ---
${answerA.slice(0, 8000)}

--- Answer 2 ---
${answerB.slice(0, 8000)}

Return JSON only:
{"winner":"A"|"B"|"TIE","confidence":0-1,"scores":{"clarity":0-10,"specificity":0-10,"actionability":0-10,"correctness":0-10,"constraint_following":0-10,"tone":0-10,"calibration":0-10},"reasons":["...","...","..."],"major_faults":{"A":["..."],"B":["..."]},"notes":"short"}`;

  return { system, user };
}

/**
 * Call LLM judge, validate with zod, retry once on invalid JSON.
 */
export async function runPairwiseJudge(
  testCase: { name?: string; type?: string; input: any; expectedChecks?: any; tags?: string[] },
  answerA: string,
  answerB: string,
  options: PairwiseJudgeOptions
): Promise<{ result: RubricOutput; raw: string } | { result: null; raw: string; error: string }> {
  const { apiKey, model = "gpt-4o-mini", evalRunId, supabase } = options;
  const { system, user } = buildPairwiseJudgePrompt(testCase, answerA, answerB);

  const requestBody = prepareOpenAIBody({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_completion_tokens: 600,
    response_format: { type: "json_object" },
  } as Record<string, unknown>);

  const start = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const latencyMs = Date.now() - start;

  if (!res.ok) {
    const errText = await res.text();
    return { result: null, raw: errText, error: `Judge API failed: ${res.status}` };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const usage = data.usage;
  const inputTokens = usage?.prompt_tokens ?? Math.ceil((system.length + user.length) / 4);
  const outputTokens = usage?.completion_tokens ?? Math.ceil(content.length / 4);

  if (supabase && evalRunId) {
    const { costUSD } = await import("./pricing");
    const cost = costUSD(model, inputTokens, outputTokens);
    await recordAiUsage({
      user_id: null,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      route: "ai_test_pairwise_judge",
      eval_run_id: evalRunId != null ? String(evalRunId) : null,
      source: "ai_test_pairwise_judge",
      prompt_preview: user.slice(0, 500),
      response_preview: content.slice(0, 500),
      latency_ms: latencyMs,
    });
  }

  const parsed = parseJudgeJson(content);
  if (parsed) return { result: parsed, raw: content };

  // Retry once with stricter prompt
  const retryPrompt = `${user}\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no extra text.`;
  const retryRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(
      prepareOpenAIBody({
        model,
        messages: [
          { role: "system", content: system + "\n\nReturn ONLY valid JSON. No other text." },
          { role: "user", content: retryPrompt },
        ],
        max_completion_tokens: 600,
        response_format: { type: "json_object" },
      } as Record<string, unknown>)
    ),
  });

  const retryData = await retryRes.json();
  const retryContent = retryData.choices?.[0]?.message?.content?.trim() || "";
  const retryParsed = parseJudgeJson(retryContent);
  if (retryParsed) return { result: retryParsed, raw: retryContent };

  return {
    result: null,
    raw: content,
    error: "Invalid judge JSON after retry",
  };
}

function parseJudgeJson(content: string): RubricOutput | null {
  try {
    const cleaned = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const obj = JSON.parse(cleaned);
    const parsed = RubricOutputSchema.safeParse(obj);
    if (parsed.success) return parsed.data;
  } catch {
    // ignore
  }
  return null;
}

/**
 * When judge fails, return TIE with low confidence for storage.
 */
export function fallbackJudgeResult(scoreA: number, scoreB: number): RubricOutput {
  let winner: "A" | "B" | "TIE" = "TIE";
  if (scoreA > scoreB) winner = "A";
  else if (scoreB > scoreA) winner = "B";
  return {
    winner,
    confidence: 0.3,
    scores: {
      clarity: 5,
      specificity: 5,
      actionability: 5,
      correctness: 5,
      constraint_following: 5,
      tone: 5,
      calibration: 5,
    },
    reasons: ["Judge failed; fallback to validator scores"],
    major_faults: { A: [], B: [] },
    notes: "Fallback: judge JSON invalid",
  };
}
