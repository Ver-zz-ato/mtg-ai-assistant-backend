/**
 * Test Suite V2 — seed scenarios.
 */

import type { Scenario } from "../types";
import { MONO_GREEN_DECKLIST } from "../fixtures";

export const SCENARIOS: Scenario[] = [
  // === State / Memory ===
  {
    id: "state-001-paste-infer-confirm-follow",
    title: "Paste deck → infer commander → confirm yes → follow-up uses confirmed commander",
    category: "state_memory",
    description: "User pastes deck, AI infers Multani, user confirms with yes, follow-up uses that commander.",
    tags: ["state", "commander", "multi-turn"],
    expectedBehavior: "After user confirms 'yes', follow-up deck analysis must use Multani as authoritative commander.",
    turns: [
      {
        userMessage: MONO_GREEN_DECKLIST,
        expectedDeckContext: { hasDeck: true, commanderName: "Multani, Yavimaya's Avatar", commanderStatus: "inferred" },
      },
      {
        userMessage: "yes",
        assistantMessageBefore: "I believe your commander is Multani, Yavimaya's Avatar. Is this correct?",
        expectedDeckContext: { commanderStatus: "confirmed", userJustConfirmedCommander: true },
      },
      {
        userMessage: "What's my deck's main plan?",
        expectedDeckContext: { commanderName: "Multani, Yavimaya's Avatar", commanderStatus: "confirmed" },
        expectedPromptBlocks: ["DECK_INTELLIGENCE_BLOCK"],
      },
    ],
    priorMessages: [],
    notes: "Tests state carryover across confirmation flow.",
  },
  {
    id: "state-002-paste-infer-correct-follow",
    title: "Paste deck → infer commander → correct commander → follow-up uses corrected commander",
    category: "state_memory",
    description: "User pastes deck, AI infers wrong commander, user corrects, follow-up uses corrected commander.",
    tags: ["state", "commander", "correction", "multi-turn"],
    expectedBehavior: "User corrects to different commander; follow-up must use corrected commander.",
    turns: [
      {
        userMessage: MONO_GREEN_DECKLIST,
        expectedDeckContext: { hasDeck: true },
      },
      {
        userMessage: "No, it's [[Selvala, Heart of the Wilds]]",
        assistantMessageBefore: "I believe your commander is Multani, Yavimaya's Avatar. Is this correct?",
        expectedDeckContext: { commanderName: "Selvala, Heart of the Wilds", userJustCorrectedCommander: true },
      },
    ],
    priorMessages: [],
    notes: "Correction flow; Selvala may not be in deck but user explicitly corrected.",
  },
  {
    id: "state-003-linked-follow-no-ask",
    title: "Linked deck follow-up does not ask for decklist",
    category: "state_memory",
    description: "User has linked deck; follow-up analysis must not ask for decklist.",
    tags: ["state", "linked", "no-ask"],
    turns: [
      {
        userMessage: "Explain the ramp mix in my deck.",
        expectedDeckContext: { source: "linked", hasDeck: true },
        expectedPromptBlocks: ["DECK_INTELLIGENCE_BLOCK"],
        forbiddenPromptBlocks: [],
        hardFailureRules: ["Must not ask user to provide decklist when linked deck is available"],
      },
    ],
    linkedDeck: {
      deckId: "linked-deck-1",
      commander: "Multani, Yavimaya's Avatar",
      deckText: MONO_GREEN_DECKLIST,
      entries: [
        { name: "Multani, Yavimaya's Avatar", count: 1 },
        { name: "Avenger of Zendikar", count: 1 },
        { name: "Forest", count: 35 },
      ],
    },
    initialThread: { deck_id: "linked-deck-1", commander: "Multani, Yavimaya's Avatar" },
  },
  {
    id: "state-004-linked-override-paste",
    title: "Linked deck explicitly overridden by pasted deck",
    category: "state_memory",
    description: "User has linked deck but pastes new deck with override language; pasted deck should win.",
    tags: ["state", "override", "pasted"],
    turns: [
      {
        userMessage: "Ignore the linked deck. Use this deck instead:\n\nCommander\n1 Teysa Karlov\n\nDeck\n1 Orzhov Signet\n38 Plains\n38 Swamp\n",
        expectedDeckContext: { hasDeck: true },
      },
    ],
    linkedDeck: {
      deckId: "linked-deck-1",
      commander: "Multani, Yavimaya's Avatar",
      deckText: MONO_GREEN_DECKLIST,
      entries: [],
    },
    initialThread: { deck_id: "linked-deck-1" },
  },
  {
    id: "state-005-deck-replace-hash",
    title: "New pasted deck replaces old deck hash and clears commander appropriately",
    category: "state_memory",
    description: "User had deck A, pastes completely different deck B; new hash, commander should reflect new deck.",
    tags: ["state", "replacement", "hash"],
    turns: [
      {
        userMessage: MONO_GREEN_DECKLIST,
        expectedDeckContext: { hasDeck: true, deckReplacedByHashChange: false },
      },
      {
        userMessage: "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n1 Command Tower\n1 Arcane Signet\n1 Cultivate\n1 Farseek\n1 Rampant Growth\n1 Kodama's Reach\n1 Skyshroud Claim\n91 Forest",
        expectedDeckContext: { hasDeck: true, deckReplacedByHashChange: true },
      },
    ],
    priorMessages: [],
  },

  // === Rules / Legality ===
  {
    id: "rules-001-multani-commander",
    rulesBundleKey: "multani",
    title: "Multani can be commander",
    category: "rules_legality",
    description: "User asks if Multani can be commander; RULES FACTS must state yes.",
    tags: ["rules", "commander", "legal"],
    turns: [
      {
        userMessage: "Can [[Multani, Yavimaya's Avatar]] be a commander?",
        expectedPromptBlocks: ["RULES_FACTS_BLOCK"],
        forbiddenPromptBlocks: ["DECK_INTELLIGENCE_BLOCK"],
        expectedOutputTraits: ["yes", "legal", "commander"],
      },
    ],
  },
  {
    id: "rules-002-black-lotus-banned",
    title: "Black Lotus banned in Commander",
    category: "rules_legality",
    description: "User asks if Black Lotus is legal; RULES FACTS must state banned.",
    tags: ["rules", "banned"],
    turns: [
      {
        userMessage: "Is [[Black Lotus]] legal in Commander?",
        expectedPromptBlocks: ["RULES_FACTS_BLOCK"],
        expectedOutputTraits: ["banned", "not legal"],
      },
    ],
  },
  {
    id: "rules-003-grist-commander",
    rulesBundleKey: "grist",
    title: "Grist commander eligibility",
    category: "rules_legality",
    description: "Grist can be commander via oracle text.",
    tags: ["rules", "commander", "hybrid"],
    turns: [
      {
        userMessage: "Can [[Grist, the Hunger Tide]] be a commander?",
        expectedPromptBlocks: ["RULES_FACTS_BLOCK"],
        expectedOutputTraits: ["yes", "commander"],
      },
    ],
  },
  {
    id: "rules-004-nonlegendary-no-commander",
    rulesBundleKey: "avenger",
    title: "Nonlegendary creature cannot be commander",
    category: "rules_legality",
    description: "Oracle rule: nonlegendary creatures cannot be commander.",
    tags: ["rules", "commander", "illegal"],
    turns: [
      {
        userMessage: "Can [[Avenger of Zendikar]] be a commander?",
        expectedPromptBlocks: ["RULES_FACTS_BLOCK"],
        expectedOutputTraits: ["no", "legendary"],
      },
    ],
  },
  {
    id: "rules-005-oracle-vs-physical",
    title: "Oracle-vs-physical-print bait question",
    category: "rules_legality",
    description: "Card that changed type in Oracle; answer must use Oracle text.",
    tags: ["rules", "oracle"],
    turns: [
      {
        userMessage: "Is [[Dryad Arbor]] legal in Commander? What does it count as?",
        expectedPromptBlocks: ["RULES_FACTS_BLOCK"],
      },
    ],
  },

  // === Deck Intelligence ===
  {
    id: "deck-001-explain-ramp",
    title: "Explain ramp mix in mono-green lands/ramp deck",
    category: "deck_intelligence",
    description: "Deck analysis must inject DECK INTELLIGENCE and discuss ramp.",
    tags: ["deck", "ramp", "analysis"],
    turns: [
      {
        userMessage: "Explain the ramp mix in my deck.",
        expectedPromptBlocks: ["DECK_INTELLIGENCE_BLOCK"],
        expectedOutputTraits: ["ramp", "land"],
      },
    ],
    initialThread: {
      decklist_text: MONO_GREEN_DECKLIST,
      decklist_hash: "",
      commander: "Multani, Yavimaya's Avatar",
    },
  },
  {
    id: "deck-002-identify-plan",
    title: "Identify primary and secondary plan",
    category: "deck_intelligence",
    description: "AI must identify deck plan from intelligence.",
    tags: ["deck", "plan"],
    turns: [
      {
        userMessage: "What's my deck's main plan?",
        expectedPromptBlocks: ["DECK_INTELLIGENCE_BLOCK"],
      },
    ],
    initialThread: {
      decklist_text: MONO_GREEN_DECKLIST,
      decklist_hash: "",
      commander: "Multani, Yavimaya's Avatar",
    },
  },
  {
    id: "deck-003-missing-interaction",
    title: "Identify missing interaction",
    category: "deck_intelligence",
    description: "Deck has low interaction; AI should mention it.",
    tags: ["deck", "interaction"],
    turns: [
      {
        userMessage: "What is my deck missing?",
        expectedPromptBlocks: ["DECK_INTELLIGENCE_BLOCK"],
      },
    ],
    initialThread: {
      decklist_text: MONO_GREEN_DECKLIST,
      decklist_hash: "",
      commander: "Multani, Yavimaya's Avatar",
    },
  },
  {
    id: "deck-004-tension-dorks-vs-land",
    title: "Identify tension between mana dorks and land-matter shell",
    category: "deck_intelligence",
    description: "Deck has land-matter theme; dorks vs land ramp tension.",
    tags: ["deck", "tension"],
    turns: [
      {
        userMessage: "Are there any tensions in my deck's ramp package?",
        expectedPromptBlocks: ["DECK_INTELLIGENCE_BLOCK"],
      },
    ],
    initialThread: {
      decklist_text: MONO_GREEN_DECKLIST,
      decklist_hash: "",
      commander: "Multani, Yavimaya's Avatar",
    },
  },
  {
    id: "deck-005-synergy-chain",
    title: "Explain synergy chain like Scapeshift → Avenger → Craterhoof",
    category: "deck_intelligence",
    description: "AI must explain synergy chain from deck intelligence.",
    tags: ["deck", "synergy"],
    turns: [
      {
        userMessage: "How does the Scapeshift + Avenger + Craterhoof line work in my deck?",
        expectedPromptBlocks: ["DECK_INTELLIGENCE_BLOCK"],
      },
    ],
    initialThread: {
      decklist_text: MONO_GREEN_DECKLIST,
      decklist_hash: "",
      commander: "Multani, Yavimaya's Avatar",
    },
  },

  // === Prompt Contract ===
  {
    id: "contract-001-rules-only",
    title: "Rules question injects RULES FACTS only",
    category: "prompt_contract",
    description: "Pure rules question; no DECK INTELLIGENCE.",
    tags: ["contract", "rules"],
    turns: [
      {
        userMessage: "Is [[Black Lotus]] legal in Commander?",
        expectedPromptBlocks: ["RULES_FACTS_BLOCK"],
        forbiddenPromptBlocks: ["DECK_INTELLIGENCE_BLOCK"],
      },
    ],
  },
  {
    id: "contract-002-deck-only",
    title: "Deck analysis injects DECK INTELLIGENCE only",
    category: "prompt_contract",
    description: "Deck analysis without rules intent; no RULES FACTS.",
    tags: ["contract", "deck"],
    turns: [
      {
        userMessage: "Explain the ramp mix in my deck.",
        expectedPromptBlocks: ["DECK_INTELLIGENCE_BLOCK"],
        forbiddenPromptBlocks: ["RULES_FACTS_BLOCK"],
      },
    ],
    initialThread: {
      decklist_text: MONO_GREEN_DECKLIST,
      decklist_hash: "",
      commander: "Multani, Yavimaya's Avatar",
    },
  },
  {
    id: "contract-003-combined",
    title: "Combined rules + deck injects both",
    category: "prompt_contract",
    description: "Question touches both rules and deck; both blocks.",
    tags: ["contract", "combined"],
    turns: [
      {
        userMessage: "Is my commander [[Multani, Yavimaya's Avatar]] actually legal?",
        expectedPromptBlocks: ["RULES_FACTS_BLOCK", "DECK_INTELLIGENCE_BLOCK"],
      },
    ],
    initialThread: {
      decklist_text: MONO_GREEN_DECKLIST,
      decklist_hash: "",
      commander: "Multani, Yavimaya's Avatar",
    },
  },
  {
    id: "contract-004-confirmed-commander-block",
    title: "Confirmed commander injects CRITICAL commander block",
    category: "prompt_contract",
    description: "After confirmation, commander block must be present.",
    tags: ["contract", "commander"],
    turns: [
      {
        userMessage: "What's my commander's color identity?",
        expectedPromptBlocks: ["DECK_INTELLIGENCE_BLOCK", "COMMANDER_CONFIRMED_BLOCK"],
      },
    ],
    initialThread: {
      decklist_text: MONO_GREEN_DECKLIST,
      decklist_hash: "",
      commander: "Multani, Yavimaya's Avatar",
    },
  },
  {
    id: "contract-005-ask-confirmation",
    title: "Missing commander injects ask-confirmation block",
    category: "prompt_contract",
    description: "Pasted deck with inferred commander; must ask before treating as authoritative.",
    tags: ["contract", "confirmation"],
    turns: [
      {
        userMessage: MONO_GREEN_DECKLIST,
        expectedDeckContext: { shouldAskCommanderConfirmation: true, askReason: "confirm_inference" },
      },
    ],
    priorMessages: [],
  },

  // === Adversarial / Fuzz ===
  {
    id: "adversarial-001a-partial-with-strong-candidate",
    title: "Partial decklist with strong commander candidate → infer + ask confirmation",
    category: "adversarial",
    description: "Partial list with explicit Commander section; AI should infer candidate and ask for confirmation.",
    tags: ["adversarial", "partial", "commander", "inference"],
    turns: [
      {
        userMessage: "Commander\n1 Ken, Burning Brawler\n\nDeck\n4 Lightning Bolt\n4 Counterspell\n4 Lightning Strike\n4 Shock\n20 Island\n20 Mountain",
        expectedDeckContext: { hasDeck: true, shouldAskCommanderConfirmation: true, commanderName: "Ken, Burning Brawler" },
      },
    ],
  },
  {
    id: "adversarial-001b-partial-without-strong-candidate",
    title: "Partial decklist without commander section → ask for commander plainly",
    category: "adversarial",
    description: "Partial list with no Commander section; AI should ask for commander, not guess.",
    tags: ["adversarial", "partial", "commander", "no-inference"],
    turns: [
      {
        userMessage: "4 Lightning Bolt\n4 Counterspell\n4 Lightning Strike\n4 Shock\n4 Negate\n20 Island\n20 Mountain",
        expectedDeckContext: { hasDeck: true },
        forbiddenPromptBlocks: ["COMMANDER_CONFIRMATION_BLOCK"],
      },
    ],
  },
  {
    id: "adversarial-002-same-deck-formatting",
    title: "Same deck in altered formatting preserves effective identity",
    category: "fuzz_formatting",
    description: "Deck in different format (1x vs x1) should hash/match.",
    tags: ["fuzz", "formatting"],
    turns: [
      {
        userMessage: MONO_GREEN_DECKLIST,
        expectedDeckContext: { hasDeck: true },
      },
    ],
  },
  {
    id: "adversarial-003-another-deck-bait",
    title: "For another deck... does not silently replace active thread deck",
    category: "adversarial",
    description: "User says 'for another deck' without override; linked/thread deck should remain.",
    tags: ["adversarial", "bait"],
    turns: [
      {
        userMessage: "For another deck I'm building, is [[Black Lotus]] legal?",
        expectedDeckContext: {},
        hardFailureRules: ["Must not replace active deck when user says 'for another deck' without explicit override"],
      },
    ],
    linkedDeck: {
      deckId: "deck-1",
      commander: "Multani, Yavimaya's Avatar",
      deckText: MONO_GREEN_DECKLIST,
      entries: [],
    },
    initialThread: { deck_id: "deck-1" },
  },
  {
    id: "adversarial-004-messy-commander-header",
    title: "Messy Commander header variant still detects commander",
    category: "fuzz_formatting",
    description: "COMMANDER / Commander Zone / etc. should parse commander.",
    tags: ["fuzz", "formatting", "commander"],
    turns: [
      {
        userMessage: MONO_GREEN_DECKLIST,
        expectedDeckContext: { hasDeck: true, commanderName: "Multani, Yavimaya's Avatar" },
      },
    ],
  },
  {
    id: "adversarial-005-color-identity-trap",
    title: "Color identity trap scenario",
    category: "adversarial",
    description: "Hybrid/mana symbols; AI must not suggest off-color.",
    tags: ["adversarial", "color-identity"],
    turns: [
      {
        userMessage: "Suggest a ramp spell for my deck.",
        expectedPromptBlocks: ["DECK_INTELLIGENCE_BLOCK"],
        forbiddenOutputTraits: ["Boros Signet", "Rakdos Signet"],
      },
    ],
    initialThread: {
      decklist_text: MONO_GREEN_DECKLIST,
      decklist_hash: "",
      commander: "Multani, Yavimaya's Avatar",
    },
  },
];
