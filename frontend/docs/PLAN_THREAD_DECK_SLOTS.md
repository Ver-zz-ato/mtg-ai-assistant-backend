# Plan: Thread-Level Commander & Decklist Slots

**Purpose:** Fix AI chat issues where (1) the AI re-asks for decklist/format/goals after commander confirmation, and (2) user messages sometimes don't appear in the main chat. Introduce persistent thread-level commander and decklist slots to avoid re-extracting from history and to stabilize context.

**Backup branch:** `backup-pre-thread-deck-slots` (already created and pushed from main)

---

## 1. Problem Summary

| Issue | Description |
|-------|-------------|
| **Commander confirmation not honored** | After user confirms ("yes", "yes!"), the AI still says "To help you best I need your decklist…" / "paste your decklist" |
| **User message visibility** | Sometimes the user's message doesn't appear in the main chat UI |
| **No persistent deck context** | Commander and decklist are re-extracted from `chat_messages` history each request; no single source of truth per thread |

---

## 2. Clarifying Questions (Resolved for Plan)

### Q1: Guests
Guests have no `threadId`; thread slots require persistence.

**Decision:** Skip slots for guests. Keep client-only `messages` for multi-turn context. Slots apply only when `tid && !isGuest`.

### Q2: Overwrite behavior
When the user pastes a new decklist in the same thread, should we replace stored decklist and clear commander?

**Decision:** Replace stored decklist and clear commander; treat as "new deck" and re-confirm commander.

### Q3: Linked deck vs pasted deck
If a thread has `deck_id` (linked deck) and the user later pastes a list, which wins?

**Decision:** Linked deck (`deck_id`) is primary. Thread slots (`commander`, `decklist_text`) apply only for **pasted** context. If `deck_id` exists and user pastes, we do not overwrite `deck_id`; we could optionally update slots for analysis context, but the canonical deck remains the linked one. For simplicity: **if `deck_id` is set, use linked deck; slots are for paste-only threads.**

### Q4: UI for stored context
Show "Commander: X" and "Deck: N cards" in thread header?

**Decision:** Phase 1 = backend only. UI can be added later if desired.

### Q5: Message visibility bug
Include fix in this plan or separate?

**Decision:** Include in this plan as a targeted fix (see Section 6).

---

## 3. Architecture Overview

### 3.1 Current Flow (Simplified)

```
Chat.tsx
  → setMessages(optimistic user message)
  → await fetch('/api/chat/messages', { message: { role: 'user', content } })   // saves user msg
  → postMessageStream({ text, threadId, messages, context, prefs })
  → /api/chat/stream
      → inserts user message AGAIN (duplicate!)
      → fetches streamThreadHistory from chat_messages
      → extracts last decklist from history
      → commander confirmation uses historyForConfirm
      → builds prompt, streams response
  → onDone: saves assistant message via /api/chat/messages
```

**Problems:**
- Duplicate user message insert (Chat + stream route)
- Commander/decklist re-extracted from history each time; no persistence
- Optimistic UI for user message can be overwritten by race conditions (thread switch, message reload, Strict Mode)

### 3.2 Target Flow (with Slots)

```
Chat.tsx
  → setMessages(optimistic user message)
  → await fetch('/api/chat/messages', …)  // OR rely on stream route only (remove duplicate)
  → postMessageStream(…)
  → /api/chat/stream
      → insert user message (single source; remove duplicate from Chat if we choose)
      → load thread: deck_id, commander, decklist_text, summary
      → if text is decklist: update decklist_text, clear commander
      → if commander confirmed: update commander
      → use slots + linked deck for prompt (not re-scan history for deck)
      → build prompt with CRITICAL block when commander confirmed
      → stream response
```

---

## 4. Database Migration

**File:** `frontend/db/migrations/XXX_add_thread_commander_decklist.sql`

```sql
-- Thread-level commander and decklist for paste-based conversations
ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS commander TEXT,
  ADD COLUMN IF NOT EXISTS decklist_text TEXT;

COMMENT ON COLUMN chat_threads.commander IS 'Confirmed commander name for paste-based deck; null when not yet confirmed or when deck_id is primary.';
COMMENT ON COLUMN chat_threads.decklist_text IS 'Most recent pasted decklist text; used when deck_id is null. Cleared/replaced when user pastes new list.';
```

**When to run:** Before deploying stream route changes. Migration is additive; safe to run on existing DB.

---

## 5. Stream Route Changes

**File:** `frontend/app/api/chat/stream/route.ts`

### 5.1 Load Thread Slots

After resolving `tid` and before deck context logic:

- Select: `deck_id`, `commander`, `decklist_text`, `summary` from `chat_threads` where `id = tid`.
- Use `commander` and `decklist_text` only when `!deckIdLinked` (paste-based context).

### 5.2 Update Slots

| Trigger | Action |
|---------|--------|
| `isDecklist(text)` and no linked deck | `UPDATE chat_threads SET decklist_text = text, commander = NULL WHERE id = tid` |
| Commander confirmed (existing `looksLikeConfirmation` + `askedCommander`) | `UPDATE chat_threads SET commander = <extracted_name> WHERE id = tid` |
| User corrects: "no, it's Y" | `UPDATE chat_threads SET commander = Y WHERE id = tid` |

### 5.3 Use Slots in Prompt

