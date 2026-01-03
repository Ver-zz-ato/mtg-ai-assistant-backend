// frontend/lib/quiz/commander-suggestions.ts
// Map playstyle profiles to commander suggestions

import { PlaystyleProfile } from './quiz-data';

export interface CommanderSuggestion {
  name: string;
  description: string;
  archetype: string;
}

export interface ArchetypeSuggestion {
  name: string;
  description: string;
  colorIdentities: string[];
}

// Commander suggestions by profile type
const COMMANDER_MAP: Record<string, CommanderSuggestion[]> = {
  'Calculated Control': [
    { name: 'Atraxa, Praetors\' Voice', description: 'Proliferate and planeswalkers for incremental advantage', archetype: 'Superfriends' },
    { name: 'Yuriko, the Tiger\'s Shadow', description: 'Ninjutsu tempo with top-deck manipulation', archetype: 'Tempo Control' },
    { name: 'Kess, Dissident Mage', description: 'Spellslinger control with graveyard recursion', archetype: 'Spellslinger' },
    { name: 'Thrasios, Triton Hero', description: 'Infinite mana outlet with card draw', archetype: 'Infinite Mana' },
    { name: 'Tymna the Weaver', description: 'Card advantage engine in the command zone', archetype: 'Value Control' },
    { name: 'Baral, Chief of Compliance', description: 'Counterspell tribal with cost reduction', archetype: 'Control' },
  ],
  'Chaos Gremlin': [
    { name: 'Krenko, Mob Boss', description: 'Explosive goblin tokens that multiply fast', archetype: 'Tokens' },
    { name: 'Zada, Hedron Grinder', description: 'One spell, infinite triggers', archetype: 'Spellslinger' },
    { name: 'Rakdos, Lord of Riots', description: 'Big creatures for free after damage', archetype: 'Big Mana' },
    { name: 'Norin the Wary', description: 'Chaos and confusion in every combat', archetype: 'Chaos' },
    { name: 'The Gitrog Monster', description: 'Land shenanigans and dredge combos', archetype: 'Lands' },
    { name: 'Krark, the Thumbless', description: 'Coin flips and spell copying chaos', archetype: 'Chaos' },
  ],
  'Value Engine': [
    { name: 'Meren of Clan Nel Toth', description: 'Recur creatures from graveyard every turn', archetype: 'Graveyard' },
    { name: 'Muldrotha, the Gravetide', description: 'Play anything from your graveyard', archetype: 'Graveyard' },
    { name: 'Chulane, Teller of Tales', description: 'Draw cards and ramp with every creature', archetype: 'Value' },
    { name: 'Korvold, Fae-Cursed King', description: 'Sacrifice for value and card draw', archetype: 'Aristocrats' },
    { name: 'Kenrith, the Returned King', description: 'Five-color toolbox with multiple abilities', archetype: 'Goodstuff' },
    { name: 'Tatyova, Benthic Druid', description: 'Landfall triggers for card draw and life', archetype: 'Lands' },
  ],
  'Table Politician': [
    { name: 'Breya, Etherium Shaper', description: 'Artifact synergies with multiple win conditions', archetype: 'Artifacts' },
    { name: 'Ghave, Guru of Spores', description: 'Tokens and counters with political plays', archetype: 'Tokens' },
    { name: 'Kenrith, the Returned King', description: 'Help others to help yourself', archetype: 'Politics' },
    { name: 'Queen Marchesa', description: 'Monarch mechanic encourages interaction', archetype: 'Politics' },
    { name: 'Kynaios and Tiro of Meletis', description: 'Group hug that benefits everyone', archetype: 'Group Hug' },
    { name: 'Phelddagrif', description: 'The original group hug commander', archetype: 'Group Hug' },
  ],
  'Combo Master': [
    { name: 'Kess, Dissident Mage', description: 'Cast spells from graveyard for combos', archetype: 'Combo' },
    { name: 'Thrasios, Triton Hero', description: 'Infinite mana outlet', archetype: 'Infinite Mana' },
    { name: 'Ghave, Guru of Spores', description: 'Infinite combos with tokens and counters', archetype: 'Combo' },
    { name: 'Najeela, the Blade-Blossom', description: 'Infinite combat steps', archetype: 'Combo' },
    { name: 'Gitrog Monster', description: 'Dakmor Salvage infinite draw combo', archetype: 'Combo' },
    { name: 'Zur the Enchanter', description: 'Tutor enchantments for combo pieces', archetype: 'Combo' },
  ],
  'Tactical Mind': [
    { name: 'Yuriko, the Tiger\'s Shadow', description: 'Ninjutsu and top-deck manipulation', archetype: 'Tempo' },
    { name: 'Edgar Markov', description: 'Vampire tokens with aggressive strategy', archetype: 'Aggro' },
    { name: 'Atraxa, Praetors\' Voice', description: 'Proliferate for incremental advantage', archetype: 'Control' },
    { name: 'Korvold, Fae-Cursed King', description: 'Resource management and value', archetype: 'Midrange' },
    { name: 'Breya, Etherium Shaper', description: 'Toolbox with multiple lines of play', archetype: 'Artifacts' },
    { name: 'The Ur-Dragon', description: 'Big dragons with cost reduction', archetype: 'Tribal' },
  ],
};

