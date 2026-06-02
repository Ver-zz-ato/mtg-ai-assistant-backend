# ManaTap Launch Day Runbook

This is the practical version.

Use this for:

- internal tester week
- public launch day
- first 24 hours after launch

## Main places to watch

- Website admin cockpit:
  - `/admin/mobile-command-center`
- PostHog dashboards:
  - `Shared | Analytics Health Checks`
  - `App | Weekly App Snapshot`
  - `Shared | Pro Upgrades & Paywalls`
  - `App | AI Tool Health`
  - `App | AI Feedback`
- Discord:
  - `manatap launch alerts`

## Before internal testers

### Verify config

- Open `/admin/mobile-command-center`
- Check all env pills are on:
  - Supabase
  - PostHog
  - Sentry
  - RevenueCat
  - Discord

### Send one intentional test

- Press `Test Discord`
- Confirm one message lands in Discord
- Do not keep sending test alerts after that

### Verify critical event families

After one real test flow each, confirm PostHog sees:

- `tool_opened`
- `tool_action_started`
- `tool_action_completed`
- `tool_action_failed`
- `pro_gate_viewed`
- `pro_upgrade_started`
- `pro_upgrade_completed`
- `feedback_sent`
- `feedback_submission_failed` only if something breaks
- `scan_card_session_completed` after a real scanner run

### Verify purchase funnel

- Open app Pro screen
- Confirm paywall / upgrade events appear
- Confirm successful upgrade produces:
  - `pro_upgrade_started`
  - `purchase_started`
  - `purchase_completed`
  - `pro_upgrade_completed`

## During internal testing

Check 2-3 times a day:

1. Cockpit Overview
2. `Shared | Analytics Health Checks`
3. `App | Weekly App Snapshot`
4. `App | AI Feedback`

Look for:

- Sentry/API failures
- AI errors increasing
- feedback submission failures
- paywall starts with no completions
- missing app event families after you know people tested them

## Launch day

### First pass

Do this in order:

1. Open cockpit Overview
2. Check Discord alerts
3. Check `Shared | Analytics Health Checks`
4. Check `App | Weekly App Snapshot`
5. Check `Shared | Pro Upgrades & Paywalls`

### If everything looks normal

Normal means:

- No critical cockpit alerts
- App events are arriving
- Sentry is connected
- AI cost/errors look stable
- Upgrade funnel shows at least views/starts if traffic exists

### If something looks wrong

Use this shortcut:

- Scanner weird -> `App | Scanner Overview`
- AI weird -> `App | AI Tool Health`
- Revenue weird -> `Shared | Pro Upgrades & Paywalls`
- Feedback weird -> `App | AI Feedback`
- Tracking weird -> `Shared | Analytics Health Checks`

## First 24 hours after public launch

### Watch these most closely

- AI cost spikes
- AI failure spikes
- Sentry unresolved issues
- feedback submission failures
- upgrade starts without completions
- rate-limit hits

### Launch alerts, ELI5

Discord launch alerts should mean "something is seriously wrong."

Yellow dashboard metrics still show in the cockpit/daily digest, but they should not ping as launch alerts by themselves.

| Alert | Simple meaning | First check |
|-------|----------------|-------------|
| `Supabase admin client is not configured` | The cockpit cannot read private launch data. | Fix server-only Supabase admin env. |
| `AI cost` | AI spend is critically high. | AI tab -> expensive users/features/routes. |
| `AI errors` | More than 10% of app AI calls failed. | AI tab, then Sentry/local errors. |
| `Sentry unresolved` | Sentry has a critical number of unresolved issues. | Newest user-facing issue first. |
| `Local error logs` | Backend/API errors hit the critical threshold. | Repeated same route/message first. |
| `Daily price jobs` | A required price job failed. | `/admin/ops`. |
| `Pipeline jobs` | A monitored background job failed. | `/admin/ops`. |

For the old screenshot-style rate-limit message:

- It meant rate limits blocked some requests.
- `5` meant five masked user/guest keys hit a limit.
- `7 hit row(s)` meant seven logged limit events.
- `3 route(s)` meant those events were spread across three API paths.
- That is now a dashboard/report watch metric, not a Discord launch alert.

### Things that are not automatically scary

- Quiet scanner usage if few people reached it
- Few feedback events early on
- Small Pro counts in the first hours

## Suggested response rules

### Stop and investigate fast

- Sentry starts failing
- PostHog app events go to zero during known testing/use
- purchase_started increases but purchase_completed stays zero
- feedback_submission_failed appears repeatedly
- AI fail rate jumps sharply

### Monitor, but don’t panic

- scanner events are quiet
- no recent feedback
- low upgrade volume early

## Useful links

- `C:\Users\davy_\Projects\mtg_ai_assistant\frontend\docs\POSTHOG_LAUNCH_DASHBOARDS_ELI5.md`
- `C:\Users\davy_\Projects\mtg_ai_assistant\frontend\docs\MOBILE_ADMIN_CONTROL.md`
- `C:\Users\davy_\Projects\Manatap-APP\docs\MOBILE_BACKEND_LAUNCH_READINESS_CHECKLIST.md`
