/**
 * Test Suite V2 — scenario and result types.
 * Used by the admin V2 evaluation dashboard.
 */

export type ScenarioCategory =
  | "state_memory"
  | "rules_legality"
  | "deck_intelligence"
  | "prompt_contract"
  | "adversarial"
  | "fuzz_formatting";

export type ScenarioTurn = {
  /** User message for this turn */
  userMessage: string;
  /** Optional: assistant message before this (for multi-turn) */
  assistantMessageBefore?: string;
  /** Expected ActiveDeckContext after this turn */
  expectedDeckContext?: {
    source?: string;
    commanderName?: string | null;
    commanderStatus?: string;
    hasDeck?: boolean;
    userJustConfirmedCommander?: boolean;
    userJustCorrectedCommander?: boolean;
    shouldAskCommanderConfirmation?: boolean;
    askReason?: string | null;
    deckReplacedByHashChange?: boolean;
    isFullDecklist?: boolean;
  };
  /** Prompt blocks that MUST be present */
  expectedPromptBlocks?: string[];
  /** Prompt blocks that must NOT be present */
  forbiddenPromptBlocks?: string[];
  /** Substrings that output should contain (if model run) */
  expectedOutputTraits?: string[];
  /** Substrings output must NOT contain */
  forbiddenOutputTraits?: string[];
  /** Hard failure rules (ship blockers) */
  hardFailureRules?: string[];
  /** Soft failure rules (quality concerns) */
  softFailureRules?: string[];
};

export type Scenario = {
  id: string;
  title: string;
  category: ScenarioCategory;
  description: string;
  tags: string[];
  /** Single-turn: one message. Multi-turn: conversation. */
  turns: ScenarioTurn[];
  /** Initial thread state */
  initialThread?: {
    deck_id?: string | null;
    commander?: string | null;
    decklist_text?: string | null;
    decklist_hash?: string | null;
  };
  /** Is user guest (no tid) or logged in */
  isGuest?: boolean;
  /** Linked deck data if simulating linked deck */
  linkedDeck?: {
    deckId: string;
    commander: string;
    deckText: string;
    entries: Array<{ name: string; count: number }>;
  };
  /** Prior messages in thread (before first turn) */
  priorMessages?: Array<{ role: string; content: string }>;
  notes?: string;
  /** Expected behavior summary for UI */
  expectedBehavior?: string;
  /** Optional: use fixture rules bundle for deterministic runs */
  rulesBundleKey?: "multani" | "black_lotus" | "grist" | "avenger" | null;
};

export type HardFailureKind =
  | "commander_forgotten_after_confirm"
  | "decklist_reasked_when_known"
  | "off_color_suggestion"
  | "illegal_commander_statement"
  | "contradictory_rules"
  | "missing_authoritative_block"
  | "forbidden_block_present"
  | "wrong_deck_source"
  | "commander_status_wrong"
  | "other";

export type SoftFailureKind =
  | "weak_explanation"
  | "generic_synergy"
  | "too_vague"
  | "missed_synergy_chain"
  | "didnt_mention_tension"
  | "other";

export type V2RunResult = {
  scenarioId: string;
  runTimestamp: string;
  durationMs: number;
  pass: boolean;
  hardFailures: Array<{
    kind: HardFailureKind;
    message: string;
    turnIndex?: number;
  }>;
  softFailures: Array<{
    kind: SoftFailureKind;
    message: string;
    turnIndex?: number;
  }>;
  /** Resolved deck source for last turn */
  resolvedDeckSource?: string;
  resolvedCommanderName?: string | null;
  resolvedCommanderStatus?: string;
  /** Detected prompt blocks */
  promptBlocksDetected: string[];
  /** Expected but missing */
  promptBlocksMissing: string[];
  /** Forbidden but present */
  promptBlocksForbidden: string[];
  /** Validator findings if model output was validated */
  validatorFindings?: string[];
  /** Raw model response if run */
  modelResponse?: string;
  /** Debug artifacts */
  debug: {
    activeDeckContext?: Record<string, unknown>;
    promptExcerpt?: string;
    turnResults?: Array<{
      turnIndex: number;
      deckContext: Record<string, unknown>;
      promptBlocks: string[];
    }>;
  };
  notes?: string;
};

export type V2RunSummary = {
  total: number;
  passed: number;
  failed: number;
  hardFailures: number;
  softFailures: number;
  results: V2RunResult[];
  lastRunAt: string;
};
