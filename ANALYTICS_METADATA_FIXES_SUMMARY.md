# Analytics Metadata Fixes - Implementation Summary

**Date:** 2025-01-27  
**Purpose:** Add missing metadata to analytics events for AI feedback loop, rage-quit detection, and deck-analysis correlation.

---

## Files Changed

### Created Files

1. **`frontend/lib/analytics/enrichChatEvent.ts`**
   - Helper function to enrich chat analytics events with shared metadata
   - Truncates messages to 200 chars
   - Normalizes undefined to null
   - Handles thread_id, persona, prompt_version, format, commander_name, user_message, assistant_message, message_id

### Modified Files

2. **`frontend/components/Chat.tsx`**
   - Fixed `chat_feedback` event (line 918-940)
   - Fixed `chat_stream_stop` events (lines 770, 1365, 1392)
   - Fixed `chat_sent` (client) event (line 528)

3. **`frontend/app/api/chat/route.ts`**
   - Fixed `chat_sent` (server) event (line 981)

4. **`frontend/components/DeckSnapshotPanel.tsx`**
   - Fixed `deck_analyzed` event (line 55)

5. **`frontend/app/api/decks/create/route.ts`**
   - Fixed `deck_saved` event (line 145)

6. **`frontend/app/api/decks/update/route.ts`**
   - Fixed `deck_updated` event (line 195)

---

## Events Updated

### 1. `chat_feedback` (HIGH PRIORITY) ✅

**File:** `frontend/components/Chat.tsx:918`

**Fields Added:**
- ✅ `user_message` (truncated to 200 chars) - from messages array
- ✅ `assistant_message` (truncated to 200 chars) - from message being rated
- ✅ `thread_id` - already present, now normalized
- ✅ `format` - from component state
- ❌ `persona` - Not available client-side (server-only)
- ❌ `prompt_version` - Not available client-side (server-only)
- ❌ `message_id` (DB) - Only UI msg_id available

**Status:** ✅ **FIXED** - Added user_message, assistant_message, format

---

### 2. `chat_stream_stop` (HIGH PRIORITY) ✅

**File:** `frontend/components/Chat.tsx:770, 1365, 1392`

**Fields Added:**
- ✅ `thread_id` - from currentThreadId or threadId
- ✅ `assistant_message_preview` (truncated to 200 chars) - from streamingContent
- ✅ `assistant_message_id` - from streamingMsgId
- ✅ `user_message` (when available in closure) - from val
- ✅ `format` - from component state
- ❌ `persona` - Not available client-side (server-only)
- ❌ `prompt_version` - Not available client-side (server-only)

**Status:** ✅ **FIXED** - Added thread_id, assistant_message_preview, assistant_message_id, user_message (when available), format

---

### 3. `chat_sent` (CLIENT) ✅

**File:** `frontend/components/Chat.tsx:528`

**Fields Added:**
- ✅ `user_message` (truncated to 200 chars) - from val
- ✅ `format` - already present, now normalized
- ✅ `source: "client"` - for debugging
- ❌ `commander_name` - Would require fetching from linkedDeckId (not done to avoid extra API call)
- ❌ `persona` - Not available client-side (server-only)
- ❌ `prompt_version` - Not available client-side (server-only)

**Status:** ✅ **FIXED** - Added user_message, source marker

---

### 4. `chat_sent` (SERVER) (MEDIUM PRIORITY) ✅

**File:** `frontend/app/api/chat/route.ts:981`

**Fields Added:**
- ✅ `prompt_version` - from promptVersionId
- ✅ `user_message` (truncated to 200 chars) - from text
- ✅ `assistant_message` (truncated to 200 chars) - from outText
- ✅ `format` - from prefs.format
- ✅ `commander_name` - from inferredContext.commander
- ✅ `persona` - already present as persona_id, now normalized to `persona`

**Status:** ✅ **FIXED** - Added all missing fields

---

### 5. `deck_analyzed` (MEDIUM PRIORITY) ✅

**File:** `frontend/components/DeckSnapshotPanel.tsx:55`

**Fields Added:**
- ✅ `prompt_version` - from API response (json.prompt_version or json.prompt_version_id)
- ❌ `deck_id` - Not available in this component (standalone analysis panel)
- ❌ `commander` - Would need to extract from deckText or pass as prop

**Status:** ✅ **PARTIALLY FIXED** - Added prompt_version. deck_id and commander not available in this context.

---

### 6. `deck_saved` (MEDIUM PRIORITY) ✅

**File:** `frontend/app/api/decks/create/route.ts:145`