// Archetype suggestions by profile
const ARCHETYPE_MAP: Record<string, ArchetypeSuggestion[]> = {
  'Calculated Control': [
    { name: 'Superfriends', description: 'Planeswalkers that generate value and control the board', colorIdentities: ['WUBR', 'WUB', 'WU'] },
    { name: 'Spellslinger Control', description: 'Counterspells and card draw with win conditions', colorIdentities: ['UB', 'UR', 'U'] },
    { name: 'Stax', description: 'Resource denial and slow games', colorIdentities: ['WU', 'WB', 'WUB'] },
  ],
  'Chaos Gremlin': [
    { name: 'Tokens', description: 'Overwhelm with swarms of creatures', colorIdentities: ['WR', 'RG', 'W'] },
    { name: 'Chaos', description: 'Random effects and unpredictable games', colorIdentities: ['UR', 'R', 'UBR'] },
    { name: 'Big Mana', description: 'Ramp into massive threats', colorIdentities: ['RG', 'G', 'GR'] },
  ],
  'Value Engine': [
    { name: 'Graveyard', description: 'Recur creatures and spells for value', colorIdentities: ['BG', 'UBG', 'B'] },
    { name: 'Lands', description: 'Landfall triggers and land-based strategies', colorIdentities: ['UG', 'G', 'RUG'] },
    { name: 'Aristocrats', description: 'Sacrifice creatures for value', colorIdentities: ['WB', 'BR', 'WBR'] },
  ],
  'Table Politician': [
    { name: 'Group Hug', description: 'Help everyone while advancing your own plan', colorIdentities: ['WU', 'WUR', 'WUBR'] },
    { name: 'Politics', description: 'Monarch, goad, and deal-making', colorIdentities: ['WBR', 'WR', 'WUBR'] },
    { name: 'Artifacts', description: 'Artifact synergies with multiple win conditions', colorIdentities: ['WUBR', 'UR', 'WU'] },
  ],
  'Combo Master': [
    { name: 'Infinite Mana', description: 'Generate infinite mana and win', colorIdentities: ['UG', 'WUBG', 'U'] },
    { name: 'Storm', description: 'Cast many spells in one turn', colorIdentities: ['UR', 'UBR', 'U'] },
    { name: 'A+B Combos', description: 'Assemble two-card combos', colorIdentities: ['BG', 'UBG', 'WUBR'] },
  ],
  'Tactical Mind': [
    { name: 'Tempo', description: 'Efficient threats with protection and disruption', colorIdentities: ['UB', 'UR', 'U'] },
    { name: 'Midrange', description: 'Balanced threats and answers', colorIdentities: ['WBR', 'WB', 'RG'] },
    { name: 'Tribal', description: 'Synergistic creature types', colorIdentities: ['WBR', 'RG', 'WU'] },
  ],
};

export function getCommanderSuggestions(profile: PlaystyleProfile): CommanderSuggestion[] {
  return COMMANDER_MAP[profile.label] || COMMANDER_MAP['Value Engine'];
}

export function getArchetypeSuggestions(profile: PlaystyleProfile): ArchetypeSuggestion[] {
  return ARCHETYPE_MAP[profile.label] || ARCHETYPE_MAP['Value Engine'];
}

export function getColorIdentitySuggestions(profile: PlaystyleProfile): string[] {
  const archetypes = getArchetypeSuggestions(profile);
  const colors = new Set<string>();
  for (const arch of archetypes) {
    for (const ci of arch.colorIdentities) {
      colors.add(ci);
    }
  }
  return Array.from(colors).slice(0, 3);
}
