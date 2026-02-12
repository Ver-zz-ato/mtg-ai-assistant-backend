/**
 * Commander archetype definitions for discovery authority hubs.
 * tagMatches maps to commander preferTags for overlap matching.
 */

export type ArchetypeDef = {
  slug: string;
  title: string;
  tagMatches: string[];
  intro: string; // 400-700 word template
};

export const ARCHETYPES: ArchetypeDef[] = [
  {
    slug: "dragons",
    title: "Dragon Tribal",
    tagMatches: ["dragons"],
    intro: `Dragon tribal is one of the most beloved Commander archetypes. Players love building around massive flying creatures that dominate the board and close games with raw power. Dragon decks typically ramp aggressively to cast expensive threats, use cost reducers like Dragonspeaker Shaman or Sarkhan the Masterless, and protect the board with haste enablers like Fires of Yavimaya or Dragon Tempest.

The best dragon commanders offer immediate value: The Ur-Dragon reduces costs and rewards attacking, Miirym doubles your key dragons, and Tiamat tutors for the perfect five. Treasure-producing dragons like Goldspan Dragon and Lozhan have become staples for mana acceleration. Anthem effects like Utvara Hellkite or Scourge of Valkas turn your board into a lethal engine.

Focus on a curve that lets you deploy threats consistently. Include board protection—counterspells, Heroic Intervention, or Teferi's Protection—since your creatures are high-value targets. Mana rocks and ramp spells are essential; you need to reach six or seven mana reliably. Dragon tribal rewards commitment: the more dragons you run, the better your synergies.`,
  },
  {
    slug: "aristocrats",
    title: "Aristocrats",
    tagMatches: ["aristocrats"],
    intro: `Aristocrats decks win by sacrificing creatures for value. The name comes from Falkenrath Aristocrat and Cartel Aristocrat—cards that sacrifice creatures for resilience and damage. The archetype combines sacrifice outlets, token makers, and death triggers to drain opponents or generate overwhelming value.

Teysa Karlov doubles death triggers; Teysa Orzhov Scion clears boards and makes tokens. Edgar Markov and Elenda create vampire tokens that fuel sacrifice. The key is redundancy: multiple sacrifice outlets (Viscera Seer, Carrion Feeder, Phyrexian Altar) and multiple payoffs (Blood Artist, Zulaport Cutthroat, Bastion of Remembrance).

Aristocrats decks are resilient to board wipes—your creatures dying often advances your plan. They punish removal-heavy metas and can win through combat or combo. Include recursion (Reanimate, Patriarch's Bidding) to recover from grave hate. The archetype rewards tight sequencing: make tokens, sac them, drain, repeat.`,
  },
  {
    slug: "treasure",
    title: "Treasure",
    tagMatches: ["treasure"],
    intro: `Treasure decks use artifact tokens for mana acceleration and value. Treasure has become a major theme in Commander, with cards like Smothering Tithe, Dockside Extortionist, and Pitiless Plunderer generating massive amounts of mana. Commanders like Magda and Prosper reward you for making and sacrificing treasures.

The archetype thrives on synergy: treasure creators, treasure payoffs, and artifact-centric strategies. Old Gnawbone, Goldspan Dragon, and Kalain turn combat or spells into treasures. Grim Hireling and Sailor's Bane convert treasures into card advantage or pressure. Pitiless Plunderer turns death into mana, enabling loops with sacrifice outlets.

Treasure decks scale well into the late game. You can ramp into big spells, abuse artifact synergies like Urza or Emry, or pivot into combo. Include ways to sacrifice treasures for value beyond mana—draw, ping, or recursion. The archetype is flexible and powerful in most metas.`,
  },
  {
    slug: "spellslinger",
    title: "Spellslinger",
    tagMatches: ["spellslinger"],
    intro: `Spellslinger decks win through noncreature spells—instants, sorceries, and sometimes planeswalkers. They avoid combat where possible and leverage storm, burn, or value engines to outpace opponents. Commanders like Kess, Mizzix, and Vadrik reduce spell costs or provide recursion.

The archetype rewards low-curve, instant-speed interaction. Cantrips, rituals, and card draw fuel the engine. Young Pyromancer and Talrand create tokens from spells. Aetherflux Reservoir and Guttersnipe convert spells into damage. Some builds focus on storm or combo; others on control and incremental value.

Spellslinger decks are weak to spell-based disruption and stax. Include protection for your engine—counterspells, Defense Grid, or Grand Abolisher. Mana rocks and ritual effects help you go off in one turn. The archetype is skill-intensive but very rewarding for players who enjoy casting many spells per turn.`,
  },
  {
    slug: "elfball",
    title: "Elfball",
    tagMatches: ["elves"],
    intro: `Elfball is an elf tribal strategy that goes wide with tokens and overruns opponents. Lathril, Marwyn, and Ezuri lead armies of elves that generate mana, draw cards, and swing for lethal. The archetype is fast, linear, and explosive—typical of elf strategies across formats.

Elf commanders provide different angles: Lathril makes tokens and can win with her ability; Marwyn scales with your elf count for mana; Ezuri pumps the team. Include mana dorks (Llanowar Elves, Elvish Mystic), token makers (Growing Rites of Itlimoc, Imperious Perfect), and overrun effects (Craterhoof Behemoth, End-Raze Forerunners).

Elfball is vulnerable to board wipes and spot removal on key pieces. Include recursion (Eternal Witness, Regrowth) and protection (Heroic Intervention, Wrap in Vigor). The deck can win as early as turn five or six with a strong draw. It rewards aggressive mulligans and tight sequencing.`,
  },
  {
    slug: "tokens",
    title: "Tokens",
    tagMatches: ["tokens"],
    intro: `Token strategies flood the board with creature tokens and win through combat, sacrifice, or anthem effects. Commanders like Rhys the Redeemed, Krenko, and Edgar Markov double tokens or create armies from other actions. The archetype is flexible: go wide for combat, sacrifice for value, or scale with +1/+1 counters.

Token decks need three ingredients: token producers, token doublers, and payoffs. Anointed Procession, Doubling Season, and Parallel Lives amplify your output. Secure the Wastes, Finale of Glory, and March of the Multitudes create bursts of tokens. Anthems (Cathars' Crusade, Dictate of Heliod) turn tokens into threats.

The archetype is weak to board wipes—include ways to recover or protect your board. Teferi's Protection, Heroic Intervention, or Make a Stand can save you. Recursion like Second Sunrise or Faith's Reward can rebuild. Token strategies scale well and can win through pure numbers or synergies.`,
  },
  {
    slug: "sacrifice",
    title: "Sacrifice",
    tagMatches: ["sacrifice"],
    intro: `Sacrifice decks use creatures as resources. Sacrifice outlets convert creatures into value—card draw, mana, recursion, or damage. Commanders like Korvold, Prossh, and Yawgmoth turn sacrifice into engine pieces. The archetype overlaps with aristocrats but emphasizes outlets and recursion over death triggers.

Sacrifice decks need outlets (Viscera Seer, Carrion Feeder, Ashnod's Altar), fodder (tokens, recursive creatures), and payoffs. Korvold draws cards; Prossh makes tokens; Yawgmoth drains and proliferates. The deck can combo with persist creatures, Phyrexian Altar, or graveyard recursion.

Include recursion to rebuild after removal. Graveyard hate hurts, so diversify your plan. Sacrifice strategies reward tight sequencing and understanding of the stack. The archetype is powerful in metas that allow graveyard strategies and can win through combat or combo.`,
  },
  {
    slug: "reanimator",
    title: "Reanimator",
    tagMatches: ["reanimator", "reanimation"],
    intro: `Reanimator decks put creatures into the graveyard and return them to the battlefield cheaply. You cheat on mana by reanimating huge threats for a fraction of their cost. Muldrotha, Meren, and Sauron are classic reanimator commanders that recur creatures from the yard.

The archetype needs discard or mill (Faithless Looting, Stitcher's Supplier), reanimation spells (Reanimate, Animate Dead, Reanimate), and targets (big creatures, utility creatures, combo pieces). Entomb and Buried Alive tutor for the perfect reanimation target.

Reanimator is vulnerable to graveyard hate. Include ways to protect or rebuild—counterspells, alternative wincons, or recursion that doesn't rely on the yard. The archetype can win quickly with a strong opener or grind through interaction. It rewards knowing your deck's key lines and sequencing.`,
  },
  {
    slug: "artifacts",
    title: "Artifacts",
    tagMatches: ["artifacts"],
    intro: `Artifact decks build around artifact synergies—mana rocks, recursive pieces, and payoff creatures. Breya, Osgir, and Urza lead artifact-centric strategies that ramp, draw, and combo. The archetype is highly customizable: stax, combo, or value.

Artifact commanders provide different angles: Breya sacrifices artifacts for value; Osgir copies and recurs; Urza turns artifacts into mana and card advantage. Include mana rocks (Sol Ring, Mana Crypt, Mind Stone), artifact creatures (Etherium Sculptor, Sai), and payoffs (Kuldotha Forgemaster, Mindslaver).

Artifact decks are weak to mass artifact removal (Vandalblast, Bane of Progress). Include protection or recursion. The archetype is one of the most combo-dense in Commander—many artifact combos can win on the spot. Know your lines and protect your engines.`,
  },
  {
    slug: "enchantress",
    title: "Enchantress",
    tagMatches: ["enchantments", "enchantress"],
    intro: `Enchantress decks draw cards from playing enchantments and build a resilient board of permanents. Sythis, Tuvasa, and Estrid lead enchantment-focused strategies that outvalue opponents through card draw and hard-to-remove permanents.

The archetype centers on enchantress effects—creatures that draw when you cast enchantments. Sythis, Eidolon of Blossoms, and Setessan Champion provide the engine. Ramp with Wild Growth and Utopia Sprawl; protect with Sterling Grove and Greater Auramancy. Win with Sigil of the Empty Throne, Hallowed Haunting, or voltron.

Enchantress is weak to mass enchantment removal and board wipes. Include recursion (Replenish, Open the Vaults) and protection. The deck is grindy and rewards patience. It can win through incremental value or combo with cards like Solemnity and Decree of Silence.`,
  },
];

export function getArchetypeBySlug(slug: string): ArchetypeDef | null {
  return ARCHETYPES.find((a) => a.slug === slug) ?? null;
}

export function getAllArchetypeSlugs(): string[] {
  return ARCHETYPES.map((a) => a.slug);
}
