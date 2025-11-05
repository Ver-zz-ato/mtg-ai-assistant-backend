# MTG AI Deck Assistant - Complete Summary

## Overview
An intelligent MTG deck analysis system that uses GPT-5 to provide contextual, format-aware, and budget-conscious deck suggestions. The system automatically infers deck characteristics, filters suggestions through multiple validation layers, and provides co-pilot-style guidance.

---

## Architecture

### Core Components

1. **Inference Engine** (`frontend/lib/deck/inference.ts`)
   - Automatically detects deck format, colors, commander, power level, archetype, manabase, curve, and user intent
   - Tags cards by role (commander, ramp, draw, removal, wincon, engine, protection, lands)
   - Analyzes redundancy and role distribution

2. **GPT Prompt Builder** (`frontend/app/api/deck/analyze/route.ts` - `callGPTForSuggestions`)
   - Builds comprehensive system prompt with all context and rules
   - Calls OpenAI GPT-5 API with structured constraints

3. **Post-Filtering System** (`postFilterSuggestions` function)
   - Validates all GPT suggestions against strict rules
   - Filters off-color, illegal, duplicate, and harmful suggestions
   - Adds unique IDs and review flags

4. **Frontend Integration** (`DeckAnalyzerPanel.tsx`)
   - Displays categorized suggestions with "Add" buttons
   - Tracks user interactions via PostHog analytics
   - Shows warnings for cards that need review

---

## Inference Capabilities

### Automatic Detection

**Format Detection:**
- Detects Commander (100 cards, commander present) vs 60-card formats
- Warns against format-inappropriate cards

**Color Detection:**
- From commander color identity
- From decklist card colors
- User message hints (e.g., "Gruul", "Simic")

**Commander Detection:**
- First card in decklist
- User message mentions
- Explicit `commander` parameter
- Checks if card can be commander (legendary, special rules)

**Power Level Detection:**
- `casual` / `battlecruiser` / `mid` / `high` / `cedh`
- Based on user message keywords and curve analysis

**Archetype Detection:**
- Token/sacrifice decks
- Aristocrats decks
- Identifies protected roles (sac outlets, token producers, death triggers)

**Manabase Analysis:**
- Counts colored pips per color (weighted for double-pips)
- Counts colored sources per color
- Calculates source-to-pip ratios
- Flags if variance > 15% from ideal

**Curve Analysis:**
- Average CMC
- High-end count (6+ CMC)
- Flags low-curve decks (avg ≤ 3)
- Flags tight manabases

**Role Tagging:**
- Each card tagged as: commander, ramp/fixing, draw/advantage, removal/interact, wincon/payoff, engine/enabler, protection/recursion, land
- Tracks role distribution and redundancy

**User Intent Extraction:**
- Parses user goals from message (e.g., "make tokens", "focus on sacrifice")

---

## System Prompt Structure

### 1. Core Identity
- Expert MTG deck builder
- Provides suggestions in 3 categories: must-fix, synergy-upgrades, optional-stylistic

### 2. Context Prioritization
- Prioritize decklist-derived info over general trends
- Don't recommend generic staples if deck already has sufficient coverage

