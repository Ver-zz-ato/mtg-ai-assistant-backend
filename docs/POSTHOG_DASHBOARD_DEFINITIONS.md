# PostHog dashboard definitions and event semantics

Use these definitions when building dashboards, reading the operator report, or evaluating activation. Correct labels avoid mis-reading regressions (see [POSTHOG_INSTRUMENTATION_AUDIT.md](POSTHOG_INSTRUMENTATION_AUDIT.md)).

---

## Pro funnel

- **Started:** `pro_upgrade_started` — user began checkout (pricing page or a Pro gate). After the pricing-page fix, this includes clicks on /pricing. Optionally also use `pricing_upgrade_clicked` for “clicked upgrade on pricing page.”
- **Completed:** `pro_upgrade_completed` — successful Pro subscription. Filter **LIBRARY = posthog-node** to avoid double-count with the thank-you page client event.

**Dashboard:** Include `pro_upgrade_started` in the funnel; do not filter to a single `source_path`. Expect started ≥ completed (or close) once the pricing page fires started.

---

## Deck usage

- **Deck created:** `deck_saved` — fired only on **create** (POST `/api/decks/create`). Do not use as “all saves.”
- **Deck updated:** `deck_updated` — fired on **edit** (PATCH/POST `/api/decks/update`).
- **Total deck saves:** Use **both** `deck_saved` and `deck_updated`; or show two series labeled “Deck created” and “Deck updated.”

**Dashboard:** Add or relabel series to “Deck created” (deck_saved) and “Deck updated” (deck_updated). Do not use deck_saved alone as “deck usage.”

---

## Chat / activation

- **Chat activity:** `chat_sent` — every chat message (guest and logged-in). Use for “chat volume” and “first chat” (e.g. first chat_sent per user).
- **First-time chatter (logged-in, new thread):** `thread_created` — only when a **logged-in** user sends a message **without** a threadId (new conversation). **Excludes guests.**
- **Do not** use `ai_prompt_path` for engagement — it is internal model-routing telemetry (every chat + deck analyze request).

**Dashboard:** Use `chat_sent` for activation and message volume. Use `thread_created` only where “new thread by logged-in user” is intended. Exclude or clearly label `ai_prompt_path` as internal.

---

## Identity

- **Auth events:** Filter **`source: auth_event_api`** for `signup_completed` and `login_completed` (server-side only).
- **Visitor → signup:** After the server-side alias fix, the same person can have `user_first_visit` (distinct_id = visitor_id) and `signup_completed` (distinct_id = user_id) when they sign up in the same browser; alias merges them.
- **First visit:** `user_first_visit` — distinct_id = visitor_id; no user_id yet.

---

## Manual dashboard changes (PostHog UI)

1. **Pro funnel:** Include `pro_upgrade_started`; ensure no filter that limits to one source_path.
2. **Deck:** Series “Deck created” = `deck_saved`, “Deck updated” = `deck_updated`.
3. **Activation:** Primary metric = `chat_sent` (and optionally “first chat_sent per user”); use `thread_created` only for “new thread by logged-in user.”
4. **Internal:** Exclude or label `ai_prompt_path` as internal; do not use for KPIs.

---

## Re-run operator report and evaluate activation (Fix 5)

**Steps (no code):**

1. Deploy the instrumentation fixes (pricing page `pro_upgrade_started`, auth-event `aliasServer`). Allow 24–48 hours for data (or use a test window).
2. In PostHog, re-run the operator state report (the notebook used for the Mar 15 report).
3. When reading the report, apply the definitions above:
   - **Pro funnel:** started vs completed should align (started ≥ completed) once the pricing page fires started.
   - **Deck:** “deck_saved” = creates only; use deck_updated for edits; “total saves” = both.
   - **Activation:** Use `chat_sent` and “first chat_sent per user”; treat `thread_created` as “new thread by logged-in user” only.
4. Evaluate activation using:
   - Visitor → signup (same person when alias runs),
   - Signup → first `chat_sent`,
   - Optionally signup → `deck_saved` or `deck_updated`,
   with definitions stated in the report or a one-pager.
