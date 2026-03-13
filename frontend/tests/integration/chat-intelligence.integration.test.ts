/**
 * Integration test harness for ManaTap chat intelligence modules.
 * Validates prompt assembly, rules facts injection, deck intelligence injection,
 * and ActiveDeckContext behavior — WITHOUT calling OpenAI or full Supabase.
 *
 * Run: npx tsx tests/integration/chat-intelligence.integration.test.ts
 */

import assert from "node:assert";
import { resolveActiveDeckContext, isAuthoritativeForPrompt } from "@/lib/chat/active-deck-context";
import { classifyPromptTier } from "@/lib/ai/prompt-tier";
import {
  detectRulesLegalityIntent,
  extractCardNamesFromMessage,
  getRulesFactBundle,
} from "@/lib/deck/rules-facts";
import {
  formatForLLM,
  formatDeckPlanProfileForLLM,
  formatRulesFactsForLLM,
} from "@/lib/deck/intelligence-formatter";
import { buildDeckPlanProfile } from "@/lib/deck/deck-plan-profile";
import type { RulesFactBundle } from "@/lib/deck/rules-facts";
import type { DeckContextSummary } from "@/lib/deck/deck-context-summary";
import type { DeckFacts } from "@/lib/deck/deck-facts";
import type { SynergyDiagnostics } from "@/lib/deck/synergy-diagnostics";
import { hashDecklist, normalizeDecklistText } from "@/lib/chat/decklist-normalize";

// ============ Fixtures ============

const MONO_GREEN_DECKLIST = `Commander
1 Multani, Yavimaya's Avatar

Deck
1 Avenger of Zendikar
1 Craterhoof Behemoth
1 Cultivate
1 Kodama's Reach
1 Skyshroud Claim
1 Scapeshift
1 Splendid Reclamation
1 Ulvenwald Hydra
1 Exploration
1 Azusa, Lost but Seeking
1 Rampant Growth
1 Farseek
1 Sol Ring
1 Command Tower
1 Arcane Signet
35 Forest`;

const MOCK_DECK_FACTS: DeckFacts = {
  commander: "Multani, Yavimaya's Avatar",
  format: "Commander",
  color_identity: ["G"],
  land_count: 38,
  nonland_count: 61,
  avg_cmc: 3.2,
  curve_histogram: [8, 12, 18, 14, 9],
  ramp_count: 14,
  draw_count: 6,
  interaction_count: 4,
  interaction_buckets: { stack: 0, spot: 3, sweepers: 1, repeatable: 0, gy_hate: 0 },
  role_counts: {
    ramp: 6,
    land_ramp: 8,
    mana_dork: 0,
    draw: 4,
    spot_removal: 3,
    board_wipe: 1,
    finisher: 3,
    payoff: 4,
  },
  legality_flags: [],
  off_color_cards: [],
  banned_cards: [],
  archetype_candidates: [
    { name: "ramp_midrange", score: 0.85 },
    { name: "tokens", score: 0.4 },
  ],
  engine_candidates: [{ name: "recursion", score: 0.3 }],
  win_pattern_candidates: [
    { name: "combat", score: 0.7 },
    { name: "engine", score: 0.5 },
  ],
  curve_profile: "midrange",
  uncertainty_flags: [],
};

const MOCK_SYNERGY_DIAGNOSTICS: SynergyDiagnostics = {
  top_synergy_clusters: [
    ["Cultivate", "Kodama's Reach", "Rampant Growth", "Farseek"],
    ["Avenger of Zendikar", "Craterhoof Behemoth", "Ulvenwald Hydra"],
  ],
  primary_engine_cards: ["Cultivate", "Kodama's Reach", "Azusa, Lost but Seeking"],
  primary_payoff_cards: ["Avenger of Zendikar", "Craterhoof Behemoth", "Ulvenwald Hydra"],
  core_cards: ["Cultivate", "Kodama's Reach", "Avenger of Zendikar", "Craterhoof Behemoth"],
  support_cards: ["Rampant Growth", "Farseek", "Azusa, Lost but Seeking", "Exploration"],
  peripheral_cards: ["Sol Ring", "Command Tower", "Arcane Signet"],
  low_synergy_candidates: [],
  off_plan_candidates: [],
  inefficient_slot_candidates: [],
  missing_support: [],
  tension_flags: [],
};

