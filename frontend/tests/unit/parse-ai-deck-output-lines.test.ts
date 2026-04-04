import { parseAiDeckOutputLines, aggregateCards } from "@/lib/deck/generation-helpers";
import assert from "node:assert";

function lines(n: number): string {
  return Array.from({ length: n }, (_, i) => `${i + 1}. Test Card ${i + 1}`).join("\n");
}

const numbered = lines(100);
const parsed = parseAiDeckOutputLines(numbered);
assert.equal(parsed.length, 100, "numbered list should yield 100 rows");
assert.equal(parsed[0]?.name, "Test Card 1");
assert.equal(parsed[0]?.qty, 1);

const standard = "1 Sol Ring\n4x Forest\n2 Command Tower";
const p2 = parseAiDeckOutputLines(standard);
assert.equal(p2.length, 3);
assert.deepEqual(
  aggregateCards(p2).map((c) => c.name),
  ["Sol Ring", "Forest", "Command Tower"]
);
assert.equal(aggregateCards(p2).find((c) => c.name === "Forest")?.qty, 4);

const fenced = 'Intro line\n```\n1. Alpha\n2. Beta\n```\n';
const p3 = parseAiDeckOutputLines(fenced);
assert.equal(p3.length, 2);
assert.equal(p3[0]?.name, "Alpha");

const bullets = "- 1 Lightning Bolt\n- 2 Mountain";
const p4 = parseAiDeckOutputLines(bullets);
assert.equal(p4.length, 2);
assert.equal(p4[0]?.qty, 1);

console.log("parse-ai-deck-output-lines.test.ts passed");
