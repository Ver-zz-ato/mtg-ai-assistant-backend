/**
 * Test mutation generator for AI test suite.
 * Creates deterministic edge-case variants from existing test cases.
 */

export type MutationType =
  | "missing_commander"
  | "messy_decklist"
  | "contradictory_budget"
  | "format_omitted"
  | "typos_decklist"
  | "reordered_lines"
  | "duplicated_entries"
  | "near_miss_card"
  | "irrelevant_chatter"
  | "empty_user_message";

export type MutatedTestCase = {
  name: string;
  type: "chat" | "deck_analysis";
  input: any;
  expectedChecks?: any;
  tags: string[];
  mutationType: MutationType;
  meta?: Record<string, unknown>;
};

const NEAR_MISS_CARDS: Record<string, string> = {
  "Sol Ring": "Sol Ringe",
  "Arcane Signet": "Arcane Sign",
  "Cultivate": "Cultivates",
  "Kodama's Reach": "Kodamas Reach",
  "Rhystic Study": "Rhystic Stud",
  "Smothering Tithe": "Smother Tithe",
  "Cyclonic Rift": "Cyclonic Rifts",
};

function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (seed + i * 31) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function generateMutations(
  testCase: {
    id?: string;
    name: string;
    type: "chat" | "deck_analysis";
    input: any;
    expectedChecks?: any;
    tags?: string[];
  },
  mutationTypes: MutationType[],
  countPerType: number = 1
): MutatedTestCase[] {
  const results: MutatedTestCase[] = [];
  const baseTags = [...(testCase.tags || []), "mutation"];

  for (const mutType of mutationTypes) {
    for (let i = 0; i < countPerType; i++) {
      const seed = (testCase.id || testCase.name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) + mutType.length + i;
      const mutated = applyMutation(testCase, mutType, seed, i);
      if (mutated) {
        results.push({
          ...mutated,
          tags: [...baseTags, `mutation:${mutType}`],
          mutationType: mutType,
        });
      }
    }
  }

  return results;
}

function applyMutation(
  testCase: { name: string; type: string; input: any; expectedChecks?: any },
  mutType: MutationType,
  seed: number,
  index: number
): MutatedTestCase | null {
  const input = JSON.parse(JSON.stringify(testCase.input || {}));

  switch (mutType) {
    case "missing_commander":
      if (testCase.type === "deck_analysis" && (input.commander || input.deckText?.includes("Commander"))) {
        const mutated = { ...input, commander: undefined };
        if (input.deckText) {
          mutated.deckText = input.deckText.replace(/^1\s+[\w\s',.-]+\s*$/m, "").trim();
        }
        return {
          name: `${testCase.name} [mutation: missing_commander]`,
          type: testCase.type as "deck_analysis",
          input: mutated,
          expectedChecks: testCase.expectedChecks,
          tags: [],
          mutationType: mutType,
          meta: { originalCommander: input.commander },
        };
      }
      return null;

    case "messy_decklist":
      if (testCase.type === "deck_analysis" && input.deckText) {
        const lines = input.deckText.split(/\r?\n/).filter((l: string) => l.trim());
        const messed = lines.map((l: string) => l.replace(/\s+/, "  ").trim()).join("\n");
        return {
          name: `${testCase.name} [mutation: messy_decklist]`,
          type: testCase.type as "deck_analysis",
          input: { ...input, deckText: messed },
          expectedChecks: testCase.expectedChecks,
          tags: [],
          mutationType: mutType,
        };
      }
      return null;

    case "contradictory_budget":
      if (input.userMessage || input.deckText) {
        const extra = " I want to keep it under $20 total but also need the best cards.";
        return {
          name: `${testCase.name} [mutation: contradictory_budget]`,
          type: testCase.type as "chat" | "deck_analysis",
          input: {
            ...input,
            userMessage: (input.userMessage || "Analyze this deck.") + extra,
          },
          expectedChecks: testCase.expectedChecks,
          tags: [],
          mutationType: mutType,
        };
      }
      return null;

    case "format_omitted":
      if (input.format) {
        const { format, ...rest } = input;
        return {
          name: `${testCase.name} [mutation: format_omitted]`,
          type: testCase.type as "chat" | "deck_analysis",
          input: rest,
          expectedChecks: { ...testCase.expectedChecks, formatSpecific: true },
          tags: [],
          mutationType: mutType,
        };
      }
      return null;

    case "typos_decklist":
      if (testCase.type === "deck_analysis" && input.deckText) {
        let text = input.deckText;
        text = text.replace(/Sol Ring/g, "Sol Rign");
        text = text.replace(/Cultivate/g, "Cultivte");
        return {
          name: `${testCase.name} [mutation: typos_decklist]`,
          type: testCase.type as "deck_analysis",
          input: { ...input, deckText: text },
          expectedChecks: testCase.expectedChecks,
          tags: [],
          mutationType: mutType,
        };
      }
      return null;

    case "reordered_lines":
      if (testCase.type === "deck_analysis" && input.deckText) {
        const lines = input.deckText.split(/\r?\n/).filter((l: string) => l.trim());
        const shuffled = deterministicShuffle(lines, seed);
        return {
          name: `${testCase.name} [mutation: reordered_lines]`,
          type: testCase.type as "deck_analysis",
          input: { ...input, deckText: shuffled.join("\n") },
          expectedChecks: testCase.expectedChecks,
          tags: [],
          mutationType: mutType,
        };
      }
      return null;

    case "duplicated_entries":
      if (testCase.type === "deck_analysis" && input.deckText) {
        const lines = input.deckText.split(/\r?\n/).filter((l: string) => l.trim());
        const dupIdx = seed % Math.max(1, lines.length);
        const duplicated = [...lines, lines[dupIdx]];
        return {
          name: `${testCase.name} [mutation: duplicated_entries]`,
          type: testCase.type as "deck_analysis",
          input: { ...input, deckText: duplicated.join("\n") },
          expectedChecks: testCase.expectedChecks,
          tags: [],
          mutationType: mutType,
        };
      }
      return null;

    case "near_miss_card":
      if (testCase.type === "deck_analysis" && input.deckText) {
        let text = input.deckText;
        for (const [real, nearMiss] of Object.entries(NEAR_MISS_CARDS)) {
          if (text.includes(real) && seed % 2 === 0) {
            text = text.replace(real, nearMiss);
            break;
          }
        }
        if (text === input.deckText) return null;
        return {
          name: `${testCase.name} [mutation: near_miss_card]`,
          type: testCase.type as "deck_analysis",
          input: { ...input, deckText: text },
          expectedChecks: { ...testCase.expectedChecks, requireNoHallucinatedCards: true },
          tags: [],
          mutationType: mutType,
        };
      }
      return null;

    case "irrelevant_chatter":
      if (input.userMessage) {
        const chatter = " So anyway, my friend said that blue is the best color. What do you think? ";
        return {
          name: `${testCase.name} [mutation: irrelevant_chatter]`,
          type: testCase.type as "chat" | "deck_analysis",
          input: {
            ...input,
            userMessage: chatter + (input.userMessage || ""),
          },
          expectedChecks: testCase.expectedChecks,
          tags: [],
          mutationType: mutType,
        };
      }
      return null;

    case "empty_user_message":
      return {
        name: `${testCase.name} [mutation: empty_user_message]`,
        type: testCase.type as "chat" | "deck_analysis",
        input: { ...input, userMessage: "" },
        expectedChecks: testCase.expectedChecks,
        tags: [],
        mutationType: mutType,
      };
  }

  return null;
}
