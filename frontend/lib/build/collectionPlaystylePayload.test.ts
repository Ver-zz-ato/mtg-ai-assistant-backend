import assert from "node:assert/strict";
import {
  buildCollectionPlaystyleLine,
  buildGenerateFromCollectionBody,
  quizBudgetToApiBudget,
} from "./collectionPlaystylePayload";

assert.equal(quizBudgetToApiBudget("spend"), "High");
assert.equal(quizBudgetToApiBudget("budget"), "Budget");

const line = buildCollectionPlaystyleLine({
  profileLabel: "Chaos Gremlin",
  quizAnswers: { pace: "aggro", budget: "spend" },
});
assert.match(line, /Quiz profile: Chaos Gremlin/);
assert.match(line, /Quiz answers:/);

const body = buildGenerateFromCollectionBody({
  collectionId: "00000000-0000-4000-8000-000000000001",
  commander: "Muldrotha, the Gravetide",
  profileLabel: "Value Engine",
  quizAnswers: { a: "value", b: "mid" },
  fromQuiz: true,
  powerLevel: "Mid",
  budget: "Moderate",
});
assert.equal(body.generationIntent, "quiz_build");
assert.equal(body.collectionOwnershipMode, "mostly_collection");
assert.ok(body.playstyle?.includes("Quiz profile"));

console.log("collectionPlaystylePayload.test.ts: ok");