### 3. Format & Power Level Rules
- Format-specific warnings (Commander vs 60-card)
- Power level respect (don't optimize casual decks)
- Legality enforcement (no Unfinity/silver-bordered unless requested)

### 4. Color Identity
- Strict color filtering (only suggest cards in deck's colors)

### 5. Commander Synergy
- Commander oracle text included
- Prioritize cards that advance commander's strategy
- Ramp warnings (don't suggest generic ramp if commander/deck already ramps)

### 6. Archetype Protection
- Protected roles listed (sac outlets, token producers, etc.)
- Don't cut protected cards unless strictly better duplicates exist

### 7. Style Preservation
- Preserve deck's playstyle (control, combo, midrange, tokens)
- Strengthen core strategy, don't change it

### 8. Role Distribution Rules
- Never cut last remaining card in a needed role
- Protect unique engine pieces (1-2 cards)
- Flag redundant cards (5+ similar) as valid cut candidates

### 9. Curve Awareness
- Don't suggest 6-drops in low-curve decks (unless wincons)
- Don't suggest double-pip cards in tight manabases

### 10. Win Condition Awareness
- Don't suggest more overrun/finisher effects if deck already has multiple

### 11. Redundancy Avoidance
- Don't suggest more of the same role (board wipes, mana doublers, draw engines) unless synergy justifies it

### 12. Manabase Analysis
- Only comment if variance > 15%
- Provide specific feedback on which colors need adjustment
- If acceptable, say "manabase is acceptable" instead of generic advice

### 13. User Intent Protection
- Don't contradict user goals
- Enhance consistency of stated goals

### 14. Budget Awareness
- Respect budget setting
- Prefer cheaper equivalents over premium versions
- Avoid expensive staples (Cradle, LED, Mana Crypt) in casual/budget decks

### 15. Card Analysis Accuracy
- Only classify as "draw" if actually draws/loots/rummages/impulses
- Tutors are NOT removal (classify as tutors/utility)

### 16. Output Format
- Balance suggestions across roles (not all from one category)
- Always explain synergy reasoning
- Structure in 3 buckets with clear reasons

### 17. Guidance for MTG User Trust
- Acknowledge existing themes before building on them
- Treat flavorful choices as intentional
- Ask clarifying questions for ambiguous requests
- Use official Oracle/Scryfall data as authority
- Avoid overhyped language ("auto-include", "must run")
- Adjust tone by format (Commander = synergy/fun/politics, 60-card = efficiency/curve)
- Acknowledge and adjust when user corrects suggestions
- Keep responses concise and scannable

### 18. Advanced Co-Pilot Behaviors (14 rules)

1. **Metagame Reference**: Describe trends as tendencies, not absolutes
2. **Encourage Iteration**: Suggest next steps (e.g., "Would you like me to balance the mana curve next?")
3. **Format-Legal Fallback**: Offer legal alternatives for illegal cards
4. **Memory of Previous Analysis**: Reference what was fixed last time
5. **Explain Trade-Offs**: Mention one potential drawback per suggestion
6. **Aesthetic Awareness**: Mention how cards fit deck's theme/flavor
7. **Future-Proofing**: Clarify that unreleased set info can change
8. **Pre-empt Sideboard/Meta Matchups**: Mention what matchups cards help against
9. **Mention Play Patterns**: Describe how cards change actual turns
10. **Tie Recommendations to Deck Goals**: Connect to win condition/philosophy
11. **Never Assume Singleton**: Clarify copy counts for non-Commander formats
12. **Mind the Curve Visually**: Use plain gameplay terms ("struggle on turns 2-3")
13. **Acknowledge Social Dynamics**: Mention table perception in Commander
14. **Encourage Self-Testing**: Suggest goldfishing/simulating opening hands

---

## Post-Filtering Rules

### Validation Checks (in order)

1. **Card Existence**: Verify card exists in Scryfall/cache (mark as `needs_review: true` if not found)
2. **Color Filtering**: 
   - Remove cards with colors outside allowed colors
   - Check mana costs for colored pips
   - Special land color checking (panoramas, fetch lands, basics)
3. **Duplicate Prevention**: Remove cards already in deck (normalized name matching)
4. **Format Legality**:
   - Remove Commander-only cards from non-Commander formats
   - Check format legality (Modern, Pioneer)
5. **Commander-Only Filter**: Filter cards like Sol Ring, Command Tower, Arcane Signet from 60-card formats
6. **Curve Constraints**:
   - Don't suggest 6+ CMC in low-curve decks (unless wincon)
   - Don't suggest double-pip cards in tight manabases
7. **Draw/Filter Verification**: Remove suggestions where reason claims draw/filter but card doesn't actually do it
8. **Ramp Redundancy**: Filter generic ramp if commander provides ramp OR deck has 3+ ramp pieces (unless synergy mentioned)
9. **Board Wipe Harm**: Filter board wipes that harm creature-heavy decks
10. **Budget Filtering**: Filter expensive cards (>$10) in budget decks (unless explicitly mentioned as upgrade)

### Post-Filtering Features

- **Unique IDs**: Each suggestion gets `crypto.randomUUID()`
- **Review Flags**: Cards not found in Scryfall marked with `needs_review: true`
- **Helpful Fallback**: If all suggestions filtered, returns helpful message
- **Logging**: All filtered suggestions logged with reasons

---

## API Endpoint

### `/api/deck/analyze` (POST)

**Request Body:**
```typescript
{
  deckText?: string;           // Decklist as text
  format?: "Commander" | "Modern" | "Pioneer";
  plan?: "Budget" | "Optimized";
  colors?: string[];           // e.g. ["G", "B"]
  currency?: "USD" | "EUR" | "GBP";
  useScryfall?: boolean;       // Default: true (enables inference + GPT)
  commander?: string;          // Optional commander name
  userMessage?: string;        // User's question/request
  useGPT?: boolean;            // Default: true when useScryfall is true
}
```

**Response:**
```typescript
{
  score: number;               // 0-100 deck score
  note: string;                // Quick summary
  bands: {                     // Category scores (0-1)
    curve: number;
    ramp: number;
    draw: number;
    removal: number;
    mana: number;
  };
  curveBuckets: number[];     // [<=1, 2, 3, 4, >=5] CMC counts
  counts: {                    // Raw category counts
    lands: number;
    ramp: number;
    draw: number;
    removal: number;
  };
  whatsGood: string[];         // Positive feedback
  quickFixes: string[];        // Quick improvement suggestions
  illegalByCI: number;         // Count of color-identity illegal cards
  illegalExamples: string[];   // Examples of illegal cards
  bannedCount: number;         // Count of banned cards
  bannedExamples: string[];     // Examples of banned cards
  tokenNeeds: string[];        // Detected token types
  metaHints: Array<{           // Metagame inclusion data
    card: string;
    inclusion_rate: string;
    commanders: string[];
  }>;
  combosPresent: Array<{        // Detected combos
    name: string;
    pieces: string[];
  }>;
  combosMissing: Array<{        // Combos missing one piece
    name: string;
    have: string[];
    missing: string[];
    suggest: string;
  }>;
  suggestions: Array<{          // GPT-filtered suggestions
    card: string;
    reason: string;
    category?: "must-fix" | "synergy-upgrade" | "optional";
    id?: string;                // Unique ID for tracking
    needs_review?: boolean;     // Flag if card not found in Scryfall
  }>;
}
```

---

## Frontend Features

### DeckAnalyzerPanel.tsx

**Display:**
- Categories suggestions into: Must-Fix, Synergy Upgrades, Optional/Stylistic
- Shows warning badge (⚠️) for suggestions with `needs_review: true`
- "Add" button for each suggestion

**Analytics (PostHog):**
- `ai_suggestion_shown`: When suggestions appear (includes `suggestion_count`, `deck_id`, `categories`)
- `ai_suggestion_accepted`: When user clicks "Add" (includes `suggestion_id`, `card`, `category`, `deck_id`)

**Error Handling:**
- All PostHog calls wrapped in try/catch
- Graceful degradation if PostHog unavailable

---

## Helper Functions

### `fetchCard(name: string)`
- Fetches card from Scryfall API
- Caches results in-memory
- Returns `SfCard | null`

### `checkIfCommander(cardName: string)`
- Checks if card can be commander
- Returns `boolean`

### `normalizeCardName(name: string)`
- Lowercases, trims, removes punctuation
- Used for duplicate detection

### `checkLandColors(card, allowedColors)`
- Verifies land produces only allowed colors
- Handles panoramas, fetch lands, basics
- Returns `boolean`

### `isRealDrawOrFilter(card)`
- Checks oracle text for actual draw/filter effects
- Returns `boolean`

### `isGenericRamp(cardName)`
- Checks if card is generic ramp (Cultivate, Kodama's Reach, Arcane Signet, etc.)
- Returns `boolean`

### `isHarmfulBoardWipe(card, context)`
- Detects board wipes that harm creature-heavy decks
- Returns `boolean`

---

## Key Features Summary

✅ **Automatic Format Detection** - Infers Commander vs 60-card formats  
✅ **Color-Aware Suggestions** - Only suggests cards in deck's colors  
✅ **Commander Synergy** - Prioritizes cards that advance commander's strategy  
✅ **Archetype Protection** - Protects engine cards in token/sacrifice decks  
✅ **Role-Based Analysis** - Tags all cards by function, prevents cutting last of a role  
✅ **Redundancy Awareness** - Flags redundant cards as valid cuts, protects unique pieces  
✅ **Manabase Analysis** - Pip-weighted analysis with variance tolerance  
✅ **Budget Filtering** - Respects budget constraints, filters expensive cards  
✅ **Duplicate Prevention** - Never suggests cards already in deck  
✅ **Format Legality** - Filters Commander-only cards from 60-card formats  
✅ **Curve Awareness** - Adapts suggestions to deck's curve  
✅ **User Intent Protection** - Doesn't contradict stated goals  
✅ **Post-Filtering** - Multiple validation layers ensure quality  
✅ **Analytics Tracking** - PostHog integration for user feedback  
✅ **Review Flags** - Marks potentially invalid suggestions  
✅ **Co-Pilot Behaviors** - 14 advanced rules for expert-like guidance  
✅ **Play Pattern Focus** - Describes how cards change actual gameplay  
✅ **Meta Matchup Awareness** - Mentions what matchups cards help against  
✅ **Social Dynamics** - Acknowledges Commander politics  
✅ **Self-Testing Encouragement** - Promotes goldfishing/simulation  

---

## Technical Stack

- **Backend**: Next.js API routes (TypeScript)
- **AI Model**: OpenAI GPT-5
- **Card Data**: Scryfall API
- **Caching**: In-memory cache for Scryfall lookups
- **Database**: Supabase (for price cache)
- **Analytics**: PostHog
- **Inference**: Custom inference engine in `frontend/lib/deck/inference.ts`

---

## Error Handling

- All GPT calls wrapped in try/catch (graceful degradation)
- Post-filtering continues even if individual cards fail
- Missing cards marked for review rather than dropped
- Empty suggestion list returns helpful message
- All PostHog calls wrapped in try/catch

---

## Performance Considerations

- Scryfall lookups cached in-memory
- Batch fetching of cards (up to 160 unique cards)
- Lightweight inference for streaming contexts (50 cards)
- Async/await for non-blocking operations
- Post-filtering runs after GPT call (doesn't block response)

---

## Evaluation Mode

The system tracks when it cannot provide suggestions to identify improvement areas:

**When suggestions are exhausted:**
- If post-filtering removes all GPT suggestions (`filtered.length === 0 && suggestions.length > 0`)
- The system logs `ai_suggestion_exhausted` with context:
  - `format`: Deck format (Commander, Modern, Pioneer)
  - `colors`: Deck colors (comma-separated)
  - `deck_size`: Total card count
  - `archetype`: Detected archetype (if any)
  - `power_level`: Detected power level
  - `raw_suggestions_count`: Number of suggestions before filtering

This helps identify which archetypes or deck types the model struggles with, enabling targeted prompt improvements.

**Implementation:** Logged via `console.log` in `postFilterSuggestions` function. Server-side PostHog integration can be added later if needed.

---

## Known Edge Cases

The system handles most deck types well, but these edge cases require special attention:

- **4-5 color commanders with greedy mana**: Decks with many colors may have complex manabase requirements that the AI struggles to optimize
- **Token decks that look like "too many 3-drops"**: Token-heavy decks may appear inefficient but are actually well-tuned for their strategy
- **Reanimator that looks like "too many 7-drops"**: Reanimator decks intentionally run high-CMC creatures; the AI may flag these incorrectly
- **Partner commanders (needs both texts)**: Partner commanders require both commander texts to be analyzed together for proper synergy detection
- **MDFCs / Battles / Modal cards naming**: Modal double-faced cards and battles may have naming inconsistencies that affect detection
- **"Card not in Scryfall yet" previews**: Cards from unreleased sets won't be in Scryfall and will be marked as `needs_review: true`

When modifying inference logic, ensure these edge cases are not regressed.

---

## Prompt Versioning

The system prompt is versioned to track changes and enable debugging:

**Current Version**: `deck-ai-v4`

**Version History:**
- **v1**: Base inference (format, colors, commander detection)
- **v2**: Added legality checking and budget filtering
- **v3**: Added redundancy awareness and tutor classification fixes
- **v4**: Added co-pilot behaviors and meta humility (current)

The version constant is defined at the top of `frontend/app/api/deck/analyze/route.ts`. When users report issues with suggestions, check the prompt version to understand what rules were active.

---

## Future Enhancements (Already Prompted)

- Metagame data integration (EDHRec sync)
- True conversation memory (not just context reference)
- Sideboard suggestions
- Playtest simulation integration
- Advanced combo detection
- Price trend analysis

