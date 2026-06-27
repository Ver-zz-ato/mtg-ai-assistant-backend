import assert from "node:assert/strict";
import {
  deriveConstructedArchetypeFromQuizAnswers,
  deriveConstructedBudgetFromQuizAnswers,
  deriveConstructedDirectionFromQuizAnswers,
  deriveConstructedPowerFromQuizAnswers,
  getConstructedQuizQuestions,
  isConstructedFormat,
  toConstructedBudget,
  toConstructedPower,
} from "@/lib/build/collectionConstructedPayload";

assert.equal(isConstructedFormat("Commander"), false);
assert.equal(isConstructedFormat("Modern"), true);

assert.equal(toConstructedBudget("Budget"), "budget");
assert.equal(toConstructedBudget("Moderate"), "balanced");
assert.equal(toConstructedBudget("High"), "premium");

assert.equal(toConstructedPower("Casual"), "casual");
assert.equal(toConstructedPower("Focused"), "strong");
assert.equal(toConstructedPower("Optimized"), "competitive");
assert.equal(toConstructedPower("Competitive"), "competitive");

assert.equal(getConstructedQuizQuestions("Modern").at(-1)?.text, "How should this handle Modern's speed?");
assert.equal(getConstructedQuizQuestions("Pauper").at(-1)?.text, "How should this use Pauper's commons pool?");

const budgetAnswers = {
  pace: "value",
  budget: "budget",
  interaction: "moderate",
  complexity: "medium",
  theme: "graveyard",
  avoid: "expensive_staples",
  metagame: "proven_twist",
};

assert.equal(deriveConstructedDirectionFromQuizAnswers(budgetAnswers), "budget");
assert.equal(deriveConstructedBudgetFromQuizAnswers(budgetAnswers), "Budget");
assert.equal(deriveConstructedPowerFromQuizAnswers(budgetAnswers), "Casual");
assert.equal(deriveConstructedArchetypeFromQuizAnswers("Pioneer", budgetAnswers), "Pioneer graveyard");

const competitiveAnswers = {
  pace: "combo",
  budget: "premium",
  interaction: "heavy",
  complexity: "complex",
  theme: "spells",
  avoid: "draw_go",
  metagame: "meta_safe",
};

assert.equal(deriveConstructedDirectionFromQuizAnswers(competitiveAnswers), "competitive");
assert.equal(deriveConstructedBudgetFromQuizAnswers(competitiveAnswers), "High");
assert.equal(deriveConstructedPowerFromQuizAnswers(competitiveAnswers), "Competitive");
assert.equal(deriveConstructedArchetypeFromQuizAnswers("Modern", competitiveAnswers), "Modern spells");

console.log("collection-constructed-payload tests OK");
