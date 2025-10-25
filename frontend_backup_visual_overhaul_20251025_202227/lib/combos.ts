export type Combo = { commander?: string; archetype?: string; pieces: string[]; line: string; note?: string };

export const COMBOS: Combo[] = [
  { commander: "Atraxa, Praetors' Voice", pieces: ["Deepglow Skate", "Planeswalker"], line: "Proliferate to ultimate quickly.", note: "Proliferate engines snowball." },
  { commander: "Korvold, Fae-Cursed King", pieces: ["Treasure", "Mayhem Devil"], line: "Sac treasure, ping board, draw cards.", note: "Token treasures enable loops." },
  { commander: "Muldrotha, the Gravetide", pieces: ["Strip Mine", "Ramunap Excavator"], line: "Replay land destruction each turn.", note: "Lock via recursion." },
  { commander: "Feather, the Redeemed", pieces: ["Defiant Strike", "Guttersnipe"], line: "Pump/cantrip each turn, burn via pingers.", note: "Cheap cantrips recycle." },
  { commander: "Edgar Markov", pieces: ["Vampire", "Sac outlet"], line: "Eminence floods board; sac loops enable drains.", note: "Aristocrats shell." },
  { commander: "Urza, Lord High Artificer", pieces: ["Winter Orb", "Stax"], line: "Stax locks while Urza taps artifacts for blue.", note: "Prison plan." },
  { commander: "Kinnan, Bonder Prodigy", pieces: ["Basalt Monolith", "Dramatic Reversal"], line: "Infinite mana into creature tops.", note: "cEDH line." },
  { commander: "Golos, Tireless Pilgrim", pieces: ["Field of the Dead", "Ramp"], line: "Field trigger swarms with 7+ lands types.", note: "Field engine." },
];

export function combosFor(query: { commander?: string; archetype?: string }, limit = 3): Combo[] {
  const name = (query.commander || "").toLowerCase();
  const arch = (query.archetype || "").toLowerCase();
  const hits = COMBOS.filter(c => (!name || (c.commander||"").toLowerCase().includes(name)) && (!arch || (c.archetype||"").toLowerCase().includes(arch)));
  return hits.slice(0, limit);
}