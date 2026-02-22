// frontend/lib/quiz/commander-suggestions.ts
// Map playstyle profiles to commander suggestions

import { PlaystyleProfile, PlaystyleTraits } from './quiz-data';

export interface CommanderSuggestion {
  name: string;
  description: string;
  archetype: string;
  matchPct?: number;
  reasonBullets?: string[];
}

export interface ArchetypeSuggestion {
  name: string;
  description: string;
  colorIdentities: string[];
  matchPct?: number;
  reasonBullets?: string[];
}

/**
 * Commander trait affinities for match calculation.
 * Each commander has trait preferences that affect match %.
 */
interface CommanderTraitAffinity {
  control?: number;           // -50 to +50 preference
  aggression?: number;
  comboAppetite?: number;
  varianceTolerance?: number;
  interactionPref?: number;
  gameLengthPref?: number;
  budgetElasticity?: number;  // -50 to +50 preference
  tags?: string[];            // For generating reason bullets
}

const COMMANDER_AFFINITIES: Record<string, CommanderTraitAffinity> = {
  'Atraxa, Praetors\' Voice': { control: 30, gameLengthPref: 20, interactionPref: 15, tags: ['proliferate', 'planeswalkers', 'incremental value'] },
  'Yuriko, the Tiger\'s Shadow': { aggression: 20, control: 10, interactionPref: 15, tags: ['ninjutsu', 'tempo', 'top-deck manipulation'] },
  'Kess, Dissident Mage': { control: 25, comboAppetite: 20, interactionPref: 10, tags: ['spellslinger', 'graveyard recursion', 'control'] },
  'Thrasios, Triton Hero': { control: 20, comboAppetite: 30, gameLengthPref: 15, tags: ['infinite mana', 'card advantage', 'combo outlet'] },
  'Tymna the Weaver': { aggression: 15, control: 10, interactionPref: 10, tags: ['card draw', 'low curve', 'partner'] },
  'Baral, Chief of Compliance': { control: 40, interactionPref: 30, comboAppetite: 10, tags: ['counterspells', 'cost reduction', 'mono-blue'] },
  'Krenko, Mob Boss': { aggression: 35, varianceTolerance: 15, gameLengthPref: -20, tags: ['tokens', 'goblin tribal', 'explosive'] },
  'Zada, Hedron Grinder': { aggression: 30, varianceTolerance: 20, comboAppetite: 15, tags: ['spellslinger', 'tokens', 'one big turn'] },
  'Rakdos, Lord of Riots': { aggression: 25, varianceTolerance: 10, gameLengthPref: -10, tags: ['big creatures', 'damage payoff', 'Eldrazi'] },
  'Norin the Wary': { varianceTolerance: 40, interactionPref: -10, tags: ['chaos', 'ETB triggers', 'unpredictable'] },
  'The Gitrog Monster': { comboAppetite: 35, control: 15, gameLengthPref: 10, tags: ['lands matter', 'dredge', 'combo'] },
  'Krark, the Thumbless': { varianceTolerance: 40, comboAppetite: 20, tags: ['coin flips', 'spell copying', 'chaos'] },
  'Meren of Clan Nel Toth': { control: 20, gameLengthPref: 15, comboAppetite: 10, tags: ['graveyard recursion', 'value engine', 'sacrifice'] },
  'Muldrotha, the Gravetide': { control: 25, gameLengthPref: 20, varianceTolerance: -10, tags: ['permanent recursion', 'value', 'self-mill'] },
  'Chulane, Teller of Tales': { control: 15, gameLengthPref: 10, comboAppetite: 15, tags: ['creature ETB', 'card draw', 'ramp'] },
  'Korvold, Fae-Cursed King': { aggression: 15, comboAppetite: 20, interactionPref: 10, tags: ['sacrifice', 'card draw', 'aristocrats'] },
  'Kenrith, the Returned King': { control: 10, interactionPref: 20, varianceTolerance: 5, tags: ['five-color', 'toolbox', 'political'] },
  'Tatyova, Benthic Druid': { control: 15, gameLengthPref: 15, varianceTolerance: -15, tags: ['landfall', 'card draw', 'ramp'] },
  'Breya, Etherium Shaper': { comboAppetite: 25, control: 15, interactionPref: 10, tags: ['artifacts', 'combo', 'toolbox'] },
  'Ghave, Guru of Spores': { comboAppetite: 30, control: 10, varianceTolerance: -10, tags: ['tokens', 'counters', 'combo'] },
  'Queen Marchesa': { interactionPref: 25, control: 15, varianceTolerance: 10, tags: ['monarch', 'politics', 'control'] },
  'Kynaios and Tiro of Meletis': { interactionPref: 20, varianceTolerance: 15, control: -10, tags: ['group hug', 'political', 'everyone draws'] },
  'Phelddagrif': { interactionPref: 15, varianceTolerance: 20, aggression: -20, tags: ['group hug', 'political', 'hippo gifts'] },
  'Najeela, the Blade-Blossom': { aggression: 30, comboAppetite: 25, gameLengthPref: -15, tags: ['warriors', 'infinite combat', 'aggro-combo'] },
  'Gitrog Monster': { comboAppetite: 35, control: 15, gameLengthPref: 10, tags: ['lands', 'dredge combo', 'Dakmor Salvage'] },
  'Zur the Enchanter': { comboAppetite: 30, control: 25, interactionPref: 5, tags: ['enchantments', 'tutor', 'combo'] },
  'Edgar Markov': { aggression: 35, gameLengthPref: -15, interactionPref: 5, tags: ['vampire tribal', 'tokens', 'aggro'] },
  'The Ur-Dragon': { gameLengthPref: 15, aggression: 20, varianceTolerance: 5, tags: ['dragon tribal', 'big creatures', 'cost reduction'] },
};

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