**Fields Added:**
- ✅ `format` - from payload.format
- ✅ `commander` - from commander variable (detected from deck)
- ✅ `prompt_version` - from analysis data if present (payload.data.analyze.prompt_version)

**Status:** ✅ **FIXED** - Added format, commander, prompt_version

---

### 7. `deck_updated` (MEDIUM PRIORITY) ✅

**File:** `frontend/app/api/decks/update/route.ts:195`

**Fields Added:**
- ✅ `format` - fetched from database
- ✅ `commander` - fetched from database
- ❌ `prompt_version` - Not available in update route (would need to track from analysis)

**Status:** ✅ **PARTIALLY FIXED** - Added format and commander. prompt_version not available in update context.

---

## Fields Still Not Available (Architectural Limitations)

### Client-Side Events

The following fields are **not available client-side** and would require architectural changes:

1. **`persona`** - Only available server-side in `/api/chat/route.ts`
   - **Impact:** Cannot correlate client-side feedback with persona selection
   - **Workaround:** Server-side `chat_sent` event has persona

2. **`prompt_version`** - Only available server-side in `/api/chat/route.ts`
   - **Impact:** Cannot correlate client-side feedback with prompt version
   - **Workaround:** Server-side `chat_sent` event has prompt_version

3. **`message_id` (DB)** - Created server-side after analytics
   - **Impact:** Client-side events only have UI msg_id, not database ID
   - **Workaround:** Use thread_id + msg_id combination

### Component Limitations

1. **`deck_analyzed`** - Missing `deck_id` and `commander`
   - **Reason:** Component is standalone analysis panel, not linked to a saved deck
   - **Impact:** Cannot correlate analysis with saved deck
   - **Workaround:** Use format + colors + prompt_version for correlation

2. **`deck_updated`** - Missing `prompt_version`
   - **Reason:** Update route doesn't have access to analysis context
   - **Impact:** Cannot correlate updates with prompt version used
   - **Workaround:** Use format + commander for correlation

---

## Property Name Standardization

All analytics properties now use **snake_case** consistently:
- ✅ `thread_id` (not `threadId`)
- ✅ `deck_id` (not `deckId`)
- ✅ `prompt_version` (not `promptVersion`)
- ✅ `commander_name` (not `commanderName`)
- ✅ `user_message` (not `userMessage`)
- ✅ `assistant_message` (not `assistantMessage`)

---

## Testing Recommendations

### Manual Testing

1. **Chat Feedback:**
   - Send a message, get response, click thumbs up/down
   - Check PostHog: should see `user_message`, `assistant_message`, `format`, `thread_id`

2. **Stream Stop:**
   - Start a chat, stop generation mid-stream
   - Check PostHog: should see `assistant_message_preview`, `thread_id`, `format`

3. **Deck Analysis:**
   - Analyze a deck in snapshot panel
   - Check PostHog: should see `prompt_version`

4. **Deck Save:**
   - Save a deck after analysis
   - Check PostHog: should see `format`, `commander`, `prompt_version`

### Verification Checklist

- [ ] `chat_feedback` includes user_message and assistant_message
- [ ] `chat_stream_stop` includes assistant_message_preview
- [ ] `chat_sent` (server) includes prompt_version, persona, format, commander_name
- [ ] `deck_analyzed` includes prompt_version
- [ ] `deck_saved` includes format, commander, prompt_version
- [ ] All properties use snake_case
- [ ] No undefined values (all normalized to null)

---

## Summary

### ✅ Successfully Fixed

- **chat_feedback**: Added user_message, assistant_message, format
- **chat_stream_stop**: Added thread_id, assistant_message_preview, assistant_message_id, user_message, format
- **chat_sent (client)**: Added user_message, source marker
- **chat_sent (server)**: Added prompt_version, user_message, assistant_message, format, commander_name, persona
- **deck_analyzed**: Added prompt_version
- **deck_saved**: Added format, commander, prompt_version
- **deck_updated**: Added format, commander

### ⚠️ Partially Fixed (Architectural Limitations)

- **chat_feedback**: Missing persona, prompt_version (server-only)
- **chat_stream_stop**: Missing persona, prompt_version (server-only)
- **deck_analyzed**: Missing deck_id, commander (not available in component)
- **deck_updated**: Missing prompt_version (not available in update route)

### 📊 Impact

- **AI Feedback Loop**: ✅ **ENABLED** - Can now correlate feedback with messages and format
- **Rage-Quit Detection**: ✅ **ENABLED** - Can see what was being generated when user stopped
- **AI–Deck Correlation**: ✅ **ENABLED** - Can connect deck analysis with saved decks via format, commander, prompt_version

---

**Build Status:** ✅ Passing  
**Next Steps:** Test locally, verify events in PostHog

