import assert from "node:assert/strict";
import { normalizeGenerationBody, buildGenerationUserPrompt } from "@/lib/deck/generation-input";

const chaosInput = normalizeGenerationBody({
  commander: "Muldrotha, the Gravetide",
  format: "Commander",
  generationIntent: "quiz_build",
  collectionOwnershipMode: "mostly_collection",
  playstyle:
    "Playstyle vibe: Chaos Gremlin. Quiz profile: Chaos Gremlin. Quiz answers: aggro, premium, chaos, tribal, rogue_coherent.",
  powerLevel: "Optimized",
  budget: "High",
});

const controlInput = normalizeGenerationBody({
  commander: "Muldrotha, the Gravetide",
  format: "Commander",
  generationIntent: "quiz_build",
  collectionOwnershipMode: "mostly_collection",
  playstyle:
    "Playstyle vibe: Calculated Control. Quiz profile: Calculated Control. Quiz answers: control, premium, heavy, spells, meta_safe.",
  powerLevel: "Focused",
  budget: "High",
});

const chaosPrompt = buildGenerationUserPrompt(chaosInput, "1 Sol Ring");
const controlPrompt = buildGenerationUserPrompt(controlInput, "1 Sol Ring");

assert.match(chaosPrompt, /PLAYSTYLE DIVERGENCE/);
assert.match(controlPrompt, /PLAYSTYLE DIVERGENCE/);
assert.match(chaosPrompt, /Chaos\/aggro profile/);
assert.match(controlPrompt, /Control profile/);
assert.doesNotMatch(chaosPrompt, /Control profile:/);
assert.doesNotMatch(controlPrompt, /Chaos\/aggro profile:/);

console.log("playstyle-prompt-divergence.test.ts: ok");
