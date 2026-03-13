# ManaTap Intelligence Modules Design Audit

**Date:** 2025-03  
**Purpose:** Design two deterministic intelligence modules before implementation. Evidence-based from the actual repo.

---

## 1. Current Relevant Architecture

### 1.1 File Roles

| File | Role |
|------|------|
| [lib/chat/active-deck-context.ts](frontend/lib/chat/active-deck-context.ts) | Deck/commander resolution; precedence: linked > current_paste > thread_slot > guest_ephemeral > history_fallback. Resolves `commanderName`, `commanderStatus`, `askReason`. |
| [lib/deck/deck-enrichment.ts](frontend/lib/deck/deck-enrichment.ts) | `enrichDeck(entries)` fetches from scryfall_cache; `isCommanderEligible(type_line, oracle_text)` — legendary creature, oracle "can be your commander", planeswalker with text. Uses `getEnrichmentForNames`. |
| [lib/deck/deck-facts.ts](frontend/lib/deck/deck-facts.ts) | `buildDeckFacts(taggedCards)`: role_counts, archetype_candidates, engine_candidates, win_pattern_candidates, off_color_cards, banned_cards, interaction_buckets, curve_profile, uncertainty_flags. |
| [lib/deck/synergy-diagnostics.ts](frontend/lib/deck/synergy-diagnostics.ts) | `buildSynergyDiagnostics(taggedCards, commander, deckFacts)`: core/support/peripheral by centrality, primary_engine/payoff cards, top_synergy_clusters, missing_support, tension_flags, off_plan_candidates. |
| [lib/deck/intelligence-formatter.ts](frontend/lib/deck/intelligence-formatter.ts) | `formatForLLM(deckFacts, synergyDiagnostics)`: prose bullets for system prompt. |
| [lib/chat/validateRecommendations.ts](frontend/lib/chat/validateRecommendations.ts) | Post-output: ADD already-in-deck, CUT not-in-deck, invented_card, off_color, illegal_format, over_copy_limit. Fetches commander color via `fetchCommanderColorIdentity` from scryfall. |
| [lib/chat/validateAddSuggestions.ts](frontend/lib/chat/validateAddSuggestions.ts) | `validateAddSuggestions`: COMMANDER_COLOR_MAP fallback (~10 commanders); `getDetailsForNamesCached` for color check. |
| [lib/server/scryfallCache.ts](frontend/lib/server/scryfallCache.ts) | `getEnrichmentForNames`, `getDetailsForNamesCached`: type_line, oracle_text, color_identity, legalities, cmc, mana_cost. |
| [lib/deck/antiSynergy.ts](frontend/lib/deck/antiSynergy.ts) | `detectAntiSynergies(cardNames, commander)`: graveyard hate vs reanimator, ETB hate vs ETB payoffs, mana stax vs greedy manabase. Used in analysis-validator, **not** in chat stream. |

### 1.2 Prompt Assembly

[app/api/chat/stream/route.ts](frontend/app/api/chat/stream/route.ts) lines ~589–601: When `v2Summary.deck_facts` and `v2Summary.synergy_diagnostics` exist, calls `formatForLLM` and appends to system prompt. No separate rules block; no explicit deck plan block.

---

## 2. Existing Rules / Legality Capabilities

### 2.1 What the App Computes Today

| Capability | Where | How |
|------------|-------|-----|
| Commander eligibility | deck-enrichment.ts | `isCommanderEligible`: legendary creature, oracle "can be your commander", planeswalker with text |
| Color identity | scryfall_cache, deck_facts | From Scryfall; aggregated for deck from commander + cards |
| Format legality (Commander ban list) | deck_facts, mtgValidators | `legalities.commander`; `isLegalForFormat` |
| Off-color detection | deck_facts, validateRecommendations | Compare card color_identity vs deck/commander; strip ADD suggestions |
| Already-in-deck | validateRecommendations | Set of deck card names; strip ADD blocks |
| Invented cards | validateRecommendations | ADD card not in scryfall cache → strip |

### 2.2 What Is Left to Model Inference

