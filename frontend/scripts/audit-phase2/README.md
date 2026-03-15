# Phase 2 Data Volume Audit Scripts

Run these to populate the Phase 2 report with actual counts and aggregates.

## Prerequisites

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
- **PostHog:** `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` for event counts (get from PostHog → Project Settings → Personal API Keys with Query read; Project ID in same settings)

## Commands

From `frontend/`:

```bash
# 1 & 2 — PostHog event totals, by month/deck/commander, suggestion IDs, top 50 accepted cards
POSTHOG_PERSONAL_API_KEY=phx_... POSTHOG_PROJECT_ID=12345 npx tsx scripts/audit-phase2/posthog-events.ts

# 3 — Deck structure (sample 100 deck_context_summary, aggregate land/ramp/removal/draw/curve/archetype)
npx tsx scripts/audit-phase2/supabase-deck-structure.ts

# 4 — Mulligan keep rate, mulligan count distribution, ramp-in-reasons vs keep
npx tsx scripts/audit-phase2/supabase-mulligan.ts
```

Redirect output to files and paste into `docs/DATA_VOLUME_PHASE2_REPORT.md` where indicated.
