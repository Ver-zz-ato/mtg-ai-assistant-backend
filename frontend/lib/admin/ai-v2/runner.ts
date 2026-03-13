/**
 * Test Suite V2 — scenario runner.
 * Executes scenarios through app-layer logic without model calls (deterministic).
 */

import { resolveActiveDeckContext } from "@/lib/chat/active-deck-context";
import { classifyPromptTier } from "@/lib/ai/prompt-tier";
import { hashDecklist, normalizeDecklistText } from "@/lib/chat/decklist-normalize";
import { assembleIntelligenceBlocks, detectBlockNames } from "./assemble-blocks";
import {
  FIXTURE_V2_SUMMARY,
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

function resolveV2Summary(scenario: Scenario, decklistText: string | null): typeof FIXTURE_V2_SUMMARY | null {
  if (!decklistText?.trim()) return null;
  try {
    return buildFixtureV2Summary(decklistText);
  } catch {
    return FIXTURE_V2_SUMMARY;
  }
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
    soft.push({
      kind: "other",
      message: `Expected deckReplacedByHashChange ${expected.deckReplacedByHashChange}, got ${ctx.deckReplacedByHashChange}`,
    });
  }
  return { hard, soft };
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
    lastBlocks = detectBlockNames(blocks);
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
  const pass = hardFailures.length === 0;

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
    results.push(await runScenario(s));
  }
  return results;
}
