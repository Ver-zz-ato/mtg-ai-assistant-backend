# Conversion Funnel Implementation

**Date**: January 2025  
**Purpose**: Improve signup + Pro conversion by fixing intent mismatch and adding a clean, measurable activation → signup → pro funnel

---

## Overview

This document describes the conversion funnel tracking implementation, including:
- Event taxonomy and properties
- Funnel definitions for PostHog
- Session context enrichment
- A/B test experiments
- Guest value moment tracking

---

## Session Context Enrichment

**All events are automatically enriched with session context** via `lib/ph.ts` `capture()` function.

### Auto-Added Properties

Every event includes these properties (unless `skipEnrichment: true` is passed):

- `landing_page` - First page visited in session (stored in sessionStorage)
- `current_path` - Current page pathname + search params
- `referrer` - Document referrer or URL `ref`/`referrer` param
- `utm_source` - UTM source parameter (if present)
- `utm_medium` - UTM medium parameter (if present)
- `utm_campaign` - UTM campaign parameter (if present)
- `device_type` - 'mobile' | 'desktop' | 'tablet' (detected from UA + viewport)
- `is_authenticated` - Boolean (must be passed to `capture()` via options)

### Implementation

- **Session Bootstrap**: `lib/analytics/session-bootstrap.ts`
  - Stores `landing_page` in sessionStorage (cleared on tab close)
  - Extracts UTM params from URL
  - Detects device type from user agent + viewport width

- **Auto-Enrichment**: `lib/ph.ts` `capture()` function
  - Automatically calls `getSessionContext(isAuthenticated)` 
  - Merges session context with event props (props override context)

- **React Hook**: `lib/analytics/useCapture.ts`
  - `useCapture()` hook automatically includes `isAuthenticated` from `useAuth()`
  - Usage: `const capture = useCapture(); capture(event, props);`

---

## Event Taxonomy

### New Events Added

#### Auth Required Events
- `auth_required_viewed` - User views a page requiring authentication
  - Properties: `destination` (page they tried to access)
  
- `auth_required_cta_clicked` - User clicks CTA on auth-required page
  - Properties: `cta` ('primary' | 'secondary'), `destination`

#### Homepage Experiment Events
- `home_variant_viewed` - Homepage variant displayed
  - Properties: `variant` ('A' | 'B')
  
- `home_primary_cta_clicked` - Primary CTA clicked on homepage
  - Properties: `cta_type` ('analyze_deck' | 'import_sample' | 'start_chat'), `variant`

#### Guest Value Moment Events
- `guest_value_moment` - Guest hits a "wow" moment
  - Properties: `value_moment_type` ('deck_analyzed' | 'chat_engaged' | 'suggestion_shown'), `deck_id?`, `chat_count?`, `suggestion_id?`
  
- `guest_limit_modal_variant` - Modal variant shown (for A/B testing copy)
  - Properties: `variant` ('value_moment' | 'standard'), `message_count`

### Enhanced Events

#### PRO Gate Events
All `pro_gate_viewed` and `pro_gate_clicked` events now include:
- `feature` - Which feature was gated
- `location` / `gate_location` - Where the gate appeared
- `plan_suggested` - Suggested plan ('monthly' | 'annual', defaults to 'monthly')
- `reason` - Why gate appeared ('feature_required' | 'limit_reached', defaults to 'feature_required')

#### PRO Upgrade Started
`pro_upgrade_started` now includes:
- `upgrade_source` - 'gate' | 'pricing'
- `feature` - Feature that triggered upgrade (if from gate)
- `location` - Gate location (if from gate)

---

## Funnel Definitions

### Funnel A: Activation → Signup → Pro

**Purpose**: Track users from first value moment to conversion

1. **Activation** (any of):
   - `guest_value_moment` (type: 'deck_analyzed' | 'chat_engaged' | 'suggestion_shown')
   - `workflow.started` (source: 'chat_paste' | 'analysis_panel')
   - `home_primary_cta_clicked` (variant: 'B')

2. **Signup Intent**:
   - `auth_required_cta_clicked` (cta: 'primary')
   - `guest_limit_signup_clicked`
   - `signup_started`

