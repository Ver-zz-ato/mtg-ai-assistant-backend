import {
  parseAiDeckOutputLines,
  aggregateCards,
  totalDeckQty,
  trimDeckToMaxQty,
  extractChatCompletionContent,
} from "@/lib/deck/generation-helpers";
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

const bare = "Sol Ring\nCommand Tower\nArcane Signet";
const p5 = parseAiDeckOutputLines(bare);
assert.equal(p5.length, 3);
assert.equal(p5[0]?.qty, 1);
assert.equal(p5[0]?.name, "Sol Ring");

// 1 + 35 + 64 = 100 physical cards but 66 rows — validators must use totalDeckQty, not row count
const p6b = parseAiDeckOutputLines(
  "1 Krenko, Mob Boss\n35 Mountain\n" + Array.from({ length: 64 }, (_, i) => `1 Goblin ${i}`).join("\n")
);
const a6 = aggregateCards(p6b);
assert.equal(a6.length, 66, "66 unique rows");
assert.equal(totalDeckQty(a6), 100, "100 physical cards with grouped Mountain");
const trimmed = trimDeckToMaxQty(
  [
    { name: "Forest", qty: 50 },
    { name: "Bear", qty: 60 },
  ],
  100
);
assert.equal(totalDeckQty(trimmed), 100);
assert.equal(trimmed[0]?.qty, 50);
assert.equal(trimmed[1]?.qty, 50);

assert.equal(
  extractChatCompletionContent({
    choices: [{ message: { content: [{ text: "1 Sol Ring\n1 Mountain" }] } }],
  }),
  "1 Sol Ring\n1 Mountain"
);
assert.equal(
  extractChatCompletionContent({ choices: [{ message: { content: "plain" } }] }),
  "plain"
);

console.log("parse-ai-deck-output-lines.test.ts passed");
