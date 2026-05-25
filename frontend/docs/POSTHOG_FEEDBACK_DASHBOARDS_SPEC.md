# PostHog Feedback Dashboards Spec

This is the short spec for the feedback-related dashboards and event checks.

## Goal

Answer three simple questions:

1. Are people sending feedback?
2. What kind of feedback are they sending?
3. Are feedback/report submissions failing?

## Main events

### App feedback success-side

- `feedback_sent`
- `chat_feedback`
- `analysis_feedback_submitted`
- `chat_issue_report_submitted`

### App feedback failure-side

- `feedback_submission_failed`

## Recommended dashboard views

### `App | AI Feedback`

Use:

- total app AI feedback count
- thumbs up vs down
- negative chat feedback by screen/surface
- analysis usefulness over time
- structured report count

Break down by:

- `source`
- `source_surface`
- `source_feature`
- `context`

### `App | Chat Corrections`

Use:

- chat correction open-to-submit rate
- correction counts over time
- correction issue types

### `App | Deck Analysis Feedback`

Use:

- analysis feedback over time
- analysis usefulness over time
- prompt version comparison if present

## Failure monitoring

`feedback_submission_failed` should be visible in:

- PostHog search
- `Shared | Analytics Health Checks`
- website admin cockpit Feedback tab

Break it down by:

- `source_feature`
- `source_surface`
- `context`
- `error_type`
- `error_code`

## Healthy prelaunch expectations

Before wider launch, it is normal for:

- feedback volume to be low
- issue reports to be low
- some boards to look quiet

It is not normal for:

- `feedback_submission_failed` to show repeated failures after active testing

## Related docs

- `C:\Users\davy_\Projects\mtg_ai_assistant\frontend\docs\POSTHOG_LAUNCH_DASHBOARDS_ELI5.md`
- `C:\Users\davy_\Projects\mtg_ai_assistant\frontend\docs\LAUNCH_DAY_RUNBOOK.md`