3. **Signup Completed**:
   - `signup_completed`

4. **Pro Upgrade Intent**:
   - `pro_upgrade_started` (source: 'gate' | 'pricing')

5. **Pro Conversion**:
   - `pro_upgrade_completed`

**PostHog Funnel Setup**:
```
Step 1: guest_value_moment OR workflow.started OR home_primary_cta_clicked
Step 2: auth_required_cta_clicked OR guest_limit_signup_clicked OR signup_started
Step 3: signup_completed
Step 4: pro_upgrade_started
Step 5: pro_upgrade_completed
```

**Breakdown Properties**:
- `landing_page` - Where did they start?
- `utm_source` - What campaign brought them?
- `device_type` - Mobile vs desktop behavior
- `value_moment_type` - Which activation moment converted best?

---

### Funnel B: Homepage Experiment → Activation

**Purpose**: Compare homepage variants for activation rate

1. **Variant View**:
   - `home_variant_viewed` (variant: 'A' | 'B')

2. **Primary CTA Click**:
   - `home_primary_cta_clicked`

3. **Activation**:
   - `workflow.started` OR `chat_sent` OR `deck_analyzed`

**PostHog Funnel Setup**:
```
Step 1: home_variant_viewed
Step 2: home_primary_cta_clicked
Step 3: workflow.started OR chat_sent OR deck_analyzed
```

**Breakdown Properties**:
- `variant` - A vs B performance
- `cta_type` - Which CTA converted best
- `landing_page` - Did they land on homepage?

---

### Funnel C: Guest → Value Moment → Signup

**Purpose**: Track guest conversion after value moments

1. **Guest Activity**:
   - `chat_sent` (is_authenticated: false) OR `deck_analyzed` (is_authenticated: false)

2. **Value Moment**:
   - `guest_value_moment`

3. **Limit Reached**:
   - `guest_limit_modal_shown` (has_value_moment: true)

4. **Signup**:
   - `guest_limit_signup_clicked` OR `signup_started`
   - `signup_completed`

**PostHog Funnel Setup**:
```
Step 1: chat_sent (where is_authenticated = false) OR deck_analyzed (where is_authenticated = false)
Step 2: guest_value_moment
Step 3: guest_limit_modal_shown (where has_value_moment = true)
Step 4: guest_limit_signup_clicked OR signup_started
Step 5: signup_completed
```

**Breakdown Properties**:
- `value_moment_type` - Which moment drives conversion?
- `variant` (from guest_limit_modal_variant) - Does value moment copy help?
- `message_count` - How many messages before conversion?

---

## Auth-Required Pages

### Pages with Auth Gates

- `/my-decks` - Shows GuestLandingPage with deck building features
- `/collections` - Shows GuestLandingPage with collection management features  
- `/price-tracker` - Shows GuestLandingPage with price tracking features

### Implementation

All three pages:
1. Check authentication via `useAuth()` hook
2. Show `GuestLandingPage` component if not authenticated
3. Fire `auth_required_viewed` event with `destination` property
4. Fire `auth_required_cta_clicked` when user clicks signup/signin CTAs

### GuestLandingPage Component

- Accepts `destination` prop (page they tried to access)
- Tracks `auth_required_viewed` on mount
- Tracks `auth_required_cta_clicked` on CTA clicks
- Shows feature highlights and demo sections specific to each page

---

## Homepage A/B Test

### Variant A (Control)
- Current homepage layout
- Chat interface with sidebars
- No explicit primary CTA above the fold

### Variant B (Activation-First)
- Primary CTA above the fold: "Analyze a deck" or "Import sample deck"
- Read-only example analysis module or "paste decklist" box
- Chat interface below

### Implementation

- **Feature Flag**: `NEXT_PUBLIC_HOME_VARIANT` env var or URL param `?home_variant=B`
- **Tracking**: 
  - `home_variant_viewed` on page load
  - `home_primary_cta_clicked` on CTA clicks
  - Downstream events: `workflow.started`, `chat_sent`, `signup_started`

### Variant Selection