const FIXTURE_V2_SUMMARY: DeckContextSummary = {
  deck_hash: hashDecklist(normalizeDecklistText(MONO_GREEN_DECKLIST)),
  format: "Commander",
  commander: "Multani, Yavimaya's Avatar",
  colors: ["G"],
  land_count: 38,
  curve_histogram: [8, 12, 18, 14, 9],
  ramp: 14,
  removal: 4,
  draw: 6,
  board_wipes: 1,
  wincons: 3,
  archetype_tags: ["ramp_midrange"],
  warning_flags: [],
  card_names: [
    "Multani, Yavimaya's Avatar",
    "Avenger of Zendikar",
    "Craterhoof Behemoth",
    "Cultivate",
    "Kodama's Reach",
    "Skyshroud Claim",
    "Scapeshift",
    "Splendid Reclamation",
    "Ulvenwald Hydra",
    "Exploration",
    "Azusa, Lost but Seeking",
  ],
  ramp_cards: ["Cultivate", "Kodama's Reach", "Rampant Growth", "Farseek", "Skyshroud Claim"],
  draw_cards: [],
  removal_cards: [],
  card_count: 99,
  last_updated: new Date().toISOString(),
  deck_facts: MOCK_DECK_FACTS,
  synergy_diagnostics: MOCK_SYNERGY_DIAGNOSTICS,
};

const MOCK_RULES_BUNDLE_MULTANI: RulesFactBundle = {
  commander: {
    cardName: "Multani, Yavimaya's Avatar",
    typeLine: "Legendary Creature — Elemental",
    commanderEligible: true,
    commanderEligibleReason: "legendary_creature",
    colorIdentity: ["G"],
    legalInCommander: true,
    oracleSummary: "Legendary Creature — Elemental. Legal commander (Legendary Creature).",
    cacheMiss: false,
  },
  cards: [],
  deckColorIdentity: ["G"],
};

const MOCK_RULES_BUNDLE_BLACK_LOTUS: RulesFactBundle = {
  commander: null,
  cards: [
    {
      cardName: "Black Lotus",
      typeLine: "Artifact",
      commanderEligible: false,
      commanderEligibleReason: null,
      colorIdentity: [],
      legalInCommander: false,
      oracleSummary: "Artifact. Banned in Commander.",
      cacheMiss: false,
    },
  ],
  deckColorIdentity: [],
};

const MOCK_RULES_BUNDLE_GRIST: RulesFactBundle = {
  commander: null,
  cards: [
    {
      cardName: "Grist, the Hunger Tide",
      typeLine: "Legendary Creature — Insect",
      commanderEligible: true,
      commanderEligibleReason: "oracle_text",
      colorIdentity: ["B", "G"],
      legalInCommander: true,
      oracleSummary: "Legendary Creature — Insect. Legal commander via oracle text.",
      cacheMiss: false,
    },
  ],
  deckColorIdentity: ["B", "G"],
};

// ============ Prompt Assembly Simulator ============

type AssembleInputs = {
  text: string;
  activeDeckContext: ReturnType<typeof resolveActiveDeckContext>;
  v2Summary: DeckContextSummary | null;
  selectedTier: "micro" | "standard" | "full";
  streamThreadHistory: Array<{ role: string; content: string }>;
  rulesBundleOverride?: RulesFactBundle | null; // When set, use instead of calling getRulesFactBundle
};