- When `decklist_text` is set: use it (or its parsed form) for deck context instead of scanning `streamThreadHistory` for last decklist.
- When `commander` is set: inject a **CRITICAL** block:
  - "COMMANDER CONFIRMED: {commander}. Decklist is known. Do NOT ask for decklist, format, or improvement goals."
  - Include anti-pattern: "NEVER say: 'To help you best I need', 'paste your decklist', 'share your decklist'."

### 5.4 Reduce Redundant History Scanning

- Prefer `decklist_text` / `commander` from thread when available.
- Fall back to scanning `streamThreadHistory` / `clientConversation` only when slots are empty (e.g. first message, or guest).

---

## 6. User Message Visibility Fix

**Root cause analysis:**
- Optimistic update in `Chat.tsx` (setMessages) can be overwritten if:
  1. **Duplicate insertion:** Both `fetch('/api/chat/messages')` and stream route insert the user message → potential duplicate in DB; listMessages reload could show inconsistent ordering.
  2. **Race:** Thread creation + setThreadId + setHistKey causes message reload; if reload happens before optimistic update is committed, user message may disappear.
  3. **Closure / Strict Mode:** `userMessageAdded` is a closure variable; in Strict Mode, setState runs twice. First run adds message and sets `userMessageAdded = true`; second run might see stale `prev` and skip add—unlikely to remove message, but could cause odd ordering.

**Fix approach:**
1. **Remove duplicate user message insert:** Either (a) Chat stops calling `fetch('/api/chat/messages')` for user messages and relies on the stream route to insert, or (b) stream route stops inserting and relies on Chat. Recommended: **(a) Rely on stream route only** for user insert, to keep all persistence in one place and avoid race between two writers.
2. **Ensure optimistic update is stable:** Keep user message in state; ensure `listMessages` / refresh doesn't overwrite optimistically added message. Consider: when refreshing messages, merge by id or by (role, content, created_at) to avoid dropping the just-sent user message.
3. **Skip refresh during active stream:** Ensure `setHistKey` / message reload does not run while streaming for the current thread.

**Files to touch:**
- `Chat.tsx`: Remove `await fetch('/api/chat/messages', { message: { role: 'user', content: val } })`; rely on stream route. Optionally add a comment that user message is inserted by the stream route.
- `Chat.tsx`: When merging messages from `listMessages`, preserve the latest user message if it matches the one we just sent (by content + approximate time) to avoid it being dropped during reload.
- `stream/route.ts`: Already inserts user message first; keep that. No change needed for insert.

---

## 7. Commander Confirmation Logic (Keep + Extend)

Existing logic:
- `historyForConfirm = streamThreadHistory ?? clientConversation`
- `askedCommander` = last assistant message contains "I believe your commander is"
- `looksLikeConfirmation(text)` = trimmed text matches "yes", "yeah", "correct", etc. (including "yes!")

**Add:**
- When confirmed: `UPDATE chat_threads SET commander = <name> WHERE id = tid` (for logged-in, non-guest).
- When user says "no, it's X": extract X, update `commander`, and use in prompt.

---

## 8. Testing Checklist

- [ ] Guest: multi-turn works; no slots (no tid); commander confirmation still works via clientConversation.
- [ ] Logged-in, new thread, paste decklist: `decklist_text` set, commander cleared.
- [ ] Logged-in, confirm commander: `commander` set; next message does not ask for decklist.
- [ ] Logged-in, paste new decklist: `decklist_text` replaced, commander cleared.
- [ ] Thread with linked deck: `deck_id` used; slots ignored for primary deck context.
- [ ] User message always appears in UI (no disappearing).
- [ ] No duplicate user messages in DB.

---

## 9. Implementation Order

1. **DB migration** – add `commander`, `decklist_text` to `chat_threads`.
2. **Stream route** – load/update/use slots; strengthen CRITICAL block when commander confirmed.
3. **Remove duplicate user insert** – Chat.tsx: remove `fetch('/api/chat/messages')` for user message; document that stream route inserts.
4. **Message visibility** – ensure refresh/merge logic does not drop optimistic user message.
5. **Manual QA** – run through checklist above.
6. **Build & commit** – see Section 10.

---

## 10. End-of-Work Steps

When work is finished:

1. Run an npm build:
   ```bash
   npm run build
   ```

2. If build succeeds:
   ```bash
   cd C:\Users\davy_\mtg_ai_assistant\frontend
   git add -A
   git commit -m "ai fix"
   git push origin main
   ```

---

## Appendix A: Files Changed (Summary)

| File | Changes |
|------|---------|
| `frontend/db/migrations/XXX_add_thread_commander_decklist.sql` | New: add commander, decklist_text columns |
| `frontend/app/api/chat/stream/route.ts` | Load/update/use thread slots; strengthen commander block |
| `frontend/components/Chat.tsx` | Remove user message save via /api/chat/messages; fix refresh merge if needed |

---

## Appendix B: Backup Verification

Before starting implementation, ensure backup exists:

```bash
git branch -a | grep backup-pre-thread-deck-slots
git log backup-pre-thread-deck-slots -1 --oneline
```

If backup branch is missing, create it:

```bash
git checkout main
git pull
git checkout -b backup-pre-thread-deck-slots
git push origin backup-pre-thread-deck-slots
git checkout main
```
