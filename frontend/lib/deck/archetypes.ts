export type CommanderProfile = {
  mustBePermanent?: boolean;
  bannedCards?: string[];
  preferTags?: string[];
  archetypeHint?: string;
};

export const COMMANDER_PROFILES: Record<string, CommanderProfile> = {
  "Henzie 'Toolbox' Torre": {
    mustBePermanent: true,
    preferTags: ["etb", "dies", "big-creatures", "permanent"],
    archetypeHint: "Blitz sacrifice deck; lean on hasty permanents and death triggers, avoid slow control spells that stay in hand.",
  },
  "Lord Windgrace": {
    preferTags: ["lands", "landfall", "graveyard", "recursion"],
    archetypeHint: "Lands-matter graveyard strategy; emphasise land recursion and value engines over random creature beaters.",
  },
  "Muldrotha, the Gravetide": {
    preferTags: ["graveyard", "permanents", "recursion"],
    archetypeHint: "Permanent-based recursion; keep cards that replay from the graveyard and avoid exile effects that remove your own resources.",
  },
  "Giada, Font of Hope": {
    preferTags: ["angels", "tribal", "counter"],
    archetypeHint: "Mono-white Angel tribal; prioritise Angel creatures and anthem effects, avoid off-tribe filler unless it directly supports Angels.",
  },
};

