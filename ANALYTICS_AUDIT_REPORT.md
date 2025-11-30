# Analytics Audit Report - AI Improvement Metadata

**Date:** 2025-01-27  
**Purpose:** Audit all analytics events to identify missing metadata needed for AI feedback loop, rage-quit detection, and deck-analysis correlation.

---

## 1. AI Feedback Loop Events

### Event: `chat_feedback`

**File:** `frontend/components/Chat.tsx:922`  
**Type:** Client-side (`capture`)

**Properties sent:**
```typescript
{
  rating: number,           // 1, 0, or -1
  thread_id: string | null,
  msg_id: string
}
```

**Missing fields:**
- ❌ `user_message` (truncated) - Cannot reconstruct what the user asked
- ❌ `assistant_message` (truncated) - Cannot see what the AI responded
- ❌ `persona` - Cannot correlate feedback with persona selection
- ❌ `prompt_version` - Cannot track which prompt version generated the response
- ❌ `format` - Cannot see format context (Commander/Modern/Standard)
- ❌ `commander_name` - Cannot see commander if applicable
- ❌ `message_id` (DB) - Only has UI `msg_id`, not database message ID

**Risk level:** 🔴 **HIGH** - Blocks AI improvement feedback loop

**Available in context:**
- `threadId` is available in component state
- `msgId` is passed to `InlineFeedback` component
- `content` (assistant message) is available in `InlineFeedback` component
- User message would need to be fetched from thread history or passed down
- `persona_id` is available in server-side chat route but not passed to client
- `promptVersionId` is available in server-side chat route but not passed to client
- Format/commander available in component state (`fmt`, `linkedDeckId`)

---

### Event: `chat_stream_stop`

**File:** `frontend/components/Chat.tsx:770, 1365, 1392`  
**Type:** Client-side (`capture`)

**Properties sent:**
```typescript
{
  stopped_by: 'complete' | 'user',
  duration_ms: number,
  tokens_if_known: number
}
```

**Missing fields:**
- ❌ `thread_id` - Cannot correlate with conversation
- ❌ `persona` - Cannot see which persona was used
- ❌ `prompt_version` - Cannot track prompt version
- ❌ `assistant_message_id` - Cannot reference the specific message
- ❌ `assistant_message_preview` - Cannot see what was being generated (for rage-quit detection)
- ❌ `user_message` - Cannot see what question triggered this response

**Risk level:** 🔴 **HIGH** - Blocks rage-quit detection and AI improvement

**Available in context:**
- `threadId` is available in component state
- `streamingContent` contains the partial response (available in closure)
- `streamingMsgId` contains the message ID
- `persona_id` is available in server-side route but not passed to client
- `promptVersionId` is available in server-side route but not passed to client
- User message (`val`) is available in `send()` function closure

---

### Event: `chat_sent` (Client-side)

**File:** `frontend/components/Chat.tsx:528`  
**Type:** Client-side (`capture`)

**Properties sent:**
```typescript
{
  chars: number,
  thread_id: string | null,
  is_decklist: boolean,
  format: string,
  budget: string,
  teaching_mode: boolean
}
```

**Missing fields:**
- ❌ `user_message` (truncated) - Cannot reconstruct exact question
- ❌ `persona` - Not available client-side
- ❌ `prompt_version` - Not available client-side
- ❌ `commander_name` - Not included (though `linkedDeckId` exists in state)
- ❌ `message_id` (DB) - Not created yet at this point

**Risk level:** 🟡 **MEDIUM** - Missing some context but has format/budget

**Available in context:**
- `val` contains the full user message
- `linkedDeckId` is available in component state
- `persona_id` and `promptVersionId` are only available server-side

---

### Event: `chat_sent` (Server-side)

**File:** `frontend/app/api/chat/route.ts:981`  
**Type:** Server-side (`captureServer`)

**Properties sent:**
```typescript
{
  provider: string,        // 'openai' or 'fallback'
  ms: number,              // Duration
  thread_id: string,
  user_id: string,
  persona_id: string
}
```

**Missing fields:**
- ❌ `user_message` (truncated) - Cannot reconstruct question
- ❌ `assistant_message` (truncated) - Cannot see response
- ❌ `prompt_version` - Available but not included (`promptVersionId` exists)
- ❌ `format` - Not included (available in `prefs.format`)
- ❌ `commander_name` - Not included (could be inferred from deck context)
- ❌ `message_id` (DB) - Not included (message is inserted after analytics)

**Risk level:** 🟡 **MEDIUM** - Has persona but missing prompt_version and message content

**Available in context:**
- `text` contains user message
- `outText` contains assistant response
- `promptVersionId` is available (line 564)
- `prefs.format` contains format
- `inferredContext.commander` contains commander if available

---

## 2. Deck-Analysis Correlation Events

### Event: `deck_analyzed`

**File:** `frontend/components/DeckSnapshotPanel.tsx:55`  
**Type:** Client-side (`capture`)