```typescript
// lib/analytics/home-experiment.ts
getHomeVariant(): 'A' | 'B'
  - Checks URL param ?home_variant=A|B (for testing)
  - Checks NEXT_PUBLIC_HOME_VARIANT env var
  - Defaults to 'A' (control)
```

---

## Guest Value Moment Tracking

### Value Moment Triggers

A "value moment" is defined as when a guest user:
1. **Deck Analyzed**: Completes a deck analysis (`deck_analyzed` event)
2. **Chat Engaged**: Sends 2+ chat messages (`chat_sent` count >= 2)
3. **Suggestion Shown**: Sees an AI suggestion (`ai_suggestion_shown` event)

### Implementation

- **Tracking**: `lib/analytics/guest-value-moment.ts`
  - `trackGuestValueMoment()` - Fires `guest_value_moment` event
  - `hasValueMoment()` - Checks if user should see value moment variant
  - `getValueMomentType()` - Determines which type of value moment

- **Guest Limit Modal Enhancement**:
  - Accepts `hasValueMoment` and `valueMomentType` props
  - Shows different copy: "Save your progress and keep this analysis!" vs standard
  - Tracks `guest_limit_modal_variant` event for A/B testing

### Value Moment Copy Variants

**Standard** (no value moment):
> "Sign up for free to continue chatting and unlock:"

**Value Moment** (has value moment):
> "Save your progress and keep this analysis! Sign up for free to unlock:"

---

## PRO Gate Enhancements

### Required Properties

All `pro_gate_viewed` and `pro_gate_clicked` events must include:

- `feature` - Feature name (e.g., 'hand_testing', 'fix_card_names')
- `location` - Gate location (e.g., 'widget_display', 'collection_editor')
- `plan_suggested` - Suggested plan ('monthly' | 'annual', default: 'monthly')
- `reason` - Why gate appeared ('feature_required' | 'limit_reached', default: 'feature_required')

### New PRO Gate Location

**Workflow Pro Gate**: Added in `DeckSnapshotPanel` for "Export" or "Advanced Analysis" features

Example:
```typescript
trackProGateViewed('export_deck', 'analysis_workflow', {
  plan_suggested: 'monthly',
  reason: 'feature_required',
});
```

### PRO Upgrade Source Tracking

`pro_upgrade_started` now distinguishes:
- `source: 'gate'` - Clicked from a PRO gate
- `source: 'pricing'` - Clicked from pricing page

Includes `feature` and `location` when source is 'gate'.

---

## Event Properties Reference

### Common Properties (Auto-Added)

All events include these (via session context):

| Property | Type | Description |
|----------|------|-------------|
| `landing_page` | string | First page in session |
| `current_path` | string | Current page path + search |
| `referrer` | string | Document referrer or URL param |
| `utm_source` | string? | UTM source (if present) |
| `utm_medium` | string? | UTM medium (if present) |
| `utm_campaign` | string? | UTM campaign (if present) |
| `device_type` | 'mobile'\|'desktop'\|'tablet' | Detected device type |
| `is_authenticated` | boolean | User authentication status |

### Auth Required Events

#### `auth_required_viewed`
- `destination` - Page user tried to access (e.g., '/my-decks')

#### `auth_required_cta_clicked`
- `cta` - 'primary' | 'secondary'
- `destination` - Page user tried to access

### Homepage Experiment Events

#### `home_variant_viewed`
- `variant` - 'A' | 'B'

#### `home_primary_cta_clicked`
- `cta_type` - 'analyze_deck' | 'import_sample' | 'start_chat'
- `variant` - 'A' | 'B'

### Guest Value Moment Events

#### `guest_value_moment`
- `value_moment_type` - 'deck_analyzed' | 'chat_engaged' | 'suggestion_shown'
- `deck_id?` - Deck ID (if type is 'deck_analyzed')
- `chat_count?` - Number of chats (if type is 'chat_engaged')
- `suggestion_id?` - Suggestion ID (if type is 'suggestion_shown')

#### `guest_limit_modal_variant`
- `variant` - 'value_moment' | 'standard'
- `message_count` - Number of messages used

### PRO Gate Events