// ============================================
// MATCH PERCENTAGE CALCULATIONS
// ============================================

/**
 * Calculate match percentage between traits and a commander.
 * Returns 0-100 where higher = better match.
 */
function calculateCommanderMatch(traits: PlaystyleTraits, commanderName: string): number {
  const affinity = COMMANDER_AFFINITIES[commanderName];
  if (!affinity) return 70; // Default match for commanders without affinity data

  let score = 50; // Base score
  let factors = 0;

  // Compare each trait with commander affinity
  const traitKeys: (keyof PlaystyleTraits)[] = ['control', 'aggression', 'comboAppetite', 'varianceTolerance', 'interactionPref', 'gameLengthPref'];
  
  for (const key of traitKeys) {
    const affinityValue = affinity[key];
    if (affinityValue !== undefined) {
      // Convert trait (0-100) to preference (-50 to +50)
      const traitPref = traits[key] - 50;
      // Calculate alignment: both positive or both negative = good match
      const alignment = (traitPref * affinityValue) / 50;
      score += alignment * 0.5;
      factors++;
    }
  }

  // Normalize and clamp
  const normalizedScore = factors > 0 ? score : 70;
  return Math.max(40, Math.min(98, Math.round(normalizedScore + 20)));
}

/**
 * Generate reason bullets explaining why a commander matches.
 */
function generateReasonBullets(traits: PlaystyleTraits, commanderName: string, profile: PlaystyleProfile): string[] {
  const affinity = COMMANDER_AFFINITIES[commanderName];
  const bullets: string[] = [];

  if (!affinity) {
    bullets.push(`Fits your ${profile.label} playstyle`);
    return bullets;
  }

  // Add tag-based reasons
  if (affinity.tags) {
    for (const tag of affinity.tags.slice(0, 2)) {
      bullets.push(`Strong ${tag} synergies`);
    }
  }

  // Add trait-based reasons
  if (affinity.control && affinity.control > 15 && traits.control > 55) {
    bullets.push('Rewards your control-oriented approach');
  }
  if (affinity.aggression && affinity.aggression > 15 && traits.aggression > 55) {
    bullets.push('Supports your aggressive playstyle');
  }
  if (affinity.comboAppetite && affinity.comboAppetite > 15 && traits.comboAppetite > 55) {
    bullets.push('Enables the combo lines you enjoy');
  }
  if (affinity.varianceTolerance && affinity.varianceTolerance > 15 && traits.varianceTolerance > 55) {
    bullets.push('Embraces the variance you appreciate');
  }
  if (affinity.interactionPref && affinity.interactionPref > 15 && traits.interactionPref > 55) {
    bullets.push('Encourages the interaction you prefer');
  }
  if (affinity.gameLengthPref && affinity.gameLengthPref > 10 && traits.gameLengthPref > 55) {
    bullets.push('Suited for longer games you enjoy');
  }
  if (affinity.gameLengthPref && affinity.gameLengthPref < -10 && traits.gameLengthPref < 45) {
    bullets.push('Ends games at your preferred pace');
  }

  // Ensure we have at least 2 bullets
  while (bullets.length < 2) {
    bullets.push(`Aligns with your ${profile.label} profile`);
  }

  return bullets.slice(0, 3);
}

/**
 * Get commander suggestions with match percentages and reasons.
 * Enhanced version that uses traits for scoring.
 */
export function getCommanderSuggestionsWithMatch(
  profile: PlaystyleProfile,
  traits: PlaystyleTraits
): CommanderSuggestion[] {
  const baseCommanders = getCommanderSuggestions(profile);
  
  return baseCommanders.map(commander => ({
    ...commander,
    matchPct: calculateCommanderMatch(traits, commander.name),
    reasonBullets: generateReasonBullets(traits, commander.name, profile),
  })).sort((a, b) => (b.matchPct || 0) - (a.matchPct || 0));
}

