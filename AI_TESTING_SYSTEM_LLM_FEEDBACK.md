# AI Testing & Improvement System - Technical Overview for LLM Review

## System Architecture

### Core Components

1. **Prompt Versioning System** (`frontend/lib/config/prompts.ts`)
   - Centralized prompt loading via `getPromptVersion(kind, supabase)`
   - Supports `'chat'` and `'deck_analysis'` prompt types
   - Falls back to legacy `app_config.prompts` for migration
   - Returns `{ id, version, system_prompt }` for tracking

2. **Test Case Management** (`frontend/app/api/admin/ai-test/cases/route.ts`)
   - JSON defaults: `frontend/lib/data/ai_test_cases.json`
   - Database storage: `ai_test_cases` table
   - Test types: `'chat'` | `'deck_analysis'`
   - Input structure varies by type:
     - Chat: `{ userMessage, context? }`
     - Deck Analysis: `{ deckText, format, commander, plan?, budget?, constraints? }`
   - Expected checks: `{ shouldContain?, shouldNotContain?, shouldMentionCard?, shouldNotMentionCard?, minLength?, maxLength?, formatSpecific? }`
   - Deck-specific checks: `{ minRampMention?, minDrawMention?, mustFlagLowLands?, shouldNotSuggestCard?, minSynergyScore? }`

3. **Test Execution** (`frontend/app/api/admin/ai-test/run/route.ts`)
   - Single test execution
   - Calls `/api/chat` or `/api/deck/analyze` based on test type
   - Captures `prompt_version_id` from API responses
   - Stores results in `ai_test_results` table
   - Links to `eval_runs` for batch tracking

4. **Batch Testing** (`frontend/app/api/admin/ai-test/batch/route.ts`)
   - Creates `eval_runs` entry with `status='running'`
   - Executes multiple tests sequentially
   - Links each `ai_test_results` to `eval_run_id`
   - Updates `eval_runs` with aggregate stats on completion
   - Returns pass/fail counts and detailed results

5. **Validation System** (`frontend/lib/ai/test-validator.ts`)
   - **Keyword Checks**: Pattern matching against `shouldContain`/`shouldNotContain`
   - **LLM Fact-Check**: Uses GPT-4o-mini as judge, returns structured `JudgeResult`:
     ```typescript
     {
       overall_score: number (0-100),
       factual_score: number,
       legality_score: number,
       synergy_score: number,
       pedagogy_score: number,
       issues: string[],
       improved_answer?: string,
       suggested_prompt_patch?: string
     }
     ```
   - **Reference Compare**: Real fact-checking using:
     - `scryfall_cache` table for color identity verification
     - `banned_cards.json` for format legality
     - `price_cache` for budget consistency (placeholder)
   - **Deck Analysis Validation**: Pillar-aware checks (ramp/draw/interaction mentions)

6. **Auto-Improvement System**
   - **Analysis** (`frontend/app/api/admin/ai-test/analyze-failures/route.ts`):
     - Takes batch test results, filters failures
     - Uses LLM to analyze failure patterns
     - Generates structured suggestions with priority/category
     - Creates `prompt_patches` entries with `status='pending'`
   - **Application** (`frontend/app/api/admin/ai-test/apply-improvements/route.ts`):
     - Accepts `patch_ids[]` and `action` (append/prepend/replace)
     - Fetches pending patches from `prompt_patches` table
     - Merges patches into current system prompt
     - Creates new `prompt_versions` entry
     - Updates `app_config.active_prompt_version_{kind}` to point to new version
     - Marks patches as `status='accepted'`

7. **User Failure Integration**
   - Loads `knowledge_gaps` entries (AI failures logged by users)
   - Loads `feedback` entries with `rating <= 2`
   - UI allows creating test cases from these sources
   - Pre-fills test case input from failure context

## Database Schema

### New Tables

