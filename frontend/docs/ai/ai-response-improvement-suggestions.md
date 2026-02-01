# AI Response Improvement Suggestions

Suggestions to improve AI response quality for ManaTap, based on current best practices (OpenAI accuracy guide, RAG/few-shot research) and your existing setup.

---

## Meta-observation

You cannot prompt your way out of weaker models. The right response to model variance is:

- **Normalizing behavior** with few-shot (format anchoring).
- **Bounding damage** with validators (already-in-deck, off-color, invented cards).
- **Differentiating tiers** honestly (Guest / Free / Pro models and limits).
- **Measuring** fallback rates and prompt_path so you know when composition fails.

---

## 1. **Extend few-shot to streaming chat** — ✅ Implemented

**Current:** Few-shot was only in the non-stream chat route; stream is the primary UX, so same user + same query could get different quality (accidental forked behavior).

**Done:** Stream route now injects `findSimilarExamples(text, undefined, undefined, 2)` and `formatExamplesForPrompt(examples)` for logged-in users, with try/catch so stream remains reliable if search fails. Few-shot is format anchoring, not knowledge; 1–2 examples don’t meaningfully increase hallucination risk.

---

## 2. **Exemplars in composed deck analysis** — ✅ Implemented (tiny layer)

**Constraint:** Keep exemplars **tiny**; never mix into BASE rule text. Put them in a **separate layer** (or clearly delimited section), skimmable and ignorable by stronger models. If exemplars exceed ~10–12 lines total, you’ve gone too far.

**Done:** New layer `DECK_ANALYSIS_EXEMPLARS` (~10 lines): one archetype line, one ADD/CUT, one synergy chain. Composed only when `kind === 'deck_analysis'`; see `composeSystemPrompt` and migration `033_deck_analysis_exemplars_layer.sql`. Think of it as showing **posture**, not teaching content.

---

## 3. **RAG-lite for card/rules context** — Cautious scope

**Current:** Deck analysis gets the decklist and format; validation uses Scryfall cache. The model does not receive retrieved oracle text, which can lead to invented text (e.g. Void Maw ability).

**Risks if RAG is too broad:** Token bloat, attention dilution, models parroting oracle text instead of reasoning. RAG should be **corrective**, not foundational; it should align with thin prompt / thick validator.

**Recommended scope:**

- **Do not RAG the entire deck.**
- Start with **only cards the model mentions by name in ADD lines**, or even stricter: **only for new cards not in the deck**. That way RAG corrects suggested-card text without turning the analysis into a rules citation engine.
- Retrieve oracle text (and maybe type line) for that small set; inject a short “REFERENCE: Card text” block. Keep it concise.

---

## 4. **Structured output for deck analysis** — Phase 2, not urgent

**Current:** Deck analysis returns free-form text; you parse ADD/CUT with regex and validate with `validateRecommendations`. You already extract ADD/CUT reliably.

**Recommendation:** Treat structured output (JSON schema, `response_format`) as **Phase 2, after BASE v2 + validators settle**. Mapping, partial failures, and regeneration logic make this non-trivial. Don’t over-rotate too early; revisit when the prompt and validator stack is stable.

---

## 5. **Eval set and iteration loop**

**Principle:** Not “did this feel better?” but “did it stop ADD-already-in-deck?”, “did it stop illegal colors?”, “did chains survive cleanup?” Keep the eval set **small and cruel**, not comprehensive.

**See:** [eval-set-discipline.md](./eval-set-discipline.md) for pass/fail checks, golden decklist discipline, and how to run (admin ai-test or script). You’re already halfway there with admin ai-test; the doc adds the discipline to avoid prompt regressions when you tweak BASE v2.

---

## 6. **Regeneration / handoff UX** — ✅ Implemented

**Current:** The system fixes invalid suggestions (validator strips blocks), but the user had no idea repair happened, which could create mistrust when output felt thin or oddly cautious.

**Done:** When the validator strips any block (`valResult.issues.length > 0`), we now append to the analysis text: “Some suggestions were removed because they weren’t valid for this deck. You can run analysis again for a fresh set.” This explains why output might feel conservative, reinforces that correctness is enforced, and gives users permission to regenerate without shame. Optionally add a “Regenerate” button in the UI that re-runs analysis.

---

## 7. **Prompt hygiene (already aligned)**

You already do several things well:

- **Thin prompt / thick validator:** Prompts set expectations; code enforces legality, “already in deck,” and format. Keep this.
- **Clear instructions and template:** BASE has REQUIRED OUTPUT TEMPLATE and evidence/synergy rules.
- **Instrumentation:** prompt_path, fallback rate, and ai_usage give you data to reduce fallbacks and debug.
- **Pro deck-analysis model:** Using a stronger model (e.g. gpt-4o) for deck analysis improves reasoning and reduces mistakes like wrong oracle text.

No major change needed here; small tweaks (e.g. one more line in BASE like “Before suggesting ADD X, confirm X is not already in the decklist”) are already in place.

---

## Priority overview

| # | Suggestion                         | Status / note |
|---|------------------------------------|----------------|
| 1 | Few-shot in chat stream            | ✅ Done        |
| 2 | Exemplars in composed deck analysis| ✅ Done (tiny layer) |
| 3 | RAG-lite (oracle text) for deck    | Cautious: only ADD-mentioned or new cards; corrective, not foundational |
| 4 | Structured output for deck         | Phase 2; after BASE v2 + validators settle |
| 5 | Eval set + automated runs          | See [eval-set-discipline.md](./eval-set-discipline.md) |
| 6 | Regeneration / handoff UX          | ✅ Done (repair notice appended when strips occur) |