- Direct card rules explanation ("what does trample do")
- Commander legality Q&A ("can Grist be a commander?")
- Edge-case legality (Partner, Background, Doctor's companion — logic exists in cursor rule but not fully in code)
- "Why is this illegal?" explanations
- Card text interpretation and rules interactions
- Oracle summary for rules questions (model uses training, not injected text)

---

## 3. Existing Deck Plan / Synergy Capabilities

### 3.1 What Exists Today

| Capability | Source | Notes |
|------------|--------|-------|
| Archetype candidates | deck_facts | aristocrats, tokens, graveyard, spellslinger, reanimator, ramp_midrange, combo; scored by tag overlap |
| Engine candidates | deck_facts | sacrifice, tokens, recursion, blink, storm |
| Win pattern candidates | deck_facts | combat, drain, combo, mill |
| Role counts | deck_facts | ramp, draw, interaction, etc. from tagCards |
| Core/support/peripheral | synergy_diagnostics | Centrality-based buckets |
| Primary engine/payoff cards | synergy_diagnostics | By tag |
| Top synergy clusters | synergy_diagnostics | Tag-based clusters (3+ cards) |
| Missing support | synergy_diagnostics | "Aristocrats payoffs but few sac outlets" style |
| Tension flags | synergy_diagnostics | "High curve with limited ramp", "Control + battlecruiser curve" |
| Anti-synergies | antiSynergy | Graveyard hate vs reanimator, ETB hate vs blink; **not** in chat pipeline |

### 3.2 What Is Missing

- Explicit primary plan with confidence
- Secondary plan
- Enabler → payoff mapping
- Named synergy chains ("card A enables B, which amplifies C")
- Missing role detection beyond current 3 patterns
- Anti-synergy in chat (antiSynergy not wired)
- Win route labels (combat, go-wide, engine, combo)
- Plan confidence scoring

---

## 4. Gap Analysis

| Gap Type | Description |
|----------|-------------|
| **Rules grounding** | No Oracle injection for rules Q&A; model knowledge only |
| **Legality** | Commander eligibility logic not exposed for "can X be commander" questions; Partner/Background text not fully checked in code |
| **Deck understanding** | Plan is implicit in archetype_candidates; no structured "this deck does X" summary |
| **Explanation-layer** | Model explains without authoritative facts; prone to hallucinate on edge cases |

---

## 5. Proposed Module Boundaries

### Module A: Deterministic MTG Rules / Legality Engine

| Aspect | Proposal |
|--------|----------|
| **Inputs** | Card name(s), optional commander name |
| **Outputs** | CardRulesFact, CommanderEligibilityFact, DeckLegalityFact, RulesFactBundle |
| **File** | `frontend/lib/deck/rules-facts.ts` |
| **Dependencies** | getDetailsForNamesCached, getEnrichmentForNames; isCommanderEligible from deck-enrichment |
| **Cache** | Per-request via scryfall; no new persistence |
| **Prompt block** | "Rules Facts (authoritative)" when rules/legality Q detected |

### Module B: Deterministic Deck Plan / Synergy Graph Engine

| Aspect | Proposal |
|--------|----------|
| **Inputs** | deck_facts, synergy_diagnostics, tagged cards (or deck text → enrichment path) |
| **Outputs** | DeckPlanProfile: primary_plan, secondary_plan, role_clusters, synergy_chains, tension_signals, missing_roles, win_routes, confidence |
| **File** | `frontend/lib/deck/deck-plan-profile.ts` |
| **Dependencies** | deck-facts, synergy-diagnostics, antiSynergy |
| **Cache** | Same as v2 (deck_context_summary); could add deck_plan_json column later |
| **Prompt block** | "Deck Plan Profile (authoritative)" for full-tier deck analysis |

---

## 6. Output Schema Proposals

### Module A

```typescript
type CardRulesFact = {
  cardName: string;
  typeLine: string | null;
  commanderEligible: boolean;
  commanderEligibleReason: string | null;  // "legendary_creature" | "oracle_text" | null
  colorIdentity: string[];
  legalInCommander: boolean | null;        // null if unknown
  oracleSummary: string;                   // Short, commander-relevant
};

type CommanderEligibilityFact = {
  eligible: boolean;
  reason: string;
};

type RulesFactBundle = {
  commander?: CardRulesFact | null;
  cards: CardRulesFact[];
  deckColorIdentity: string[];
};
```

### Module B

```typescript
type RoleCluster = {
  role: "setup" | "enablers" | "payoffs" | "interaction" | "protection" | "card_flow" | "finishers" | "glue";
  cardNames: string[];
  count: number;
};

type SynergyChain = {
  description: string;   // "Card A enables B, which amplifies C"
  cards: string[];
  confidence: number;
};

type TensionSignal = {
  description: string;
  category: string;
  confidence: number;
};

type MissingRoleSignal = {
  role: string;
  description: string;
  severity: "high" | "medium" | "low";
};

type WinRoute = {
  type: "combat" | "go_wide" | "engine" | "combo" | "drain" | "unknown";
  description: string;
  confidence: number;
};

type DeckPlanProfile = {
  primaryPlan: { name: string; confidence: number };
  secondaryPlan: { name: string; confidence: number } | null;
  roleClusters: RoleCluster[];
  synergyChains: SynergyChain[];
  tensionSignals: TensionSignal[];
  missingRoles: MissingRoleSignal[];
  winRoutes: WinRoute[];
  overallConfidence: number;
};
```

---

## 7. Recommended Implementation Order

1. **Module A (rules-facts.ts)** — Standalone; no pipeline changes to test.
2. **Module B (deck-plan-profile.ts)** — Consumes deck_facts + synergy_diagnostics.
3. **Prompt integration** — Add Rules Facts block (rules Q); add Deck Plan block (full tier).
4. **Unit tests** — For both modules.

---

## 8. Risks / Edge Cases

| Risk | Mitigation |
|------|------------|
| Partner / Background / Doctor's companion | Extend isCommanderEligible to check oracle for these strings |
| MDFCs / split cards | Use front-face for commander check; deck-enrichment already resolves "//" to first part |
| Proxy / custom | No official data; return "unknown" and instruct model to defer |
| Mixed pasted formats | Deck may have 60 or 100 cards; role counts still valid |
| Cache miss | Return partial facts; set legalInCommander null, commanderEligible false when no type_line |
| Scryfall rate limits | Reuse existing cache; batch where possible |

---

## 9. V1 vs V2 vs V3

### V1 Must-Have

- Commander eligibility (legendary creature + oracle override)
- Color identity from Scryfall
- Commander format legality (banned check)
- Short oracle summary for card
- Primary plan from archetype_candidates
- Role clusters from tags
- 2–3 synergy chains
- Tension signals (existing + antiSynergy)
- Missing role signals
- Win routes from win_pattern_candidates

### V2 Smarter

- Partner/Background/Doctor's companion in code
- "Why off-color" explanation text
- Confidence-weighted plan ranking
- More synergy chain patterns

### V3 Stretch

- Persist deck_plan in DB
- Rules Q routing to static FAQ expansion
- Combo chain detection

---

## 10. V1 Implementation Summary (Completed)

### Implemented Scope

| Component | Location | Status |
|-----------|----------|--------|
| Module A: Rules Facts | `lib/deck/rules-facts.ts` | Done |
| Module B: Deck Plan Profile | `lib/deck/deck-plan-profile.ts` | Done |
| Prompt integration | `app/api/chat/stream/route.ts` | Done |
| Unit tests | `tests/unit/rules-facts.test.ts`, `deck-plan-profile.test.ts` | Done |
| Format formatters | `lib/deck/intelligence-formatter.ts` | Done |

### Module A Delivered

- `getCardRulesFact`, `getCommanderEligibilityFact`, `isLegalInCommander`, `getCommanderColorIdentity`
- `getRulesFactBundle`, `getRulesFactsForChat`
- `detectRulesLegalityIntent`, `extractCardNamesFromMessage`
- Rules Facts block injected when rules/legality intent detected (commander or card context)

### Module B Delivered

- `buildDeckPlanProfile` with optional rampCards, drawCards, removalCards from DeckContextSummary
- Primary/secondary plan, role clusters, synergy chains, tension signals, missing roles, win routes
- Deck Plan Profile block injected with Deck Intelligence for full-tier deck analysis

### Limitations

- Rules Facts: getDetailsForNamesCached requires request scope (cookies); integration tests skipped in unit context
- Deck Plan Profile: role clusters use top_synergy_clusters as fallback when options not provided
- Partner/Background/Doctor's companion: logic in deck-enrichment; Rules Facts uses isCommanderEligible

### Suggested Next Steps

1. V2: Expand rules intent patterns; add "why off-color" prose generation
2. V2: Persist deck_plan_json in deck_context_summary for faster full-tier responses
3. Add integration tests for Rules Facts (with mocked Scryfall or in E2E)
