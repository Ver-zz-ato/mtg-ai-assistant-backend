# Eval Set Discipline for Deck Analysis

This doc defines how to avoid prompt regressions when you tweak BASE or validators: **small and cruel** evals, not comprehensive coverage.

---

## Principle

Not “did this feel better?” but:

- **Did it stop ADD-already-in-deck?**
- **Did it stop illegal colors?**
- **Did synergy chains survive cleanup?**

You’re already halfway there with admin ai-test. This adds discipline: a fixed set of expectations and pass/fail checks.

---

## Suggested checks (pass/fail)

| Check | Meaning |
|-------|--------|
| **No ADD in deck** | Every ADD in the analysis is not already in the decklist. Validator strips violations; we want zero such blocks in the final text (or they were stripped and repair notice shown). |
| **No illegal colors** | For Commander, every suggested ADD is within commander color identity. Validator strips off-color; we want zero off-color ADD blocks. |
| **Chains survive cleanup** | At least one clear “A → B → outcome” synergy chain remains after `stripIncompleteSynergyChains` / output cleanup. |
| **Parseable ADD/CUT** | All remaining ADD/CUT blocks are parseable by `validateRecommendations` (bracket or bare form, with optional list prefix). |

---

## Golden decklists (small set)

- Keep **5–10** “golden” decklists (e.g. one tokens, one graveyard, one control, one with known edge cases).
- For each, define 1–2 expected behaviors, e.g.:
  - “Must not suggest cards already in deck.”
  - “Must not invent oracle text (e.g. Void Maw ability).”
  - “Must include at least one synergy chain.”
  - “ADD/CUT must be parseable by validator.”

Run these periodically (e.g. from admin ai-test or a script) and track:

- Pass/fail per check.
- Validator issues (e.g. `issues.length`, `needsRegeneration`).

---

## How to run

- **Admin ai-test:** Use existing batch flow; add optional “golden deck” mode that runs a fixed list of deck IDs or pasted lists and asserts the checks above (or logs results for manual review).
- **Script:** Small Node/TS script that calls `/api/deck/analyze` for each golden deck, parses response, and checks:
  - No ADD card in deck list.
  - No off-color ADD (if Commander).
  - At least one synergy chain in `analysis` text.
  - No validator errors for “add_already_in_deck” / “off_color” in the *final* returned analysis (or repair notice present when strips occurred).

---

## Goal

When you change BASE v2 or validator logic, run the golden set. If a check that used to pass starts failing, you’ve caught a regression before users do.
