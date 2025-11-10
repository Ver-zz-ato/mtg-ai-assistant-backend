export type CommanderProfile = {
  mustBePermanent?: boolean;
  bannedCards?: string[];
  preferTags?: string[];
};

export const COMMANDER_PROFILES: Record<string, CommanderProfile> = {
  "Henzie 'Toolbox' Torre": {
    mustBePermanent: true,
    preferTags: ["etb", "dies", "big-creatures", "permanent"],
  },
  "Lord Windgrace": {
    preferTags: ["lands", "landfall", "graveyard", "recursion"],
  },
};

