/**
 * V3/V4 model-backed runner: build context, call chat API, capture response, score with rubric.
 */

import type { V3ScenarioDef } from "./v3-rubric";
import type { V4ScenarioDef } from "./v4-rubric";
import { scoreV3Response } from "./v3-rubric";
import { scoreV4Response } from "./v4-rubric";
import type { V3RunResult, V4RunResult } from "./types";

export type ModelRunnerScenario = {
  id: string;
  scenario_key: string;
  suite_key: string;
  scenario_definition_json: V3ScenarioDef | V4ScenarioDef;
};

export type CallChatOptions = {
  text: string;
  deckText?: string | null;
  evalRunId?: string;
  modelName?: string | null;
};

export type CallChatResult = { text: string; fallback?: boolean };

/**
 * Run a single V3 behavioral scenario (call chat, then score with v3-rubric).
 */
export async function runV3Scenario(
  scenario: ModelRunnerScenario,
  opts: { modelName?: string; evalRunId?: string; callChat?: (body: CallChatOptions) => Promise<CallChatResult>; deckText?: string | null }
): Promise<V3RunResult> {
  const def = scenario.scenario_definition_json as V3ScenarioDef;
  let outputText = "";
  const debug: Record<string, unknown> = {};
  if (opts.callChat) {
    const deckText =
      def.deckContext === "multani_mono_green" || (def.deckContext && def.deckContext.includes("deck"))
        ? opts.deckText ?? undefined
        : undefined;
    const res = await opts.callChat({
      text: def.userMessage,
      deckText: deckText ?? null,
      evalRunId: opts.evalRunId,
      modelName: opts.modelName ?? null,
    });
    outputText = res.text ?? "";
    if (res.fallback) debug.fallback = true;
  }
  const { score, status, hardFailures, softFailures } = scoreV3Response(outputText, def);
  return {
    scenarioId: scenario.id,
    scenarioKey: scenario.scenario_key,
    status,
    score,
    hardFailures,
    softFailures,
    outputText,
    debug: Object.keys(debug).length ? debug : undefined,
  };
}

/**
 * Run a single V4 adversarial scenario (call chat, then score with v4-rubric).
 */
export async function runV4Scenario(
  scenario: ModelRunnerScenario,
  opts: { modelName?: string; evalRunId?: string; callChat?: (body: CallChatOptions) => Promise<CallChatResult>; deckText?: string | null }
): Promise<V4RunResult> {
  const def = scenario.scenario_definition_json as V4ScenarioDef;
  let outputText = "";
  const debug: Record<string, unknown> = {};
  if (opts.callChat) {
    const deckText =
      def.deckContext === "multani_mono_green" || (def.deckContext && def.deckContext.includes("deck"))
        ? opts.deckText ?? undefined
        : undefined;
    const res = await opts.callChat({
      text: def.userMessage,
      deckText: deckText ?? null,
      evalRunId: opts.evalRunId,
      modelName: opts.modelName ?? null,
    });
    outputText = res.text ?? "";
    if (res.fallback) debug.fallback = true;
  }
  const { score, status, hardFailures, softFailures } = scoreV4Response(outputText, def);
  return {
    scenarioId: scenario.id,
    scenarioKey: scenario.scenario_key,
    status,
    score,
    hardFailures,
    softFailures,
    outputText,
    debug: Object.keys(debug).length ? debug : undefined,
  };
}