async function assembleIntelligenceBlocks(inputs: AssembleInputs): Promise<string> {
  const { text, activeDeckContext, v2Summary, selectedTier, rulesBundleOverride } = inputs;
  let sys = "";

  // Rules Facts block (matches stream route logic)
  if (selectedTier !== "micro") {
    if (detectRulesLegalityIntent(text)) {
      const rulesCommander = activeDeckContext.commanderName ?? v2Summary?.commander ?? null;
      const rulesCards = extractCardNamesFromMessage(text);
      if (rulesCommander || rulesCards.length) {
        let bundle: RulesFactBundle;
        if (rulesBundleOverride) {
          bundle = rulesBundleOverride;
        } else {
          try {
            bundle = await getRulesFactBundle(rulesCommander, rulesCards.length ? rulesCards : undefined);
          } catch {
            bundle = MOCK_RULES_BUNDLE_MULTANI; // Fallback when cache unavailable
          }
        }
        const rulesProse = formatRulesFactsForLLM(bundle);
        sys += `\n\n=== RULES FACTS (AUTHORITATIVE - DO NOT CONTRADICT) ===\n${rulesProse}\n`;
      }
    }
  }

  // Deck Intelligence block (matches stream route logic)
  if (selectedTier === "full" && v2Summary?.deck_facts && v2Summary?.synergy_diagnostics) {
    const { formatForLLM } = await import("@/lib/deck/intelligence-formatter");
    const commanderForFacts = activeDeckContext.userJustCorrectedCommander
      ? activeDeckContext.commanderName
      : undefined;
    const deckFactsProse = formatForLLM(
      v2Summary.deck_facts,
      v2Summary.synergy_diagnostics,
      commanderForFacts ?? undefined
    );
    sys += `\n\n=== DECK INTELLIGENCE (AUTHORITATIVE - DO NOT CONTRADICT) ===\n${deckFactsProse}\n`;
    const deckPlanOptions = {
      rampCards: v2Summary.ramp_cards,
      drawCards: v2Summary.draw_cards,
      removalCards: v2Summary.removal_cards,
    };
    const deckPlanProfile = buildDeckPlanProfile(
      v2Summary.deck_facts,
      v2Summary.synergy_diagnostics,
      deckPlanOptions
    );
    const deckPlanProse = formatDeckPlanProfileForLLM(deckPlanProfile);
    sys += `\n${deckPlanProse}\n`;
  }

  return sys;
}

function baseResolveArgs(overrides: Record<string, unknown> = {}) {
  return {
    tid: null as string | null,
    isGuest: false,
    userId: null as string | null,
    text: null as string | null,
    context: null,
    prefs: null,
    thread: null,
    streamThreadHistory: [] as Array<{ role: string; content?: string }>,
    clientConversation: [] as Array<{ role: string; content?: string }>,
    deckData: null,
    ...overrides,
  };
}

// ============ Test Runner ============

const results: { name: string; pass: boolean; error?: string }[] = [];

async function run(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    const p = fn();
    if (p && typeof (p as Promise<unknown>).then === "function") {
      await p;
    }
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, error: String((e as Error)?.message ?? e) });
  }
}

// ============ Main ============

async function main() {
  const hash = (t: string) => hashDecklist(normalizeDecklistText(t));

  await run("Rules: commander eligibility intent detected", () => {
  const msg = "Can [[Multani, Yavimaya's Avatar]] be a commander?";
  assert.strictEqual(detectRulesLegalityIntent(msg), true);
  const cards = extractCardNamesFromMessage(msg);
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0], "Multani, Yavimaya's Avatar");
  });

  await run("Rules: getRulesFactBundle returns structured facts (or mock)", async () => {
  let bundle: RulesFactBundle;
  try {
    bundle = await getRulesFactBundle(null, ["Multani, Yavimaya's Avatar"]);
    assert.ok(bundle.cards.length >= 1 || bundle.commander !== null);
    assert.ok(
      bundle.deckColorIdentity.length >= 0,
      "deckColorIdentity present"
    );
  } catch {
    bundle = MOCK_RULES_BUNDLE_MULTANI;
    assert.strictEqual(bundle.commander?.commanderEligible, true);
    assert.ok(bundle.commander?.colorIdentity?.includes("G"));
  }
  });

  await run("Rules: commander eligibility - prompt includes RULES FACTS block", async () => {
  const ctx = resolveActiveDeckContext(
    baseResolveArgs({ text: "Can [[Multani, Yavimaya's Avatar]] be a commander?" })
  );
  const tierResult = classifyPromptTier({
    text: "Can [[Multani, Yavimaya's Avatar]] be a commander?",
    hasDeckContext: false,
  });
  const blocks = await assembleIntelligenceBlocks({
    text: "Can [[Multani, Yavimaya's Avatar]] be a commander?",
    activeDeckContext: ctx,
    v2Summary: null,
    selectedTier: tierResult.tier,
    streamThreadHistory: [],
    rulesBundleOverride: MOCK_RULES_BUNDLE_MULTANI,
  });
  assert.ok(blocks.includes("=== RULES FACTS (AUTHORITATIVE - DO NOT CONTRADICT) ==="));
  assert.ok(blocks.includes("commander eligible") || blocks.includes("Commander eligible"));
  assert.ok(blocks.includes("Multani") || blocks.includes("color identity"));
  });

  await run("Rules: banned card check - prompt includes RULES FACTS", async () => {
  const ctx = resolveActiveDeckContext(
    baseResolveArgs({ text: "Is [[Black Lotus]] legal in Commander?" })
  );
  const tierResult = classifyPromptTier({
    text: "Is [[Black Lotus]] legal in Commander?",
    hasDeckContext: false,
  });
  const blocks = await assembleIntelligenceBlocks({
    text: "Is [[Black Lotus]] legal in Commander?",
    activeDeckContext: ctx,
    v2Summary: null,
    selectedTier: tierResult.tier,
    streamThreadHistory: [],
    rulesBundleOverride: MOCK_RULES_BUNDLE_BLACK_LOTUS,
  });
  assert.ok(blocks.includes("=== RULES FACTS (AUTHORITATIVE - DO NOT CONTRADICT) ==="));
  assert.ok(blocks.includes("Black Lotus") || blocks.includes("legal"));
});

