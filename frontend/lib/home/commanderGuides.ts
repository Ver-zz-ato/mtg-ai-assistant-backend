export type CommanderGuideEntry = {
  slug: string;
  name: string;
  colors: string;
  /** Short line for rotating homepage pill */
  coverage: string;
};

/** Flagship commander guides surfaced on homepage rotator + SEO strip */
export const FLAGSHIP_COMMANDER_GUIDES: CommanderGuideEntry[] = [
  {
    slug: "edgar-markov",
    name: "Edgar Markov",
    colors: "WBR",
    coverage: "Vampire aggro staples, budget upgrades, and mulligan keep standards.",
  },
  {
    slug: "the-ur-dragon",
    name: "The Ur-Dragon",
    colors: "WUBRG",
    coverage: "Five-color ramp, dragon payoffs, and budget mana fixing.",
  },
  {
    slug: "atraxa-praetors-voice",
    name: "Atraxa, Praetors' Voice",
    colors: "WUBG",
    coverage: "Proliferate engines, best cards, and slower value builds.",
  },
  {
    slug: "krenko-mob-boss",
    name: "Krenko, Mob Boss",
    colors: "R",
    coverage: "Goblin swarm lines, combo pieces, and budget token makers.",
  },
  {
    slug: "kaalia-of-the-vast",
    name: "Kaalia of the Vast",
    colors: "WBR",
    coverage: "Big cheat targets, protection, and mulligan priorities.",
  },
  {
    slug: "muldrotha-the-gravetide",
    name: "Muldrotha, the Gravetide",
    colors: "UBG",
    coverage: "Graveyard loops, best permanents, and budget enablers.",
  },
];
