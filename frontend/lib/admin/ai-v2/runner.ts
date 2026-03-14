/**
 * Test Suite V2 — scenario runner.
 * Executes scenarios through app-layer logic without model calls (deterministic).
 */

import { resolveActiveDeckContext } from "@/lib/chat/active-deck-context";
import { classifyPromptTier } from "@/lib/ai/prompt-tier";
import { detectRulesLegalityIntent, extractCardNamesFromMessage } from "@/lib/deck/rules-facts";
import { hashDecklist, normalizeDecklistText } from "@/lib/chat/decklist-normalize";
import { assembleIntelligenceBlocks, detectBlockNames } from "./assemble-blocks";
import {
  FIXTURE_V2_SUMMARY,
  MONO_GREEN_DECKLIST,
  buildFixtureV2Summary,
  MOCK_RULES_BUNDLE_MULTANI,
  MOCK_RULES_BUNDLE_BLACK_LOTUS,
  MOCK_RULES_BUNDLE_GRIST,
  MOCK_RULES_BUNDLE_AVENGER,
} from "./fixtures";
import type { Scenario, ScenarioTurn, V2RunResult, HardFailureKind, SoftFailureKind } from "./types";

const RULES_BUNDLE_MAP: Record<string, typeof MOCK_RULES_BUNDLE_MULTANI> = {
  multani: MOCK_RULES_BUNDLE_MULTANI,
  black_lotus: MOCK_RULES_BUNDLE_BLACK_LOTUS,
  grist: MOCK_RULES_BUNDLE_GRIST,
  avenger: MOCK_RULES_BUNDLE_AVENGER,
};

function buildDeckData(scenario: Scenario) {
  const linked = scenario.linkedDeck;
  if (linked) {
    return {
      d: { commander: linked.commander, title: "Linked", format: "Commander" as const },
      entries: linked.entries,
      deckText: linked.deckText,
    };
  }
  const thread = scenario.initialThread;
  const deckText = thread?.decklist_text ?? null;
  if (deckText) {
    const entries = deckText
      .split(/\n+/)
      .filter((l) => /^\s*\d+\s+/.test(l))
      .map((l) => {
        const m = l.trim().match(/^(\d+)\s+(.+)$/);
        return m ? { name: m[2].trim(), count: parseInt(m[1], 10) } : { name: l.trim(), count: 1 };
      });
    return {
      d: { commander: thread?.commander ?? null, title: "Thread", format: "Commander" as const },
      entries: entries.length ? entries : [{ name: "Forest", count: 1 }],
      deckText,
    };
  }
  return null;
}

/** Only use fixture when decklist matches known fixture; otherwise omit DECK INTELLIGENCE. */
function resolveV2Summary(scenario: Scenario, decklistText: string | null): typeof FIXTURE_V2_SUMMARY | null {
  if (!decklistText?.trim()) return null;
  const hash = hashDecklist(normalizeDecklistText(decklistText));
  const monoGreenHash = hashDecklist(normalizeDecklistText(MONO_GREEN_DECKLIST));
  if (hash === monoGreenHash) {
    try {
      return buildFixtureV2Summary(decklistText);
    } catch {
      return FIXTURE_V2_SUMMARY;
    }
  }
  return null;
}

function checkDeckContextExpectations(
  ctx: Record<string, unknown>,
  expected?: ScenarioTurn["expectedDeckContext"]
): { hard: Array<{ kind: HardFailureKind; message: string }>; soft: Array<{ kind: SoftFailureKind; message: string }> } {
  const hard: Array<{ kind: HardFailureKind; message: string }> = [];
  const soft: Array<{ kind: SoftFailureKind; message: string }> = [];
  if (!expected) return { hard, soft };

  if (expected.source != null && ctx.source !== expected.source) {
    hard.push({
      kind: "wrong_deck_source",
      message: `Expected deck source "${expected.source}", got "${ctx.source}"`,
    });
  }
  if (expected.commanderName != null && ctx.commanderName !== expected.commanderName) {
    hard.push({
      kind: "commander_status_wrong",
      message: `Expected commander "${expected.commanderName}", got "${ctx.commanderName}"`,
    });
  }
  if (expected.commanderStatus != null && ctx.commanderStatus !== expected.commanderStatus) {
    hard.push({
      kind: "commander_status_wrong",
      message: `Expected commander status "${expected.commanderStatus}", got "${ctx.commanderStatus}"`,
    });
  }
  if (expected.hasDeck != null && ctx.hasDeck !== expected.hasDeck) {
    hard.push({
      kind: "other",
      message: `Expected hasDeck ${expected.hasDeck}, got ${ctx.hasDeck}`,
    });
  }
  if (expected.shouldAskCommanderConfirmation != null && ctx.shouldAskCommanderConfirmation !== expected.shouldAskCommanderConfirmation) {
    hard.push({
      kind: "missing_authoritative_block",
      message: `Expected shouldAskCommanderConfirmation ${expected.shouldAskCommanderConfirmation}, got ${ctx.shouldAskCommanderConfirmation}`,
    });
  }
  if (expected.isFullDecklist != null && ctx.isFullDecklist !== expected.isFullDecklist) {
    soft.push({
      kind: "other",
      message: `Expected isFullDecklist ${expected.isFullDecklist}, got ${ctx.isFullDecklist}`,
    });
  }
  if (expected.deckReplacedByHashChange != null && ctx.deckReplacedByHashChange !== expected.deckReplacedByHashChange) {
    hard.push({
      kind: "other",
      message: `Expected deckReplacedByHashChange ${expected.deckReplacedByHashChange}, got ${ctx.deckReplacedByHashChange}`,
    });
  }
  return { hard, soft };
}