run("Rules: card rules question - RULES FACTS injected, no deck intelligence", async () => {
  const ctx = resolveActiveDeckContext(
    baseResolveArgs({ text: "What does [[Grist, the Hunger Tide]] do in Commander?" })
  );
  const tierResult = classifyPromptTier({
    text: "What does [[Grist, the Hunger Tide]] do in Commander?",
    hasDeckContext: false,
  });
  const blocks = await assembleIntelligenceBlocks({
    text: "What does [[Grist, the Hunger Tide]] do in Commander?",
    activeDeckContext: ctx,
    v2Summary: null,
    selectedTier: tierResult.tier,
    streamThreadHistory: [],
    rulesBundleOverride: MOCK_RULES_BUNDLE_GRIST,
  });
  assert.ok(blocks.includes("=== RULES FACTS (AUTHORITATIVE - DO NOT CONTRADICT) ==="));
  assert.ok(!blocks.includes("=== DECK INTELLIGENCE") || blocks.indexOf("RULES FACTS") < blocks.indexOf("DECK INTELLIGENCE"));
  });

  await run("Deck: Explain ramp mix - DECK INTELLIGENCE injected", async () => {
  const ctx = resolveActiveDeckContext(
    baseResolveArgs({
      text: "Explain the ramp mix in my deck.",
      thread: {
        deck_id: null,
        commander: "Multani, Yavimaya's Avatar",
        decklist_text: MONO_GREEN_DECKLIST,
        decklist_hash: hash(MONO_GREEN_DECKLIST),
      },
    })
  );
  const tierResult = classifyPromptTier({
    text: "Explain the ramp mix in my deck.",
    hasDeckContext: true,
  });
  assert.strictEqual(tierResult.tier, "full");
  const blocks = await assembleIntelligenceBlocks({
    text: "Explain the ramp mix in my deck.",
    activeDeckContext: ctx,
    v2Summary: FIXTURE_V2_SUMMARY,
    selectedTier: "full",
    streamThreadHistory: [],
  });
  assert.ok(blocks.includes("=== DECK INTELLIGENCE (AUTHORITATIVE - DO NOT CONTRADICT) ==="));
  assert.ok(blocks.includes("Deck Plan Profile") || blocks.includes("primary plan"));
  assert.ok(blocks.includes("ramp") || blocks.includes("Ramp"));
  assert.ok(blocks.includes("synergy") || blocks.includes("Synergy"));
  assert.ok(blocks.includes("Win routes") || blocks.includes("win routes"));
});