/**
 * Archetype trait affinities for match calculation.
 */
const ARCHETYPE_AFFINITIES: Record<string, CommanderTraitAffinity> = {
  'Superfriends': { control: 25, gameLengthPref: 20, interactionPref: 15, tags: ['planeswalkers', 'incremental value'] },
  'Spellslinger Control': { control: 30, interactionPref: 25, comboAppetite: 10, tags: ['counterspells', 'card draw'] },
  'Stax': { control: 40, interactionPref: 20, gameLengthPref: 25, tags: ['resource denial', 'lockdown'] },
  'Tokens': { aggression: 20, varianceTolerance: 10, tags: ['go-wide', 'overwhelming numbers'] },
  'Chaos': { varianceTolerance: 40, interactionPref: -10, tags: ['random effects', 'unpredictable'] },
  'Big Mana': { gameLengthPref: 10, aggression: 15, tags: ['ramp', 'massive threats'] },
  'Graveyard': { control: 15, gameLengthPref: 15, tags: ['recursion', 'value engine'] },
  'Lands': { control: 15, gameLengthPref: 20, varianceTolerance: -10, tags: ['landfall', 'ramp'] },
  'Aristocrats': { comboAppetite: 15, control: 10, tags: ['sacrifice', 'death triggers'] },
  'Group Hug': { interactionPref: 20, varianceTolerance: 15, aggression: -20, tags: ['political', 'shared resources'] },
  'Politics': { interactionPref: 25, varianceTolerance: 10, tags: ['deals', 'temporary alliances'] },
  'Artifacts': { comboAppetite: 20, control: 10, tags: ['synergies', 'combo potential'] },
  'Infinite Mana': { comboAppetite: 35, control: 15, tags: ['combo', 'win conditions'] },
  'Storm': { comboAppetite: 30, varianceTolerance: 15, gameLengthPref: -10, tags: ['spell count', 'one big turn'] },
  'A+B Combos': { comboAppetite: 25, control: 10, tags: ['two-card combos', 'tutors'] },
  'Tempo': { aggression: 15, control: 15, interactionPref: 20, tags: ['efficient threats', 'protection'] },
  'Midrange': { control: 5, aggression: 10, interactionPref: 15, tags: ['flexible', 'answers and threats'] },
  'Tribal': { aggression: 15, varianceTolerance: 5, tags: ['synergy', 'creature type matters'] },
  'Combo': { comboAppetite: 30, control: 10, tags: ['win conditions', 'assembly'] },
};

/**
 * Calculate match percentage for an archetype.
 */
function calculateArchetypeMatch(traits: PlaystyleTraits, archetypeName: string): number {
  const affinity = ARCHETYPE_AFFINITIES[archetypeName];
  if (!affinity) return 75;

  let score = 55;
  const traitKeys: (keyof PlaystyleTraits)[] = ['control', 'aggression', 'comboAppetite', 'varianceTolerance', 'interactionPref', 'gameLengthPref'];
  
  for (const key of traitKeys) {
    const affinityValue = affinity[key];
    if (affinityValue !== undefined) {
      const traitPref = traits[key] - 50;
      const alignment = (traitPref * affinityValue) / 50;
      score += alignment * 0.4;
    }
  }

  return Math.max(50, Math.min(98, Math.round(score + 15)));
}

/**
 * Generate reason bullets for archetype match.
 */
function generateArchetypeReasonBullets(traits: PlaystyleTraits, archetypeName: string): string[] {
  const affinity = ARCHETYPE_AFFINITIES[archetypeName];
  const bullets: string[] = [];

  if (affinity?.tags) {
    for (const tag of affinity.tags) {
      bullets.push(`Leverages ${tag}`);
    }
  }

  if (affinity?.control && affinity.control > 15 && traits.control > 55) {
    bullets.push('Matches your control preference');
  }
  if (affinity?.aggression && affinity.aggression > 15 && traits.aggression > 55) {
    bullets.push('Supports your aggressive tendencies');
  }
  if (affinity?.comboAppetite && affinity.comboAppetite > 15 && traits.comboAppetite > 55) {
    bullets.push('Enables combo finishes');
  }

  return bullets.slice(0, 3);
}

/**
 * Get archetype suggestions with match percentages.
 */
export function getArchetypeSuggestionsWithMatch(
  profile: PlaystyleProfile,
  traits: PlaystyleTraits
): ArchetypeSuggestion[] {
  const baseArchetypes = getArchetypeSuggestions(profile);
  
  return baseArchetypes.map(arch => ({
    ...arch,
    matchPct: calculateArchetypeMatch(traits, arch.name),
    reasonBullets: generateArchetypeReasonBullets(traits, arch.name),
  })).sort((a, b) => (b.matchPct || 0) - (a.matchPct || 0));
}
