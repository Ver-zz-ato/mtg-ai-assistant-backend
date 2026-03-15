/**
 * V3/V4 model-backed runner: build context, call chat API, capture response, score with rubric.
 * Used when suite_key is v3 or v4. Not called from run route until we wire model invocation.
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

/**
 * Run a single V3 behavioral scenario (call chat, then score with v3-rubric).
 * Placeholder: actual implementation would build thread/context and POST to chat API.
 */
export async function runV3Scenario(
  _scenario: ModelRunnerScenario,
  _opts: { modelName?: string; evalRunId?: string }
): Promise<V3RunResult> {
  // TODO: build request context from scenario_definition_json, call /api/chat or stream,
  // capture response text and prompt excerpt, then:
  const def = _scenario.scenario_definition_json as V3ScenarioDef;
  const outputText = ""; // would come from actual LLM response
  const { score, status, hardFailures, softFailures } = scoreV3Response(outputText, def);
  return {
    scenarioId: _scenario.id,
    scenarioKey: _scenario.scenario_key,
    status,
    score,
    hardFailures,
    softFailures,
    outputText,
  };
}

/**
 * Run a single V4 adversarial scenario (call chat, then score with v4-rubric).
 */
export async function runV4Scenario(
  _scenario: ModelRunnerScenario,
  _opts: { modelName?: string; evalRunId?: string }
): Promise<V4RunResult> {
  const def = _scenario.scenario_definition_json as V4ScenarioDef;
  const outputText = "";
  const { score, status, hardFailures, softFailures } = scoreV4Response(outputText, def);
  return {
    scenarioId: _scenario.id,
    scenarioKey: _scenario.scenario_key,
    status,
    score,
    hardFailures,
    softFailures,
    outputText,
  };
}
