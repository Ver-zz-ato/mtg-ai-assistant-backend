# Thin prompt / thick validator

This document describes the architecture behind our prompt system: prompts guide judgment and tone; code enforces correctness.

---

## North star (for Cursor / product)

**One-sentence summary:** Thin, human-sounding prompt paired with a strong validator and cleanup pipeline, so the model can reason freely while the system guarantees legality, correctness, and consistency across MTG formats — with model choice being a plug-and-play concern, not the core solution.

**Architecture in one paragraph:** Prompts define persona, expectations, and light structure; validators and cleanup handle deduplication (including commander), color identity, strictly-worse swaps, truncation/incomplete output, regen-on-failure (max once), humanization, bracket enforcement, and synergy validation. Once the pipeline is trusted, swapping models (e.g. gpt-4o-mini → gpt-4 → gpt-5.x) is an env change; the system matters more than the model.

---

## Problem

Prompts were duplicating legality and enforcement (deck size, banlist, "already in deck", quality gates). That logic belongs in code. Prompts should guide how the model reasons and what shape the output takes; validators and cleanup enforce correctness and fix format.

---

## Architecture

### Prompts (thin)

- **Persona and tone:** ManaTap AI, expert deck analyst, human deck-doctor style.
- **Format feel:** What matters for Commander vs 60-card (multiplayer, singleton, color identity as context—not as a printed checklist).
- **What to reason about:** Evidence-backed problems, resource loops, synergy chains, curve/card-type fit.
- **Output shape:** Steps (archetype, pillars, problems, upgrades, synergy chains), ADD/CUT format, human-friendly phrasing.
- **Expectations:** Cite deck cards for problems; don’t recommend duplicates; match recommendations to deck plan.

No "MUST", no banlist/size enforcement in the prompt, no failure-condition checklists that the validator already enforces.

### Code (thick)

- **Legality:** Format, color identity, copy limits (e.g. Commander singleton, Modern 4-of).
- **Already in deck:** ADD suggestions must not be cards already in the list (or commander).
- **Invented cards:** Validated against Scryfall cache.
- **Strictly-worse detection:** Flag or reject downgrades.
- **Bracket normalization:** Ensure ADD/CUT card names are in `[[...]]` (e.g. `applyBracketEnforcement`).
- **Truncation / synergy cleanup:** Strip incomplete sentences or malformed synergy chains.
- **Optional regen:** If validation indicates `needsRegeneration`, one repair pass with a system message.

The validator is the single source of truth for what is allowed; the prompt does not re-specify those rules.

---

## What lives where

| Concern | Lives in |
|--------|-----------|
| Legality (format, identity, copies) | Validator |
| ADD/CUT format and bracket wrapping | Prompt (expectation) + cleanup (enforcement) |
| Commander dependency assessment | Prompt (FORMAT_COMMANDER) |
| Graveyard reasoning (fill / extract / protect) | Prompt (MODULE_GRAVEYARD_RECURSION, advisory) |
| Evidence-backed problems, synergy chains | Prompt |
| "Not already in deck" | Validator (and prompt as expectation) |
| Output structure (steps, human-friendly wording) | Prompt |

---

## Benefits

- **Single source of truth:** Rules are enforced in one place (validator + cleanup), so we don’t have prompts and code contradicting each other.
- **Easier prompt tuning:** We can adjust tone and structure without re-teaching legality or validation.
- **Smaller prompts:** No long failure-condition or quality-gate blocks.
- **Fewer contradictions:** Model isn’t asked to both "enforce" and "not mention" the same rules.

---

## Migration note

We are moving to thin BASE + FORMAT + modules; validators and cleanup are the enforcement layer. Legacy monolithic prompts are kept only as fallback until the phase-out below is complete.

---

## Monolithic fallback phase-out

The app still has a fallback path: when composition from `prompt_layers` fails, routes use `prompt_versions` (monolithic full prompts). That fallback should not stay forever.

### Phase 1 (now)

- Keep the fallback.
- When the fallback is used, log it (e.g. `log.warn("prompt_fallback_used", { route, reason })`).
- Do not change fallback content yet.

### Phase 2 (after confidence)

- Change fallback behavior so it returns a **small generic BASE v2 only** (no giant monolithic text).
- Ensures every route still gets a valid system prompt even when composition fails.

### Phase 3 (final)

- Remove `prompt_versions` (and any `app_config` keys that point to active monolithic versions).
- Source of truth is `prompt_layers` + git + migrations.

At that point the system is: **thin prompts + thick runtime intelligence**.

Phase 1–3 are **documented here only**; implementation is done when coverage, stability, and parity conditions are met (see prompt-system breakdown or product docs for those criteria).
