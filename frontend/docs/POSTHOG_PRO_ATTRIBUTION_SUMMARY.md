# PostHog Pro attribution & analytics alignment – summary

## Goals (done)

1. **Pro conversion attribution** – Upgrades attributed to the exact feature that triggered the paywall via `pro_feature`.
2. **Auth attribution** – `signup_completed` / `login_completed` carry `method`, `provider`, `source_path`, `visitor_id` (verified; no changes).
3. **No UA everywhere** – User-agent not added to pro/workflow/auth events.
4. **Event seeding** – Admin-only `/admin/analytics-seed` fires each canonical event once for PostHog taxonomy.

---

## Files changed

| File | Change |
|------|--------|
| `lib/analytics-pro.ts` | Added `setActiveProFeature` / `getActiveProFeature` (memory + localStorage). `pro_gate_viewed` now sends `pro_feature`, `source_path`, `is_logged_in`, `is_pro`, `visitor_id`. `pro_upgrade_started` / `pro_upgrade_completed` include `pro_feature`, `source_path`, `workflow_run_id`. `pro_upgrade_completed` also sent via `POST /api/analytics/track-event` (replaced `/api/analytics/revenue`). |
| `app/thank-you/page.tsx` | `pro_upgrade_completed` uses `getActiveProFeature()` and `source_path`; removed duplicate `track-event` call (handled in `captureProEvent`). |
| `components/ProBadge.tsx` | Fires `pro_gate_viewed` when Upgrade tooltip is shown (`header_upgrade`, `header`). On Upgrade click: `setActiveProFeature('header_upgrade')`, `trackProUpgradeStarted('gate', …)`. |
| `components/DeckSnapshotPanel.tsx` | `trackProGateViewed` options: `is_pro: false`. |
| `components/HandTestingWidget.tsx` | `trackProGateViewed` options: `is_pro: false`. |
| `app/admin/analytics-seed/page.tsx` | **New.** Admin-only page with buttons to fire: `pro_gate_viewed`, `pro_upgrade_started`, `pro_upgrade_completed`, `workflow.started`, `workflow.completed`, `workflow.abandoned` (with `pro_feature=seed_test` / `workflow_name=seed_test`). Auth: instructions only (no fake events). |
| `docs/POSTHOG_PRO_ATTRIBUTION_SUMMARY.md` | **New.** This file. |

---

## Where `pro_feature` is sourced and how it flows

1. **Storage**
   - **Memory:** `activeProFeatureMemory` in `lib/analytics-pro.ts`.
   - **localStorage:** key `analytics:active_pro_feature` (same module).
   - **Set by:** `setActiveProFeature(feature)` (called inside `trackProGateViewed` and optionally before upgrade click).
   - **Read by:** `getActiveProFeature()` (used in `trackProUpgradeStarted`, `captureProEvent` for `pro_upgrade_completed`, and thank-you page).

2. **Flow**
   - **Gate shown** → `trackProGateViewed(feature, location, options)` → `setActiveProFeature(feature)` → `capture('pro_gate_viewed', { pro_feature, source_path, is_logged_in, is_pro, visitor_id, … })`.
   - **Upgrade started** → `trackProUpgradeStarted(source, options)` → `pro_feature = getActiveProFeature() ?? options?.feature` → `capture('pro_upgrade_started', { pro_feature, source_path, workflow_run_id, … })`.
   - **Upgrade completed** (thank-you) → `getActiveProFeature()` → `captureProEvent('pro_upgrade_completed', { pro_feature, source_path, workflow_run_id })` → client `capture` + `POST /api/analytics/track-event` with same props.

3. **Pro gate call sites (current)**
   - **DeckSnapshotPanel:** `export_deck_analysis` / `analysis_workflow` (when export PRO block is shown).
   - **HandTestingWidget:** `hand_testing` / `widget_display` (when free runs = 0).
   - **CollectionEditor:** `fix_card_names` / `collection_editor`, `set_to_playset` / `bulk_actions`.
   - **ProBadge:** `header_upgrade` / `header` (when Upgrade tooltip is shown).

---

## Auth events (verified, no code change)

- **Client:** `AnalyticsIdentity` sends `POST /api/analytics/auth-event` with `type`, `method`, `provider`, `source_path`, `visitor_id`.
- **Server:** `app/api/analytics/auth-event/route.ts` forwards these to `captureServer(type, props, distinctId)` with `method`, `provider`, `source_path`, `visitor_id` (and `user_id`, `timestamp`, `source`). Event names remain `signup_completed` / `login_completed`.

---

## Verification in PostHog Live Events

1. **Pro funnel**
   - Trigger a Pro gate (e.g. use Hand Testing after 3 free runs, or Deck Snapshot export, or header Upgrade).
   - In Live Events, filter for `pro_gate_viewed` → check `pro_feature`, `source_path`, `is_pro`, `visitor_id`.
   - Click upgrade → filter for `pro_upgrade_started` → check `pro_feature`, `source_path`, `workflow_run_id`.
   - Complete checkout → on thank-you, filter for `pro_upgrade_completed` → check `pro_feature`, `source_path`, `workflow_run_id`.

2. **Seeding**
   - As admin, open `/admin/analytics-seed`, click each button once.
   - In Live Events, confirm `pro_gate_viewed`, `pro_upgrade_started`, `pro_upgrade_completed`, `workflow.started`, `workflow.completed`, `workflow.abandoned` with the expected props (`pro_feature=seed_test` or `workflow_name=seed_test`).

3. **Auth**
   - Sign out, then sign in or sign up.
   - In Live Events, filter for `signup_completed` or `login_completed` → check `method`, `provider`, `source_path`, `visitor_id`.