const KNOWN_RAMP_SORCERIES = new Set([
  "Cultivate", "Kodama's Reach", "Rampant Growth", "Farseek", "Skyshroud Claim",
  "Nature's Lore", "Three Visits", "Kodama's Reach", "Cultivate",
]);

function validatePromptDeckCoherence(
  promptExcerpt: string,
  ctx: { commanderName?: string | null; decklistText?: string | null },
  scenarioDecklistText: string | null
): Array<{ kind: "hard" | "soft"; message: string }> {
  const findings: Array<{ kind: "hard" | "soft"; message: string }> = [];
  if (!promptExcerpt?.includes("=== DECK INTELLIGENCE")) return findings;

  // Match "- Commander: X" from Deck Facts block; avoid "Legal in Commander:" / "Commander eligible:"
  const promptCommanderMatch = promptExcerpt.match(/- Commander:\s*([^\n]+)/);
  const promptCommander = promptCommanderMatch?.[1]?.trim();
  const promptColorsMatch = promptExcerpt.match(/Colors?:\s*([^\n]+)/i);
  const promptColors = promptColorsMatch?.[1]?.trim() ?? "";

  const decklist = scenarioDecklistText ?? ctx.decklistText ?? "";
  const resolvedCommander = ctx.commanderName;

  if (promptCommander && decklist) {
    const deckCommanderMatch = decklist.match(/Commander\s*\n\s*(?:\d+\s*[xX]?\s*)?([^\n]+)/i);
    const inferredFromDeck = deckCommanderMatch?.[1]?.trim();
    const expectedCommander = resolvedCommander ?? inferredFromDeck;
    if (expectedCommander && promptCommander && !promptCommander.toLowerCase().includes(expectedCommander.toLowerCase().split(",")[0])) {
      findings.push({
        kind: "hard",
        message: `Prompt/deck coherence: prompt commander "${promptCommander}" does not match scenario deck (expected ${expectedCommander})`,
      });
    }
  }

  const MULTANI = "Multani";
  const knownNonScenarioCommanders = ["Multani, Yavimaya's Avatar", "Multani"];
  if (promptCommander && !decklist.includes("Multani") && knownNonScenarioCommanders.some((c) => promptCommander.includes(c))) {
    findings.push({
      kind: "hard",
      message: `Prompt/deck coherence: Multani fixture leaked into non-Multani scenario (prompt: ${promptCommander}, deck has no Multani)`,
    });
  }
  return findings;
}

function validateRoleClusterSemantics(promptExcerpt: string): Array<{ kind: "hard" | "soft"; message: string }> {
  const findings: Array<{ kind: "hard" | "soft"; message: string }> = [];
  if (!promptExcerpt || !promptExcerpt.includes("Role clusters")) return findings;

  const interactionMatch = promptExcerpt.match(/interaction:\s*\d+\s*cards?\s*\(([^)]+)\)/i);
  const cardFlowMatch = promptExcerpt.match(/card_flow:\s*\d+\s*cards?\s*\(([^)]+)\)/i);
  const finishersMatch = promptExcerpt.match(/finishers:\s*\d+\s*cards?\s*\(([^)]+)\)/i);

  const parseCardList = (s: string) => s.split(",").map((c) => c.trim().replace(/\.\.\.$/, ""));

  for (const [cluster, raw] of [
    ["interaction", interactionMatch?.[1]],
    ["card_flow", cardFlowMatch?.[1]],
    ["finishers", finishersMatch?.[1]],
  ] as const) {
    if (!raw) continue;
    const cards = parseCardList(raw);
    const rampInCluster = cards.filter((c) => KNOWN_RAMP_SORCERIES.has(c));
    if (rampInCluster.length >= 2 && rampInCluster.length >= cards.length * 0.5) {
      findings.push({
        kind: "hard",
        message: `Role cluster "${cluster}" dominated by ramp sorceries (${rampInCluster.join(", ")}); expected removal/draw/finisher cards`,
      });
    } else if (rampInCluster.length >= 1 && cluster === "finishers") {
      findings.push({
        kind: "soft",
        message: `Finishers cluster contains ramp sorcery "${rampInCluster[0]}" which is not a payoff`,
      });
    }
  }
  return findings;
}