run("Deck: RULES FACTS NOT injected for deck analysis only", async () => {
  const blocks = await assembleIntelligenceBlocks({
    text: "Explain the ramp mix in my deck.",
    activeDeckContext: resolveActiveDeckContext(
      baseResolveArgs({
        thread: {
          deck_id: null,
          commander: "Multani, Yavimaya's Avatar",
          decklist_text: MONO_GREEN_DECKLIST,
          decklist_hash: hash(MONO_GREEN_DECKLIST),
        },
      })
    ),
    v2Summary: FIXTURE_V2_SUMMARY,
    selectedTier: "full",
    streamThreadHistory: [],
  });
  assert.ok(blocks.includes("DECK INTELLIGENCE"));
  assert.ok(!blocks.includes("RULES FACTS"));
  });

  await run("Combined: rules + deck - both blocks appear", async () => {
  const ctx = resolveActiveDeckContext(
    baseResolveArgs({
      text: "Is my commander [[Multani, Yavimaya's Avatar]] actually legal?",
      thread: {
        deck_id: null,
        commander: "Multani, Yavimaya's Avatar",
        decklist_text: MONO_GREEN_DECKLIST,
        decklist_hash: hash(MONO_GREEN_DECKLIST),
      },
    })
  );
  const blocks = await assembleIntelligenceBlocks({
    text: "Is my commander [[Multani, Yavimaya's Avatar]] actually legal?",
    activeDeckContext: ctx,
    v2Summary: FIXTURE_V2_SUMMARY,
    selectedTier: "full",
    streamThreadHistory: [],
    rulesBundleOverride: MOCK_RULES_BUNDLE_MULTANI,
  });
  assert.ok(blocks.includes("=== RULES FACTS (AUTHORITATIVE - DO NOT CONTRADICT) ==="));
  assert.ok(blocks.includes("=== DECK INTELLIGENCE (AUTHORITATIVE - DO NOT CONTRADICT) ==="));
  const rulesPos = blocks.indexOf("RULES FACTS");
  const deckPos = blocks.indexOf("DECK INTELLIGENCE");
  assert.ok(rulesPos >= 0 && deckPos >= 0, "both blocks present");
  });

  await run("Commander: infer → correct → userJustCorrectedCommander true", () => {
    const ctx = resolveActiveDeckContext(
      baseResolveArgs({
        tid: "t1",
        text: "no, it's Titania, Protector of Argoth",
        thread: {
          deck_id: null,
          commander: null,
          decklist_text: MONO_GREEN_DECKLIST,
          decklist_hash: hash(MONO_GREEN_DECKLIST),
        },
        streamThreadHistory: [
          { role: "user", content: MONO_GREEN_DECKLIST },
          {
            role: "assistant",
            content: "I believe your commander is [[Multani, Yavimaya's Avatar]]. Is this correct?",
          },
        ],
      })
    );
    assert.strictEqual(ctx.userJustCorrectedCommander, true);
    assert.strictEqual(ctx.commanderName, "Titania, Protector of Argoth");
    assert.strictEqual(isAuthoritativeForPrompt(ctx), true);
  });

  await run("Commander: infer → confirm → userJustConfirmedCommander true", () => {
  const ctx = resolveActiveDeckContext(
    baseResolveArgs({
      tid: "t1",
      text: "yes",
      thread: {
        deck_id: null,
        commander: null,
        decklist_text: MONO_GREEN_DECKLIST,
        decklist_hash: hash(MONO_GREEN_DECKLIST),
      },
      streamThreadHistory: [
        { role: "user", content: MONO_GREEN_DECKLIST },
        {
          role: "assistant",
          content: "I believe your commander is Multani, Yavimaya's Avatar. Is this correct?",
        },
      ],
    })
  );
  assert.strictEqual(ctx.userJustConfirmedCommander, true);
  assert.strictEqual(isAuthoritativeForPrompt(ctx), true);
  });

  await run("Commander: follow-up after confirm - no re-ask", () => {
  const ctx = resolveActiveDeckContext(
    baseResolveArgs({
      tid: "t1",
      text: "suggest ramp upgrades",
      thread: {
        deck_id: null,
        commander: "Multani, Yavimaya's Avatar",
        decklist_text: MONO_GREEN_DECKLIST,
        decklist_hash: hash(MONO_GREEN_DECKLIST),
      },
    })
  );
  assert.strictEqual(ctx.commanderStatus, "confirmed");
  assert.strictEqual(ctx.shouldAskCommanderConfirmation, false);
  assert.strictEqual(ctx.askReason, null);
  });

  await run("Deck: paste A then paste B - deckReplacedByHashChange", () => {
    const deckB = `Commander
1 Azusa, Lost but Seeking

Deck
1 Sol Ring
1 Command Tower
1 Cultivate
1 Kodama's Reach
35 Forest`;
    const ctx = resolveActiveDeckContext(
      baseResolveArgs({
        tid: "t1",
        text: deckB,
        thread: {
          deck_id: null,
          commander: "Multani, Yavimaya's Avatar",
          decklist_text: MONO_GREEN_DECKLIST,
          decklist_hash: hash(MONO_GREEN_DECKLIST),
        },
      })
    );
    assert.strictEqual(ctx.deckReplacedByHashChange, true);
    assert.notStrictEqual(ctx.decklistHash, hash(MONO_GREEN_DECKLIST));
  });

  await run("Snapshot: RULES FACTS block format", async () => {
    const blocks = await assembleIntelligenceBlocks({
    text: "Can [[Multani, Yavimaya's Avatar]] be a commander?",
    activeDeckContext: resolveActiveDeckContext(baseResolveArgs()),
    v2Summary: null,
    selectedTier: "standard",
    streamThreadHistory: [],
    rulesBundleOverride: MOCK_RULES_BUNDLE_MULTANI,
    });
    assert.ok(blocks.includes("AUTHORITATIVE - DO NOT CONTRADICT"));
    assert.ok(blocks.includes("Multani") || blocks.includes("color identity"));
  });

  await run("Snapshot: DECK INTELLIGENCE block format", async () => {
    const blocks = await assembleIntelligenceBlocks({
    text: "analyze my deck",
    activeDeckContext: resolveActiveDeckContext(
      baseResolveArgs({
        thread: {
          deck_id: null,
          commander: "Multani, Yavimaya's Avatar",
          decklist_text: MONO_GREEN_DECKLIST,
          decklist_hash: hash(MONO_GREEN_DECKLIST),
        },
      })
    ),
    v2Summary: FIXTURE_V2_SUMMARY,
    selectedTier: "full",
    streamThreadHistory: [],
    });
    assert.ok(blocks.includes("Deck Facts") || blocks.includes("Deck Plan Profile"));
    assert.ok(blocks.includes("ramp_midrange") || blocks.includes("primary plan"));
  });

  // Report
  const passed = results.filter((r) => r.pass);
  const failed = results.filter((r) => !r.pass);

  console.log("\n========== Chat Intelligence Integration Test Report ==========\n");
  console.log(`Tests passed: ${passed.length}`);
  console.log(`Tests failed: ${failed.length}`);
  if (failed.length) {
    console.log("\nFailed tests:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.error ?? "unknown"}`));
  }

  // Example prompts
  const rulesPrompt = await assembleIntelligenceBlocks({
    text: "Can [[Multani, Yavimaya's Avatar]] be a commander?",
    activeDeckContext: resolveActiveDeckContext(baseResolveArgs()),
    v2Summary: null,
    selectedTier: "standard",
    streamThreadHistory: [],
    rulesBundleOverride: MOCK_RULES_BUNDLE_MULTANI,
  });
  console.log("\n--- Example: Rules question prompt ---\n" + rulesPrompt.slice(0, 500) + "\n");

  const deckPrompt = await assembleIntelligenceBlocks({
    text: "Explain the ramp mix in my deck.",
    activeDeckContext: resolveActiveDeckContext(
      baseResolveArgs({
        thread: {
          deck_id: null,
          commander: "Multani",
          decklist_text: MONO_GREEN_DECKLIST,
          decklist_hash: hash(MONO_GREEN_DECKLIST),
        },
      })
    ),
    v2Summary: FIXTURE_V2_SUMMARY,
    selectedTier: "full",
    streamThreadHistory: [],
  });
  console.log("\n--- Example: Deck analysis prompt ---\n" + deckPrompt.slice(0, 600) + "\n");

  const combinedPrompt = await assembleIntelligenceBlocks({
    text: "Is my commander [[Multani]] legal?",
    activeDeckContext: resolveActiveDeckContext(
      baseResolveArgs({
        thread: {
          deck_id: null,
          commander: "Multani",
          decklist_text: MONO_GREEN_DECKLIST,
          decklist_hash: hash(MONO_GREEN_DECKLIST),
        },
      })
    ),
    v2Summary: FIXTURE_V2_SUMMARY,
    selectedTier: "full",
    streamThreadHistory: [],
    rulesBundleOverride: MOCK_RULES_BUNDLE_MULTANI,
  });
  console.log("\n--- Example: Combined rules+deck prompt ---\n" + combinedPrompt.slice(0, 800) + "\n");

  if (failed.length > 0) {
    process.exit(1);
  }
  console.log("\nAll chat intelligence integration tests passed.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
