# AI Testing & Training System for MTG Assistant - Implementation Summary

## Overview
A comprehensive testing and iterative improvement system for a Magic: The Gathering AI assistant. The system allows systematic testing of AI responses, automated validation, failure analysis, and automatic prompt improvement suggestions.

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ (React/TypeScript)
- **UI**: React components with Tailwind CSS
- **State Management**: React hooks (useState)
- **Admin Route**: `/admin/ai-test` (protected by admin authentication)

### Backend
- **API Routes**: Next.js API routes (`/api/admin/ai-test/*`)
- **Database**: Supabase (PostgreSQL)
- **LLM**: OpenAI API (gpt-4o-mini, gpt-4o)
- **Authentication**: Supabase Auth with admin user ID/email whitelist

### Data Storage
- **JSON Files**: Static test cases in `frontend/lib/data/ai_test_cases.json`
- **Database Tables**: 
  - `ai_test_cases` - Custom test cases
  - `ai_test_results` - Test execution history
  - `app_config` - System prompts (key: "prompts")

## Database Schema

### Table: `ai_test_cases`
```sql
CREATE TABLE ai_test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('chat', 'deck_analysis')),
  input JSONB NOT NULL,
  expected_checks JSONB NOT NULL,
  tags TEXT[] DEFAULT '{}',
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `ai_test_results`
```sql
CREATE TABLE ai_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id UUID REFERENCES ai_test_cases(id),
  response_text TEXT NOT NULL,
  prompt_used JSONB,
  validation_results JSONB,
  manual_review_status TEXT,
  manual_review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `app_config` (existing, used for prompts)
```sql
-- Key: "prompts"
-- Value structure:
{
  "version": "v2025-01-15T10-30-00",
  "templates": {
    "system": "...full system prompt with improvements...",
    "user": ""
  },
  "ab": { "a": true, "b": false }
}
```

## File Structure

### Core Files

#### Frontend UI
- `frontend/app/admin/ai-test/page.tsx` (962 lines)
  - Main admin interface for testing
  - Test case library display
  - Individual test execution
  - Batch test runner
  - Results dashboard with pass/fail summary
  - Auto-improvement suggestions UI
  - Export functionality (JSON/CSV)

#### API Routes
- `frontend/app/api/admin/ai-test/run/route.ts`
  - Executes single test case
  - Calls `/api/chat` or `/api/deck/analyze` based on test type
  - Returns response text, prompt used, validation results

- `frontend/app/api/admin/ai-test/cases/route.ts`
  - GET: Lists all test cases (JSON + DB)
  - POST: Creates/updates test cases in DB

- `frontend/app/api/admin/ai-test/validate/route.ts`
  - Validates AI responses against expected checks
  - Supports keyword checks, LLM fact-check, reference compare

- `frontend/app/api/admin/ai-test/results/route.ts`
  - GET: Fetches test run history
  - POST: Saves test results to DB

- `frontend/app/api/admin/ai-test/analyze-failures/route.ts`
  - Analyzes failed test results
  - Uses LLM to generate prompt improvement suggestions
  - Returns structured suggestions with priority, category, rationale

- `frontend/app/api/admin/ai-test/apply-improvements/route.ts`
  - Applies selected prompt improvements
  - Supports append/prepend/replace modes
  - Updates `app_config.prompts.templates.system`
  - Version tracking with timestamps

- `frontend/app/api/admin/ai-test/generate/route.ts`
  - LLM-powered test case generation from descriptions
  - Returns generated test cases (requires manual review)

- `frontend/app/api/admin/ai-test/scrape/route.ts`
  - Placeholder for web scraping test cases from Reddit/forums

#### Validation Library
- `frontend/lib/ai/test-validator.ts` (358 lines)
  - `validateKeywords()` - Keyword/card mention checks
  - `validateLLMFactCheck()` - LLM-based fact-checking
  - `validateReferenceCompare()` - Placeholder for Scryfall/EDHREC validation
  - `validateResponse()` - Orchestrates all validation methods

#### Test Data
- `frontend/lib/data/ai_test_cases.json`
  - 15+ curated test cases covering:
    - Ramp mislabeling (Cultivate ≠ creature ramp)
    - Color identity violations
    - Fast mana for casual decks
    - Low land count warnings
    - Teaching mode clarity
    - Banned card suggestions
    - Format-specific vocabulary
    - Budget awareness
    - Commander archetype respect
    - Tone calibration

#### Integration Points
- `frontend/app/api/chat/route.ts` (modified)
  - Now loads system prompt from `app_config.prompts.templates.system`
  - Falls back to default if not found
  - Logs prompt version in development mode

- `frontend/app/api/deck/analyze/route.ts` (existing, not modified for prompt loading yet)
  - Deck analysis endpoint
  - Uses data-driven prompts with JSON baselines

## Test Case Structure

```typescript
type TestCase = {
  id: string;
  name: string;
  type: "chat" | "deck_analysis";
  input: {
    userMessage?: string;
    deckText?: string;
    format?: string;
    commander?: string;
    colors?: string[];
    context?: Record<string, any>;
  };
  expectedChecks: {
    shouldContain?: string[];        // Required keywords
    shouldNotContain?: string[];     // Forbidden patterns (supports regex)
    shouldMentionCard?: string[];     // Cards that must appear
    shouldNotMentionCard?: string[];  // Cards that shouldn't appear
    minLength?: number;
    maxLength?: number;
    formatSpecific?: boolean;        // Must mention format
  };
  tags: string[];  // "ramp", "color-identity", "budget", "commander", etc.
  source: "curated" | "llm_generated" | "web_scraped" | "user_submitted";
};
```