export async function runScenario(scenario: Scenario): Promise<V2RunResult> {
  const start = Date.now();
  const hardFailures: V2RunResult["hardFailures"] = [];
  const softFailures: V2RunResult["softFailures"] = [];
  const turnResults: V2RunResult["debug"]["turnResults"] = [];
  let lastCtx: ReturnType<typeof resolveActiveDeckContext> | null = null;
  let lastBlocks: string[] = [];
  let promptExcerpt = "";
  const deckData = buildDeckData(scenario);
  const thread = scenario.initialThread ?? {};
  const tid = scenario.linkedDeck ? "tid-1" : null;
  const isGuest = scenario.isGuest ?? false;
  const initialDeckText = thread.decklist_text ?? scenario.linkedDeck?.deckText ?? null;

  const priorMessages = scenario.priorMessages ?? [];
  let streamThreadHistory = priorMessages.map((m) => ({ role: m.role, content: m.content }));
  let clientConversation = [...streamThreadHistory];
  let threadState = {
    deck_id: (thread.deck_id ?? scenario.linkedDeck?.deckId ?? null) as string | null,
    commander: (thread.commander ?? scenario.linkedDeck?.commander ?? null) as string | null,
    decklist_text: initialDeckText,
    decklist_hash: initialDeckText ? hashDecklist(normalizeDecklistText(initialDeckText)) : (thread.decklist_hash as string | null) ?? null,
  };

  const rulesBundleOverride = scenario.rulesBundleKey
    ? RULES_BUNDLE_MAP[scenario.rulesBundleKey] ?? null
    : undefined;

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];
    const text = turn.userMessage;

    if (turn.assistantMessageBefore) {
      streamThreadHistory.push({ role: "assistant", content: turn.assistantMessageBefore });
      clientConversation.push({ role: "assistant", content: turn.assistantMessageBefore });
    }
    clientConversation.push({ role: "user", content: text });

    const isStandaloneRulesQuestion =
      detectRulesLegalityIntent(text) && (extractCardNamesFromMessage(text).length > 0 || /\[\[[^\]]+\]\]/.test(text));
    const ctx = resolveActiveDeckContext({
      tid,
      isGuest,
      userId: tid ? "user-1" : null,
      text,
      context: deckData && scenario.linkedDeck ? { deckId: scenario.linkedDeck.deckId } : null,
      prefs: null,
      thread: threadState,
      streamThreadHistory,
      clientConversation,
      isStandaloneRulesQuestion,
      deckData,
    });
    lastCtx = ctx;

    const decklistForV2 = ctx.decklistText ?? threadState.decklist_text ?? null;
    const v2Summary = resolveV2Summary(scenario, decklistForV2);
    const tierResult = classifyPromptTier({
      text,
      hasDeckContext: ctx.hasDeck,
    });

    const blocks = await assembleIntelligenceBlocks({
      text,
      activeDeckContext: ctx,
      v2Summary,
      selectedTier: tierResult.tier,
      streamThreadHistory,
      rulesBundleOverride: rulesBundleOverride ?? undefined,
    });
    lastBlocks = detectBlockNames(blocks, {
      shouldAskCommanderConfirmation: ctx.shouldAskCommanderConfirmation,
      askReason: ctx.askReason,
      commanderStatus: ctx.commanderStatus,
      hasDeck: ctx.hasDeck,
    });
    if (i === scenario.turns.length - 1) promptExcerpt = blocks.slice(0, 2000);

    turnResults.push({
      turnIndex: i,
      deckContext: {
        source: ctx.source,
        commanderName: ctx.commanderName,
        commanderStatus: ctx.commanderStatus,
        hasDeck: ctx.hasDeck,
        shouldAskCommanderConfirmation: ctx.shouldAskCommanderConfirmation,
        userJustConfirmedCommander: ctx.userJustConfirmedCommander,
        userJustCorrectedCommander: ctx.userJustCorrectedCommander,
        deckReplacedByHashChange: ctx.deckReplacedByHashChange,
      },
      promptBlocks: lastBlocks,
    });

    const { hard, soft } = checkDeckContextExpectations(
      ctx as unknown as Record<string, unknown>,
      turn.expectedDeckContext
    );
    hard.forEach((h) => hardFailures.push({ ...h, turnIndex: i }));
    soft.forEach((s) => softFailures.push({ ...s, turnIndex: i }));

    const expectedBlocks = turn.expectedPromptBlocks ?? [];
    const forbiddenBlocks = turn.forbiddenPromptBlocks ?? [];
    for (const b of expectedBlocks) {
      if (!lastBlocks.includes(b)) {
        hardFailures.push({
          kind: "missing_authoritative_block",
          message: `Expected prompt block "${b}" but it was not detected`,
          turnIndex: i,
        });
      }
    }
    for (const b of forbiddenBlocks) {
      if (lastBlocks.includes(b)) {
        hardFailures.push({
          kind: "forbidden_block_present",
          message: `Forbidden prompt block "${b}" was present`,
          turnIndex: i,
        });
      }
    }

    streamThreadHistory.push({ role: "user", content: text });
    threadState = {
      deck_id: ctx.deckId ?? threadState.deck_id,
      commander: ctx.commanderName ?? threadState.commander,
      decklist_text: ctx.decklistText ?? threadState.decklist_text,
      decklist_hash: ctx.decklistHash || (threadState.decklist_hash ?? null),
    };
  }

  const durationMs = Date.now() - start;
  const scenarioDecklist = lastCtx?.decklistText ?? threadState.decklist_text ?? null;
  const coherenceFindings = lastCtx
    ? validatePromptDeckCoherence(promptExcerpt, lastCtx, scenarioDecklist)
    : [];
  const semanticFindings = validateRoleClusterSemantics(promptExcerpt);
  const allFindings = [...coherenceFindings, ...semanticFindings];
  for (const f of allFindings) {
    if (f.kind === "hard") {
      hardFailures.push({ kind: "other", message: f.message });
    } else {
      softFailures.push({ kind: "other", message: f.message });
    }
  }
  const pass = hardFailures.length === 0;
  const hasSoft = softFailures.length > 0;
  const hasSemantic = allFindings.length > 0;
  const status: "PASS" | "PASS_WITH_WARNINGS" | "SOFT_FAIL" | "HARD_FAIL" =
    !pass ? "HARD_FAIL" :
    hasSoft || hasSemantic ? "PASS_WITH_WARNINGS" : "PASS";

  return {
    scenarioId: scenario.id,
    runTimestamp: new Date().toISOString(),
    durationMs,
    pass,
    hardFailures,
    softFailures,
    resolvedDeckSource: lastCtx?.source,
    resolvedCommanderName: lastCtx?.commanderName ?? null,
    resolvedCommanderStatus: lastCtx?.commanderStatus,
    promptBlocksDetected: lastBlocks,
    promptBlocksMissing: scenario.turns[scenario.turns.length - 1]?.expectedPromptBlocks?.filter((b) => !lastBlocks.includes(b)) ?? [],
    promptBlocksForbidden: (scenario.turns[scenario.turns.length - 1]?.forbiddenPromptBlocks ?? []).filter((b) => lastBlocks.includes(b)),
    semanticValidationFindings: allFindings.length ? allFindings : undefined,
    status,
    debug: {
      activeDeckContext: lastCtx ? (lastCtx as unknown as Record<string, unknown>) : undefined,
      promptExcerpt,
      turnResults,
    },
  };
}

export async function runScenarios(scenarios: Scenario[]): Promise<V2RunResult[]> {
  const results: V2RunResult[] = [];
  for (const s of scenarios) {
    const r = await runScenario(s);
    results.push(r);
  }
  return results;
}

export function buildRunSummary(results: V2RunResult[]): import("./types").V2RunSummary {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const hardCount = results.reduce((a, r) => a + r.hardFailures.length, 0);
  const softCount = results.reduce((a, r) => a + r.softFailures.length, 0);
  const withWarnings = results.filter((r) => r.status === "PASS_WITH_WARNINGS").length;
  const withSemantic = results.filter((r) => (r.semanticValidationFindings?.length ?? 0) > 0).length;
  return {
    total: results.length,
    passed,
    failed,
    hardFailures: hardCount,
    softFailures: softCount,
    scenariosWithWarnings: withWarnings,
    scenariosWithSemanticIssues: withSemantic,
    results,
    lastRunAt: new Date().toISOString(),
  };
}