**Properties sent:**
```typescript
{
  format: string,
  plan: string,
  colors: string,           // Comma-separated
  score: number,
  card_count: number
}
```

**Missing fields:**
- ❌ `deck_id` - Cannot correlate with saved deck
- ❌ `commander` - Not included (may be in deckText but not extracted)
- ❌ `prompt_version` - Not included (available in API response: `json?.prompt_version`)
- ❌ `user_message` - Not included (if user provided specific analysis request)

**Risk level:** 🟡 **MEDIUM** - Missing deck_id and prompt_version for correlation

**Available in context:**
- `json?.prompt_version` is available in API response (line 48 in DeckAnalyzerPanel)
- Commander could be extracted from deckText or passed as prop
- Deck ID not available in this component (standalone analysis panel)

**Note:** The API response includes `prompt_version` and `prompt_version_id` (see `frontend/app/api/deck/analyze/route.ts:1345-1346`), but it's not being captured in analytics.

---

### Event: `deck_saved`

**File:** `frontend/app/api/decks/create/route.ts:145`  
**Type:** Server-side (`captureServer`)

**Properties sent:**
```typescript
{
  deck_id: string,
  inserted: number,        // Card count
  user_id: string,
  ms: number
}
```

**Missing fields:**
- ❌ `format` - Not included (available in `data.format`)
- ❌ `commander` - Not included (available in `data.commander`)
- ❌ `prompt_version` - Not included (if deck was created from analysis)
- ❌ `source` - Not included (e.g., 'analysis_panel', 'manual', 'import')

**Risk level:** 🟡 **MEDIUM** - Missing format/commander for correlation

**Available in context:**
- `data.format` contains format
- `data.commander` contains commander
- `data.data?.analyze` contains analysis result (which has `prompt_version`)

---

### Event: `deck_updated`

**File:** `frontend/app/api/decks/update/route.ts:195`  
**Type:** Server-side (`captureServer`)

**Properties sent:**
```typescript
{
  deck_id: string,
  user_id: string,
  fields: string[]         // Array of updated field names
}
```

**Missing fields:**
- ❌ `format` - Not included
- ❌ `commander` - Not included
- ❌ `prompt_version` - Not included (if update was based on AI suggestions)

**Risk level:** 🟡 **MEDIUM** - Missing format/commander for correlation

**Available in context:**
- Deck data is available in `data` variable (from `supabase.from('decks').select('*').eq('id', id).single()`)
- Format and commander are in the database record

---

## 3. Other Related Events

### Event: `ai_suggestion_shown`

**File:** `frontend/app/my-decks/[id]/DeckAnalyzerPanel.tsx:75`  
**Type:** Client-side (`capture`)

**Properties sent:**
```typescript
{
  suggestion_count: number,
  deck_id: string,
  categories: string[],
  prompt_version: string | undefined
}
```

**Status:** ✅ **GOOD** - Includes prompt_version and deck_id

**Missing fields:**
- ❌ `format` - Not included (available as prop)
- ❌ `commander` - Not included (could be fetched from deck)

**Risk level:** 🟢 **LOW** - Minor enhancement opportunity

---

### Event: `ai_suggestion_accepted`

**File:** `frontend/app/my-decks/[id]/DeckAnalyzerPanel.tsx:264, 319, 374`  
**Type:** Client-side (`capture`)

**Properties sent:**
```typescript
{
  suggestion_id: string,
  card: string,
  category: string,
  deck_id: string,
  prompt_version: string | undefined
}
```

**Status:** ✅ **GOOD** - Includes prompt_version and deck_id

**Missing fields:**
- ❌ `format` - Not included
- ❌ `commander` - Not included

**Risk level:** 🟢 **LOW** - Minor enhancement opportunity

---

## 4. General Data Quality Issues

### Undefined/Null Properties

**Issue:** Some events may send `undefined` or `null` values, which PostHog may not handle consistently.

**Examples:**
- `chat_feedback`: `thread_id: threadId ?? null` - Explicitly sets null, which is fine
- `chat_sent` (client): `thread_id: threadId ?? null` - Explicitly sets null, which is fine
- `deck_analyzed`: `score: json?.result?.score || json?.score` - Could be undefined if missing
- `ai_suggestion_shown`: `prompt_version: promptVersion` - Could be undefined

**Recommendation:** Filter out undefined values before sending to PostHog, or use explicit nulls.

---

### Property Name Consistency

**Issue:** Some properties use different naming conventions:
- `thread_id` vs `threadId` (mostly consistent: `thread_id`)
- `deck_id` vs `deckId` (mostly consistent: `deck_id`)
- `prompt_version` vs `promptVersion` (inconsistent: client uses `prompt_version`, some places use `promptVersion`)

**Recommendation:** Standardize on snake_case for all analytics properties.

---

### Stable Identifiers