## Validation System

### Validation Methods

1. **Keyword Checks** (always runs)
   - Checks `shouldContain` / `shouldNotContain` patterns
   - Card mention detection (handles markdown formatting)
   - Length validation
   - Format-specific keyword detection
   - Score: 0-100 based on pass rate
   - Threshold: 80% to pass

2. **LLM Fact-Check** (optional)
   - Uses GPT-4o-mini to verify factual accuracy
   - Checks card names, rules, format legality
   - Evaluates consistency with MTG best practices
   - Returns structured JSON with issues/strengths

3. **Reference Compare** (placeholder)
   - Intended to check Scryfall for legality
   - Intended to check EDHREC for popularity
   - Not yet implemented

### Validation Result Structure
```typescript
type ValidationResult = {
  passed: boolean;
  score: number;  // 0-100
  checks: Array<{
    type: string;
    passed: boolean;
    message: string;
  }>;
  warnings: string[];
};
```

## Auto-Improvement Workflow

### Process Flow

1. **Run Tests** → Execute batch of test cases
2. **Identify Failures** → Filter to failed tests (score < 80% or empty responses)
3. **Analyze Failures** → Call `/api/admin/ai-test/analyze-failures`
   - LLM analyzes failure patterns
   - Generates structured improvement suggestions
4. **Review Suggestions** → UI displays suggestions with:
   - Priority (high/medium/low)
   - Category (ramp, color-identity, archetype, format, tone, etc.)
   - Issue description
   - Current behavior
   - Suggested prompt addition
   - Rationale
   - Affected tests
5. **Select & Apply** → User selects suggestions, chooses mode (append/prepend/replace)
6. **Update Prompt** → Saves to `app_config.prompts.templates.system`
7. **Version Tracking** → Creates new version with timestamp
8. **Re-test** → Run tests again to verify improvements

### Improvement Suggestion Structure
```typescript
{
  priority: "high" | "medium" | "low",
  category: string,
  issue: string,
  currentBehavior: string,
  suggestedPromptAddition: string,
  rationale: string,
  affectedTests: string[]
}
```

## Key Features

### Test Execution
- **Individual Tests**: Run single test case with full visibility
- **Batch Testing**: Run all tests, see pass/fail summary
- **Prompt Inspector**: View exact system/user prompts sent to LLM
- **Real-time Results**: See validation results immediately

### Test Case Management
- **Dual Source**: Test cases from JSON file + database
- **Search & Filter**: By tags, name, type
- **LLM Generation**: Generate new test cases from descriptions
- **Manual Creation**: Create custom test cases via UI

### Results & Reporting
- **Pass/Fail Summary**: Percentage scores, visual badges
- **Detailed View**: Full response, validation checks, prompt used
- **Export**: JSON and CSV formats
- **History**: Track results over time (stored in DB)

### Prompt Management
- **Version Control**: Timestamped prompt versions
- **Apply Modes**: Append, prepend, or replace improvements
- **Auto-Merge**: Intelligently merges with existing prompt
- **Guardrails**: Always includes base guardrails when saving

## Current Limitations & Known Issues

1. **Deck Analysis Route**: Not yet updated to load prompts from `app_config` (only chat route updated)
2. **Reference Validation**: Scryfall/EDHREC validation not implemented (placeholder only)
3. **Web Scraping**: Test case scraping from Reddit/forums is placeholder
4. **Prompt Loading**: Chat route loads prompts, but deck analysis still uses hardcoded prompts
5. **Caching**: No caching layer - prompts loaded on every request
6. **Batch Size**: No limit on batch test size (could be slow for large test suites)
7. **LLM Fact-Check**: Requires OpenAI API key, adds latency and cost

## Integration with Main AI System

### Data-Driven Prompts
The main AI system uses JSON data files for context:
- `role_baselines.json` - Format-specific baselines (lands, ramp, draw, etc.)
- `color_identity_map.json` - Color pair strengths/weaknesses
- `commander_profiles.json` - Commander-specific archetype data
- `known_bad.json` - Cards to avoid suggesting

These are injected into prompts at runtime, separate from the system prompt stored in `app_config`.

### Prompt Structure
The system prompt in `app_config` contains:
1. Base prompt (identity, formatting rules, tone)
2. Guardrails (format self-tag, commander pillars, budget language, etc.)
3. Auto-applied improvements (from test analysis)

## Usage Workflow

1. **Initial Setup**: Curated test cases loaded from JSON
2. **Run Baseline Tests**: Establish current performance
3. **Identify Failures**: Review failed tests
4. **Auto-Improve**: Generate suggestions, review, apply
5. **Re-test**: Verify improvements
6. **Iterate**: Repeat until desired quality

## Environment Variables

- `OPENAI_API_KEY` - Required for LLM calls
- `ADMIN_USER_IDS` - Comma-separated admin user IDs
- `ADMIN_EMAILS` - Comma-separated admin emails
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key

## Future Enhancements (Not Implemented)

1. Side-by-side prompt version comparison
2. A/B testing framework for prompts
3. Automated regression detection
4. Test case templates for common scenarios
5. Integration with CI/CD for automated testing
6. Performance metrics (response time, token usage)
7. Cost tracking per test run
8. Test case sharing/export between instances

