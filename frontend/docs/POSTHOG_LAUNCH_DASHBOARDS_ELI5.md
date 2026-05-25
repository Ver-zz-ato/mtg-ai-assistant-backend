# PostHog Launch Dashboards (ELI5)

This is the simple version of your PostHog setup for launch.

Use the dashboard prefixes like this:

- `App | ...` = mobile app behavior
- `Website | ...` = website behavior
- `Shared | ...` = things that cross both, or general health checks
- `Archive | ...` = old or loose stuff kept for reference, not daily use

## What to look at first

If you only have 60 seconds, check these in order:

1. `Shared | Analytics Health Checks`
2. `App | Weekly App Snapshot`
3. `App | Scanner Overview`
4. `Shared | Pro Upgrades & Paywalls`
5. `App | AI Feedback`

## What each main dashboard means

### `Shared | Analytics Health Checks`

This answers:

- Are app events arriving at all?
- Are important event properties missing?
- Did something quietly stop tracking?

Bad signs:

- Missing core events
- Missing platform info
- Missing free/pro status

Prelaunch note:

- Low counts are fine before launch.
- Missing event families are only scary if you expected to test them already.

### `App | Weekly App Snapshot`

This is the app heartbeat.

It answers:

- Are people opening the app?
- Are they using tools?
- Are upgrade buttons getting tapped?
- Is AI fast enough?

Bad signs:

- Tool opens are present but starts/completions are near zero
- AI failures spike
- Daily or weekly active users suddenly drop to zero after recent testing

### `App | Tool Usage & Drop-Off`

This tells you where people enter tools and where they stop.

It answers:

- Which tools get opened?
- Which tools actually get used?
- Where do users start but fail?
- Which tools are causing sign-in or upgrade friction?

Bad signs:

- Lots of `tool_opened`, very few `tool_action_started`
- Lots of starts, almost no completions
- Failures growing faster than starts

### `App | Scanner Overview`

This is the “does scanning actually work?” board.

It answers:

- Are people scanning?
- Are matches being found?
- Are cards being added?
- Are scan sessions ending cleanly?

Bad signs:

- Captures happen, but matches stay near zero
- Matches happen, but adds fail a lot
- AI help starts a lot, but success stays low

Prelaunch note:

- If nobody used the scanner recently, quiet is normal.

### `App | Scanner Quality & AI Help`

This is the scanner diagnostics board.

It answers:

- Is OCR weak?
- Is AI fallback saving bad scans?
- Are failures mostly camera / OCR / match / add problems?

Use this when Scanner Overview says “something’s off.”

### `Shared | Pro Upgrades & Paywalls`

This is the money funnel.

It answers:

- Are people seeing paywalls?
- Are they starting upgrades?
- Are upgrades completing?

Bad signs:

- Paywall views happen but upgrade starts are zero
- Upgrade starts happen but completions are near zero
- Sudden drop after a new build or store change

### `App | AI Tool Health`

This is “is app AI behaving?”

It answers:

- Which AI tools are used most?
- Which ones are slow?
- Which ones fail most?

Bad signs:

- Slow AI response time jumps up
- One tool starts failing much more than the rest
- Cost rises but usage does not

### `App | AI Chat Health`

This is the app chat board.

It answers:

- Are chat sessions starting?
- Are messages getting sent?
- Are replies completing?
- Is chat slowing down?

### `App | AI Feedback`

This is the “what are users unhappy about?” board.

It answers:

- Are people leaving thumbs up/down?
- Are analysis reports being marked useful?
- Are structured issue reports arriving?

Bad signs:

- Negative feedback jumps after a deploy
- Report volume spikes on one screen

### `App | Chat Corrections`

This is specifically for “the AI said something wrong.”

Use this when feedback feels vague and you want more direct correction signals.

### `App | Deck Analysis Feedback`

This is the deck-analysis quality board.

Use it to answer:

- Are people finding deck analysis useful?
- Did a prompt change make things better or worse?

### `Website | New Users Getting Started`

This is the website activation funnel.

It answers:

- Are visitors becoming users?
- Are new users reaching first meaningful actions?

### `Website | Main Website Usage`

This is what people do on the website after arriving.

Use it for:

- deck builder usage
- mulligan web usage
- feature interaction trends

### `Website | People Coming Back`

This answers:

- Do people return after first use?
- Which early actions lead to better retention?

### `Website | Where Visitors Come From`

This is top-of-funnel traffic.

It answers:

- Which channels send visits?
- Which channels lead to signups?

## Normal prelaunch quiet vs actual problems

### Usually fine before launch

- Scanner events low or zero
- Feedback events low or zero
- Pro upgrade events low or zero
- Small daily active user numbers

### Worth investigating even before launch

- No app events at all after testing
- Tool opens happen, but no tool starts/completions
- Feedback submission failures appear
- Upgrade starts happen, but completions never do
- One AI tool suddenly becomes slow or failure-heavy

## Good launch-day habit

Check:

1. `Shared | Analytics Health Checks`
2. `App | Weekly App Snapshot`
3. `Shared | Pro Upgrades & Paywalls`
4. `App | AI Tool Health`
5. `App | Scanner Overview` only if people are actually scanning

## Related docs

- `C:\Users\davy_\Projects\mtg_ai_assistant\frontend\docs\LAUNCH_DAY_RUNBOOK.md`
- `C:\Users\davy_\Projects\mtg_ai_assistant\frontend\docs\MOBILE_ADMIN_CONTROL.md`
- `C:\Users\davy_\Projects\mtg_ai_assistant\frontend\docs\POSTHOG_FEEDBACK_DASHBOARDS_SPEC.md`
