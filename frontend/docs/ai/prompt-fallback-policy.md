# Prompt fallback policy

This document defines how we instrument and eventually phase out monolithic prompt fallbacks in favour of the 3-layer composed system (BASE + FORMAT + MODULES). See [thin_prompt_thick_validator.md](../thin_prompt_thick_validator.md) for the overall "thin prompt / thick validator" philosophy.

---

## Philosophy summary

**Thin prompt / thick validator:** Prompts guide judgment, persona, and output shape; code (validators and cleanup) enforces correctness (legality, "already in deck", brackets, truncation). The preferred source for system prompts is the **3-layer composed system** (prompt_layers: BASE + FORMAT + MODULES). Fallbacks are:

1. **composed** — preferred: built from prompt_layers.
2. **fallback_version** — monolithic system prompt from prompt_versions (or app_config legacy).
3. **fallback_hardcoded** — last resort when DB or config is unavailable; intentionally minimal and not format-aware.

We instrument every request so we can measure how often we use each path and reduce accidental fallback usage.

---

## KPI: when to remove monolithic fallbacks

- **Target:** The combined rate of **fallback_version** and **fallback_hardcoded** should be **&lt; 1%** over a rolling **7-day** window (measured via `ai_usage.prompt_path` and/or PostHog `ai_prompt_path` events).
- **When the KPI is met:** We can remove the prompt_versions (monolithic) fallback from the routes and rely only on composed (prompt_layers) plus a single hardcoded default for true failures (e.g. DB unavailable).
- **Until then:** Keep all three paths; use logs and analytics to fix transient compose failures (e.g. Supabase/DB issues) and to ensure prompt_layers are always loaded when possible.
- **Removal of monolithic prompts is a code change gated on KPI, not a manual toggle.**

---

## Instrumentation

- **Structured logs:** Each request to `/api/chat/stream`, `/api/chat`, and `/api/deck/analyze` logs exactly one `[prompt]` line with `promptPath`, `kind`, `formatKey`, `modulesAttachedCount`, `promptVersionId`, `tier`, `model`, `route`, and optional `compose_failed` / `error_message` (no prompt text, no decklist, no user content).
- **PostHog:** Server-side event `ai_prompt_path` with the same metadata (when PostHog is configured).
- **ai_usage:** Rows written by the chat route include nullable `prompt_path`, `prompt_version_id`, `modules_attached_count`, `format_key`, `model_tier` for dashboards and the 7-day fallback rate.
- **Regeneration (repair pass) does not change prompt_path;** it inherits the original path for that request.

---

## Dashboard metric (suggested)

- **Fallback rate (7d):**  
  `(count where prompt_path IN ('fallback_version', 'fallback_hardcoded')) / (count where prompt_path IS NOT NULL)`  
  over the last 7 days.  
  Goal: &lt; 1%.