#### `pro_gate_viewed` / `pro_gate_clicked`
- `feature` - Feature name
- `location` / `gate_location` - Gate location
- `plan_suggested` - 'monthly' | 'annual'
- `reason` - 'feature_required' | 'limit_reached'

#### `pro_upgrade_started`
- `upgrade_source` - 'gate' | 'pricing'
- `feature?` - Feature (if from gate)
- `location?` - Gate location (if from gate)

---

## PostHog Dashboard Setup

### Recommended Dashboards

1. **Conversion Funnel Dashboard**
   - Funnel A: Activation → Signup → Pro
   - Funnel B: Homepage Experiment
   - Funnel C: Guest → Value Moment → Signup
   - Breakdowns: landing_page, utm_source, device_type, variant

2. **Activation Analysis**
   - Value moment types and conversion rates
   - Homepage variant performance
   - Guest limit modal variant effectiveness

3. **PRO Funnel Analysis**
   - PRO gate views → clicks → upgrades
   - Gate location effectiveness
   - Upgrade source attribution (gate vs pricing)

4. **Landing Page Analysis**
   - Landing page → conversion correlation
   - UTM campaign performance
   - Referrer analysis

---

## Implementation Files

### Core Analytics
- `lib/ph.ts` - Enhanced capture() with auto-enrichment
- `lib/analytics/session-bootstrap.ts` - Session context tracking
- `lib/analytics/useCapture.ts` - React hook with auth context
- `lib/analytics/events.ts` - Event name constants

### Conversion Tracking
- `lib/analytics/home-experiment.ts` - Homepage A/B test
- `lib/analytics/guest-value-moment.ts` - Guest value moment tracking
- `lib/analytics-pro.ts` - Enhanced PRO gate tracking

### Components
- `components/GuestLandingPage.tsx` - Auth-required page template
- `components/GuestLimitModal.tsx` - Enhanced with value moment variants
- `app/my-decks/page.tsx` - Auth gate with tracking
- `app/collections/page.tsx` - Auth gate with tracking
- `app/price-tracker/page.tsx` - Auth gate with tracking

---

## Testing

### Manual Testing

1. **Session Context**:
   - Visit with `?utm_source=test&utm_campaign=test`
   - Check PostHog events include UTM params
   - Verify `landing_page` persists across navigation

2. **Auth Required Pages**:
   - Visit `/my-decks` as guest
   - Verify `auth_required_viewed` fires
   - Click signup CTA, verify `auth_required_cta_clicked`

3. **Homepage Variant**:
   - Set `NEXT_PUBLIC_HOME_VARIANT=B` or `?home_variant=B`
   - Verify `home_variant_viewed` fires
   - Click primary CTA, verify `home_primary_cta_clicked`

4. **Guest Value Moments**:
   - As guest, send 2 chat messages
   - Verify `guest_value_moment` fires (type: 'chat_engaged')
   - Analyze a deck, verify `guest_value_moment` fires (type: 'deck_analyzed')
   - Hit guest limit, verify modal shows value moment copy

5. **PRO Gates**:
   - View PRO gate, verify `pro_gate_viewed` includes all required properties
   - Click PRO gate, verify `pro_gate_clicked` includes all properties
   - Click upgrade, verify `pro_upgrade_started` includes source

---

## Environment Variables

```env
# Homepage A/B test variant (optional)
NEXT_PUBLIC_HOME_VARIANT=A  # or B

# PostHog (existing)
NEXT_PUBLIC_POSTHOG_KEY=...
NEXT_PUBLIC_POSTHOG_HOST=...
```

---

## Next Steps

1. **Deploy and Monitor**: Watch PostHog for event volume and property completeness
2. **Set Up Funnels**: Create PostHog funnels A, B, C as defined above
3. **A/B Test Homepage**: Gradually roll out variant B and measure activation rates
4. **Optimize Guest Modal**: Test value moment copy variants and measure conversion
5. **PRO Gate Optimization**: Analyze which gate locations convert best

---

## Notes

- All events are consent-gated (require cookie consent)
- Session context is stored in sessionStorage (cleared on tab close)
- Device type detection uses user agent + viewport width
- UTM params are extracted from URL on page load
- Landing page is stored once per session and reused for all events