**`prompt_versions`**
```sql
CREATE TABLE prompt_versions (
  id uuid PRIMARY KEY,
  version text NOT NULL,
  kind text CHECK (kind IN ('chat', 'deck_analysis')),
  system_prompt text NOT NULL,
  meta jsonb,
  created_at timestamptz
);
```

**`prompt_patches`**
```sql
CREATE TABLE prompt_patches (
  id uuid PRIMARY KEY,
  source text NOT NULL,
  category text,
  priority text,
  suggested_text text NOT NULL,
  rationale text,
  affected_tests text[],
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz,
  decided_at timestamptz
);
```

**`eval_runs`** (existing, enhanced)
- Links to `ai_test_results` via `eval_run_id`
- Stores batch test metadata: `{ testCaseCount, validationOptions, passedCount, failedCount, passRate, prompt_version }`

### Modified Tables

**`ai_test_results`**
- Added: `prompt_version_id uuid REFERENCES prompt_versions(id)`
- Added: `eval_run_id bigint REFERENCES eval_runs(id)`
- `validation_results` now includes `judge: JudgeResult` for structured LLM scores

## API Routes Modified

### `/api/chat` (`frontend/app/api/chat/route.ts`)
- Loads system prompt via `getPromptVersion('chat', supabase)`
- Falls back to default if no active version
- Logs `prompt_version_id` for tracking
- Returns `prompt_version_id` in response (for test tracking)

### `/api/deck/analyze` (`frontend/app/api/deck/analyze/route.ts`)
- Loads prompts via `getPromptVersion('deck_analysis', supabase)`
- Replaces hardcoded prompts in:
  - `planSuggestionSlots()` - Planning phase
  - `fetchSlotCandidates()` - Card suggestion phase
  - `retrySlotCandidates()` - Retry phase
- Returns `prompt_version` in response

## Data Files

**`frontend/lib/data/banned_cards.json`**
- Structure: `{ "Commander": [...], "Modern": [...], "Pioneer": [...], "Standard": [...] }`
- Used by `validateReferenceCompare()` for format legality checks

**`frontend/lib/data/ai_test_cases.json`**
- Default test cases (JSON format)
- Can be extended via database

## UI Components

**`frontend/app/admin/ai-test/page.tsx`**
- Test case list with filtering/search
- Single test execution
- Batch test execution
- Results display with validation breakdown
- **Eval Runs History**: Shows past batch runs with pass rates
- **Pending Patches**: Lists patches with accept/reject checkboxes
- **User Failure Candidates**: Knowledge gaps and low ratings
- **Auto-Improve Button**: Triggers failure analysis after batch tests
- **Apply Patches**: UI for selecting and applying prompt improvements

## Workflow Example

1. **Initial State**: Active prompt version `v1` in `app_config.active_prompt_version_chat`

2. **Run Tests**: User clicks "Run Batch Tests" with 10 test cases
   - Creates `eval_runs` entry (ID: `run-123`)
   - Executes each test, creates `ai_test_results` linked to `run-123`
   - Results: 7 passed, 3 failed

3. **Analyze Failures**: User clicks "Auto-Improve"
   - System filters 3 failures
   - LLM analyzes patterns: "AI suggests banned cards"
   - Creates 2 `prompt_patches` entries:
     - Patch A: "Add banlist check rule" (high priority)
     - Patch B: "Improve color identity validation" (medium priority)

4. **Review Patches**: User sees patches in UI
   - Checks Patch A
   - Selects action: "append"
   - Clicks "Apply Selected Patches"

5. **Apply Patches**: System:
   - Fetches current prompt from `prompt_versions` (v1)
   - Appends Patch A's `suggested_text`
   - Creates new `prompt_versions` entry (v2)
   - Updates `app_config.active_prompt_version_chat` to v2
   - Marks Patch A as `status='accepted'`

