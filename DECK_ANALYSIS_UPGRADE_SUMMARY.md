# Deck Analysis Pipeline Upgrade Summary

## Overview
Upgraded the deck_analysis pipeline with three new layers:
1. **Validator Layer** - Self-correcting deck analysis with validation and retry logic
2. **Few-Shot Examples** - Added representative examples to the deck_analysis prompt
3. **JSON Output Mode** - Structured JSON output alongside natural language

## Files Changed

### New Files Created

1. **`frontend/lib/deck/analysis-validator.ts`**
   - Validates deck analysis responses (both JSON and text)
   - Checks for required components: archetype, commander, game plan, problems, synergy chains, recommendations
   - Validates card legality, color identity, and banned status
   - Returns validation errors and warnings

2. **`frontend/lib/deck/analysis-generator.ts`**
   - Generates full deck analysis text with JSON output mode
   - Uses OpenAI API with structured JSON format
   - Extracts both JSON and natural language from response

3. **`frontend/lib/deck/analysis-with-validation.ts`**
   - Wrapper function that combines generation and validation
   - Implements retry logic (up to 2 retries)
   - Feeds validation errors back to AI for correction

4. **`frontend/lib/deck/banned-cards.ts`**
   - Shared utility for banned cards lookup
   - Converts JSON data to lookup maps for all formats

5. **`frontend/lib/ai/openai-client.ts`**
   - Shared OpenAI API client
   - Extracted from route file to avoid duplication

6. **`frontend/db/migrations/add_fewshot_examples_to_deck_analysis.sql`**
   - Migration to add few-shot examples to deck_analysis prompt
   - Includes 6 examples covering: Tokens, Aristocrats, Landfall, Blink, Voltron, Graveyard Recursion

### Modified Files

1. **`frontend/app/api/deck/analyze/route.ts`**
   - Added validated analysis generation step
   - Returns `analysis`, `analysis_json`, `analysis_validation_errors`, and `analysis_validation_warnings` in response
   - Validated analysis runs in parallel with existing suggestion pipeline
   - Does not break existing functionality if validation fails

## Implementation Details

### A) Validator Layer

**Location**: `frontend/lib/deck/analysis-validator.ts`

**What it validates**:
- Clear archetype identification
- Commander name (if provided)
- Deck game plan
- Problems-first analysis
- At least one synergy chain
- At least 3 legal recommendations
- All recommendations respect color identity
- No banned cards
- No generic/pillar-only output
- No hallucinated cards (must exist in Scryfall)
- No contradictory statements

**Retry Logic**:
- Up to 2 retries if validation fails
- Validation errors are fed back to AI as system message
- Final response includes validation errors/warnings even if validation fails

### B) Few-Shot Examples

**Location**: `frontend/db/migrations/add_fewshot_examples_to_deck_analysis.sql`

**Examples Added**:
1. Tokens Archetype (Rhys the Redeemed)
2. Aristocrats Archetype (Korvold)
3. Landfall Archetype (Tatyova)
4. Blink Archetype (Roon)
5. Voltron Archetype (Sram)
6. Graveyard Recursion (Muldrotha)

Each example demonstrates:
- Correct archetype identification
- Clear early identification of deck plan
- Problems-first structure
- Synergy-chain formatting
- Legal, on-plan card recommendations
- Color-identity respect
- No generic "ramp/draw/removal/wincons" fallback

**How to Apply**:
Run the migration SQL file to update the latest deck_analysis prompt version in the database.

### C) JSON Output Mode

**Location**: `frontend/lib/deck/analysis-generator.ts`

**JSON Structure**:
```json
{
  "commander_name": "...",
  "archetype": "...",
  "game_plan": "...",
  "problems": ["problem 1", "problem 2", ...],
  "synergy_chains": ["chain 1", "chain 2", ...],
  "recommendations": [
    {"card_name": "...", "reason": "..."},
    ...
  ]
}
```

**How it works**:
- AI generates response with JSON code block followed by natural language
- JSON is extracted and parsed
- Both JSON and text are returned
- Validator checks JSON structure and content
- If JSON is malformed, retry is triggered

## Integration Points

### Deck Analysis Route (`/api/deck/analyze`)

**Changes**:
- Added validated analysis generation step (runs if `useGPT` is true and system prompt is available)
- Returns validated analysis in response:
  - `analysis`: Full text analysis
  - `analysis_json`: Structured JSON data
  - `analysis_validation_errors`: Array of validation errors (if any)
  - `analysis_validation_warnings`: Array of validation warnings (if any)

**Behavior**:
- Validated analysis runs in parallel with existing suggestion pipeline
- If validation fails, errors are logged but request still succeeds
- Existing suggestion pipeline remains unchanged
- Backward compatible - clients that don't expect validated analysis will still work

### Chat Route

**Current State**:
- Chat route already uses `deck_analysis` prompt when decklist is detected
- Few-shot examples will automatically be included (once migration is run)
- Validation for streaming responses is not yet implemented (would require post-stream validation)

**Future Enhancement**:
- Could add post-stream validation for chat deck analysis
- Would validate after streaming completes
- Would show validation warnings to user if issues found

## Testing

### To Test Validator:
1. Call `/api/deck/analyze` with a decklist
2. Check response for `analysis_validation_errors` and `analysis_validation_warnings`
3. Verify `analysis_json` contains all required fields
4. Verify all recommendations in JSON are legal and on-color

### To Test Few-Shot Examples:
1. Run the migration SQL file
2. Check that deck_analysis prompt includes examples
3. Generate analysis and verify it follows example patterns

### To Test JSON Output:
1. Generate analysis and check for `analysis_json` field
2. Verify JSON structure matches expected format
3. Verify JSON can be parsed and contains valid data

## Error Handling

- If validation fails after all retries, response still includes analysis text with validation errors
- If JSON parsing fails, retry is triggered
- If OpenAI API fails, error is logged but request doesn't fail (suggestions still returned)
- All errors are user-friendly and don't expose internal details

## Confirmation

✅ **Chat-only persona not affected** - Only `deck_analysis` prompt was modified
✅ **All changes only apply to deck_analysis** - No changes to chat prompt or other features
✅ **Existing functionality preserved** - Suggestion pipeline remains unchanged
✅ **Backward compatible** - Old clients will still work (new fields are optional)

## Next Steps

1. **Run Migration**: Execute `add_fewshot_examples_to_deck_analysis.sql` to add examples to prompt
2. **Test**: Verify validated analysis works for various deck types
3. **Monitor**: Check validation error rates and adjust thresholds if needed
4. **Optional**: Add post-stream validation for chat route deck analysis