**Status:** ✅ **GOOD**
- `thread_id` is consistently included where available
- `deck_id` is consistently included where available
- `user_id` is consistently included in server-side events
- `distinct_id` is handled by PostHog automatically

---

## 5. Summary & Recommendations

### Events That MUST Be Updated (HIGH Priority)

1. **`chat_feedback`** (Client)
   - **Why:** Blocks AI feedback loop - cannot correlate feedback with prompts/personas
   - **Add:** `user_message` (truncated to 200 chars), `assistant_message` (truncated to 200 chars), `persona`, `prompt_version`, `format`, `commander_name` (if applicable), `message_id` (DB)

2. **`chat_stream_stop`** (Client)
   - **Why:** Blocks rage-quit detection - cannot see what was being generated when user stopped
   - **Add:** `thread_id`, `persona`, `prompt_version`, `assistant_message_preview` (first 200 chars), `user_message` (truncated), `assistant_message_id`

3. **`chat_sent`** (Server)
   - **Why:** Missing prompt_version and message content for correlation
   - **Add:** `prompt_version`, `user_message` (truncated), `assistant_message` (truncated), `format`, `commander_name` (if applicable)

### Events That Should Be Updated (MEDIUM Priority)

4. **`deck_analyzed`** (Client)
   - **Why:** Missing prompt_version and deck_id for correlation
   - **Add:** `prompt_version` (from API response), `deck_id` (if available), `commander` (if available)

5. **`deck_saved`** (Server)
   - **Why:** Missing format/commander for correlation
   - **Add:** `format`, `commander`, `prompt_version` (if from analysis), `source`

6. **`deck_updated`** (Server)
   - **Why:** Missing format/commander for correlation
   - **Add:** `format`, `commander`, `prompt_version` (if update was AI-driven)

### What We Still Cannot Reconstruct Server-Side

**Rage-quit detection:**
- ✅ Can detect `chat_stream_stop` with `stopped_by: 'user'`
- ❌ Cannot see what was being generated (missing `assistant_message_preview`)
- ❌ Cannot see the user's question (missing `user_message` in `chat_stream_stop`)
- ❌ Cannot correlate with prompt version (missing `prompt_version`)

**AI–deck correlation:**
- ✅ Can connect `deck_analyzed` → `deck_saved` via format/colors (partial)
- ❌ Cannot connect via `prompt_version` (missing in `deck_analyzed`)
- ❌ Cannot connect via `deck_id` (missing in `deck_analyzed`)
- ❌ Cannot connect via `commander` (missing in both events)

**Feedback loop:**
- ✅ Can see rating and thread_id
- ❌ Cannot see what the AI said (missing `assistant_message`)
- ❌ Cannot see what the user asked (missing `user_message`)
- ❌ Cannot correlate with prompt version (missing `prompt_version`)
- ❌ Cannot correlate with persona (missing `persona`)

---

## 6. Implementation Notes

### Data Availability

**Client-side (`Chat.tsx`):**
- ✅ `threadId` - Available in state
- ✅ `val` (user message) - Available in `send()` closure
- ✅ `streamingContent` - Available in closure for `chat_stream_stop`
- ✅ `fmt` (format) - Available in state
- ✅ `linkedDeckId` - Available in state
- ❌ `persona_id` - Only available server-side
- ❌ `promptVersionId` - Only available server-side
- ❌ Database `message_id` - Created server-side after analytics

**Server-side (`/api/chat/route.ts`):**
- ✅ `text` (user message) - Available
- ✅ `outText` (assistant response) - Available
- ✅ `promptVersionId` - Available (line 564)
- ✅ `persona_id` - Available (line 664)
- ✅ `tid` (thread_id) - Available
- ✅ `prefs.format` - Available
- ✅ `inferredContext.commander` - Available if deck is linked

**Server-side (`/api/deck/analyze/route.ts`):**
- ✅ `promptVersionId` - Available (line 1151)
- ✅ `format` - Available (line 1162)
- ✅ `reqCommander` - Available (line 1193)
- ✅ `body.deckId` - Not available (analysis is standalone, not linked to deck)

### Recommended Approach

1. **Pass server-side data to client:**
   - Include `persona_id` and `prompt_version` in API response
   - Client can then include in analytics events

2. **Truncate message content:**
   - Limit `user_message` and `assistant_message` to 200-300 characters
   - Prevents PII issues and keeps events lightweight

3. **Add helper function:**
   - Create `enrichChatAnalytics(props)` that adds common fields
   - Ensures consistency across all chat events

4. **Server-side enrichment:**
   - For server-side events, fetch missing data from database if needed
   - Use async/background enrichment to avoid blocking responses

---

## 7. Next Steps

1. ✅ **Audit complete** - This document identifies all gaps
2. ⏭️ **Implementation** - Create follow-up task to add missing fields
3. ⏭️ **Testing** - Verify events in PostHog after implementation
4. ⏭️ **Documentation** - Update analytics documentation with new fields

---

**End of Audit Report**