6. **Verify Improvement**: User runs same batch tests
   - New `eval_runs` entry created (ID: `run-124`)
   - Results: 9 passed, 1 failed (improvement!)
   - Can compare `run-123` vs `run-124` in Eval Runs History

## Key Design Decisions

1. **Prompt Versioning**: Separate versions for chat vs deck_analysis allows independent improvement
2. **Patch System**: Review-before-apply prevents bad changes from going live
3. **Structured Judge**: Multi-dimensional scoring (factual, legality, synergy, pedagogy) provides granular feedback
4. **Real Fact-Checking**: Uses actual MTG data (Scryfall cache, banlists) instead of just LLM judgment
5. **Eval Runs**: Batch tracking enables regression testing and A/B comparison
6. **User Failure Integration**: Real problems become test cases automatically

## Potential Issues & Questions for LLM Review

1. **Prompt Merging Logic**: Current "replace" action uses regex to remove old improvements section. Is this robust enough? Should we use more sophisticated diff/merge?

2. **LLM Judge Reliability**: Using GPT-4o-mini to judge GPT-4o responses. Is this circular? Should we have human validation for judge scores?

3. **Test Case Quality**: Default test cases are manually written. Should we generate more via LLM? How do we ensure test cases are comprehensive?

4. **Patch Conflicts**: What if two patches suggest contradictory rules? Current system applies all selected patches. Should we detect conflicts?

5. **Rollback Strategy**: Can rollback by updating `app_config.active_prompt_version_*`, but no UI for this. Should we add rollback UI?

6. **Performance**: Batch tests run sequentially. For 100+ tests, this could be slow. Should we parallelize?

7. **Validation Cost**: LLM fact-check costs money per test. Should we cache judge results? Make it optional?

8. **Deck Analysis Specialization**: `DeckAnalysisExpectedChecks` extends base checks. Is the validation logic complete? Are we checking all pillars correctly?

9. **Color Identity Checking**: Uses `scryfall_cache`. What if cache is stale? Should we have a refresh mechanism?

10. **Banlist Updates**: `banned_cards.json` is static. How do we keep it updated? Should it be in database?

## Metrics & Success Criteria

- **Pass Rate**: Percentage of tests passing (target: >90%)
- **Improvement Rate**: Pass rate increase after applying patches
- **Judge Score Trends**: Are factual/legality scores improving over time?
- **Patch Acceptance Rate**: How many suggested patches are actually applied?
- **Regression Detection**: Do new prompt versions break previously passing tests?

## Next Steps (Not Yet Implemented)

1. **A/B Testing**: Run same tests against multiple prompt versions simultaneously
2. **Automated Regression**: Run tests on every prompt version change
3. **Patch Conflict Detection**: Warn if patches contradict each other
4. **Rollback UI**: Easy way to revert to previous prompt version
5. **Test Case Generation**: LLM-powered test case creation from descriptions
6. **Web Scraping**: Import test cases from Reddit/forums (placeholder exists)
7. **Performance Optimization**: Parallel test execution
8. **Judge Result Caching**: Cache LLM judge results to reduce costs

---

## Questions for LLM Review

1. **Architecture**: Is this design sound? Any missing pieces?

2. **Validation Logic**: Are the validation checks comprehensive? Any edge cases missed?

3. **Prompt Engineering**: Is the patch application logic (append/prepend/replace) sufficient? Should we support more sophisticated merging?

4. **Data Flow**: Is the flow from test → failure → patch → application clear and correct?

5. **Error Handling**: Are we handling failures gracefully? What happens if patch application fails mid-way?

6. **Scalability**: Will this work with 1000+ test cases? 100+ prompt versions?

7. **User Experience**: Is the UI workflow intuitive? Any missing features?

8. **Testing**: How should we test the testing system itself? Meta-testing?

9. **Cost Optimization**: LLM calls for judge + analysis. Can we reduce costs without losing quality?

10. **Best Practices**: Are we following prompt engineering best practices? Any anti-patterns?





