# AI Testing System - Quick Reference for LLM Analysis

## System Purpose
Test and iteratively improve an MTG AI assistant's responses through automated testing, validation, failure analysis, and prompt engineering.

## Architecture

**Stack**: Next.js 14 + TypeScript + Supabase (PostgreSQL) + OpenAI API

**Key Components**:
1. Admin UI at `/admin/ai-test` (React/TypeScript)
2. 8 API routes for test execution, validation, analysis, improvement
3. Validation library with keyword checks, LLM fact-check, reference compare
4. Test case storage (JSON + PostgreSQL)
5. Prompt versioning in `app_config` table

## Database Tables

```sql
ai_test_cases (id, name, type, input JSONB, expected_checks JSONB, tags[], source)
ai_test_results (id, test_case_id, response_text, prompt_used JSONB, validation_results JSONB)
app_config (key="prompts", value={version, templates: {system, user}})
```

## Test Case Format

```json
{
  "id": "ramp-mislabel-cultivate",
  "type": "chat|deck_analysis",
  "input": {"userMessage": "...", "format": "Commander", "deckText": "..."},
  "expectedChecks": {
    "shouldContain": ["ramp", "Cultivate"],
    "shouldNotContain": ["creature ramp"],
    "shouldMentionCard": ["Cultivate"],
    "formatSpecific": true
  },
  "tags": ["ramp", "mislabeling"]
}
```

## Validation Pipeline

1. **Keyword Checks**: Regex patterns, card mentions, length, format detection (80% threshold)
2. **LLM Fact-Check**: GPT-4o-mini verifies accuracy (optional, adds cost)
3. **Reference Compare**: Scryfall/EDHREC validation (placeholder, not implemented)

## Auto-Improvement Flow

1. Run batch tests → Get pass/fail results
2. Filter failures → Send to `/analyze-failures`
3. LLM analyzes → Generates structured suggestions:
   ```json
   {
     "priority": "high|medium|low",
     "category": "ramp|color-identity|archetype|format|tone",
     "issue": "What's wrong",
     "suggestedPromptAddition": "Text to add to prompt",
     "rationale": "Why this helps",
     "affectedTests": ["test-id-1", "test-id-2"]
   }
   ```
4. User selects suggestions → Choose append/prepend/replace mode
5. Apply → Updates `app_config.prompts.templates.system`
6. Version tracking → Timestamped versions
7. Re-test → Verify improvements

## Current State

**Working**:
- Test execution (individual + batch)
- Keyword validation
- LLM fact-check (optional)
- Failure analysis with LLM
- Prompt improvement application
- Chat route loads prompts from `app_config`

**Not Working / Issues**:
- Deck analysis route still uses hardcoded prompts (not loading from `app_config`)
- Reference validation not implemented
- No caching (prompts loaded every request)
- Tests return same results after improvements (likely prompt not being used)

## Key Files

- `frontend/app/admin/ai-test/page.tsx` - Main UI (962 lines)
- `frontend/app/api/admin/ai-test/run/route.ts` - Test execution
- `frontend/app/api/admin/ai-test/analyze-failures/route.ts` - LLM failure analysis
- `frontend/app/api/admin/ai-test/apply-improvements/route.ts` - Prompt updates
- `frontend/lib/ai/test-validator.ts` - Validation logic
- `frontend/lib/data/ai_test_cases.json` - 15+ curated test cases
- `frontend/app/api/chat/route.ts` - Chat endpoint (loads prompts from DB)

## Problem to Solve

**Issue**: After applying prompt improvements, running the same tests gives identical results.

**Root Cause**: 
- Chat route was updated to load from `app_config` ✅
- Deck analysis route still uses hardcoded prompts ❌
- Prompt may not be saving correctly
- Prompt may not be loading correctly
- Caching issues

**What Needs Fixing**:
1. Verify prompt is actually saved to `app_config` after applying
2. Verify prompt is loaded in chat route (check logs)
3. Update deck analysis route to load from `app_config`
4. Add prompt version display in UI
5. Add debug endpoint to show current prompt being used

## Improvement Opportunities

1. **Better Validation**: Implement Scryfall/EDHREC API integration
2. **Prompt Comparison**: Side-by-side diff of prompt versions
3. **A/B Testing**: Test multiple prompt versions simultaneously
4. **Regression Detection**: Alert when improvements break previously passing tests
5. **Cost Tracking**: Track API costs per test run
6. **Performance Metrics**: Response time, token usage per test
7. **Test Templates**: Generate test cases from common patterns
8. **CI/CD Integration**: Automated testing on prompt changes

