/**
 * Anti-synergy (nonbo) detection for deck analysis.
 * Identifies cards or card combinations that work against each other.
 * Severity levels: severe (major conflict), moderate (notable), warning (minor), info (awareness)
 */

export type AntiSynergySeverity = 'severe' | 'moderate' | 'warning' | 'info';

export type AntiSynergyResult = {
  severity: AntiSynergySeverity;
  category: string;
  description: string;
  cards: string[];
  suggestion?: string;
};

// Cards that shut down graveyard strategies
const GRAVEYARD_HATE = new Set([
  'rest in peace',
  'leyline of the void',
  'grafdigger\'s cage',
  'relic of progenitus',
  'tormod\'s crypt',
  'soul-guide lantern',
  'bojuka bog',
  'scavenger grounds',
  'dauthi voidwalker',
  'silent gravestone',
  'ground seal',
  'containment priest',
  'rest in peace',
  'planar void',
  'agent of erebos',
]);

// Cards that benefit from graveyard
const GRAVEYARD_PAYOFFS = new Set([
  'living death',
  'reanimate',
  'animate dead',
  'necromancy',
  'dread return',
  'victimize',
  'persist',
  'unburial rites',
  'karmic guide',
  'reveillark',
  'sun titan',
  'muldrotha, the gravetide',
  'karador, ghost chieftain',
  'meren of clan nel toth',
  'chainer, nightmare adept',
  'syr konrad, the grim',
  'golgari grave-troll',
  'stinkweed imp',
  'faithless looting',
  'buried alive',
  'entomb',
  'survival of the fittest',
  'splinterfright',
  'self-mill',
  'underworld breach',
  'past in flames',
  'flashback',
  'escape',
  'delve',
]);

// Cards that prevent ETB triggers
const ETB_HATE = new Set([
  'torpor orb',
  'hushbringer',
  'hushwing gryff',
  'tocatli honor guard',
  'strict proctor',
  'containment priest',
]);

// Cards that benefit from ETB
const ETB_PAYOFFS = new Set([
  'panharmonicon',
  'conjurer\'s closet',
  'brago, king eternal',
  'thassa, deep-dwelling',
  'yarok, the desecrated',
  'roon of the hidden realm',
  'restoration angel',
  'felidar guardian',
  'mulldrifter',
  'ravenous chupacabra',
  'acidic slime',
  'eternal witness',
  'cloudstone curio',
  'deadeye navigator',
  'ghostly flicker',
]);

// Mana-restricting stax pieces
const MANA_STAX = new Set([
  'winter orb',
  'static orb',
  'stasis',
  'hokori, dust drinker',
  'rising waters',
  'back to basics',
  'blood moon',
  'magus of the moon',
  'stranglehold',
  'aven mindcensor',
  'opposition agent',
  'collector ouphe',
  'null rod',
  'stony silence',
  'karn, the great creator',
]);

// Cards that hurt greedy manabases
const NONBASIC_HATE = new Set([
  'blood moon',
  'magus of the moon',
  'back to basics',
  'ruination',
  'from the ashes',
  'price of progress',
  'wave of vitriol',
]);

// Common tribal payoffs
const TRIBAL_PAYOFFS = new Set([
  'coat of arms',
  'vanquisher\'s banner',
  'icon of ancestry',
  'herald\'s horn',
  'kindred discovery',
  'kindred charge',
  'kindred dominance',
  'patriarch\'s bidding',
  'cavern of souls',
  'unclaimed territory',
  'door of destinies',
  'shared animosity',
]);

// Counter-focused cards
const COUNTER_PAYOFFS = new Set([
  'hardened scales',
  'doubling season',
  'branching evolution',
  'winding constrictor',
  'corpsejack menace',
  'vorinclex, monstrous raider',
  'ozolith',
  'the ozolith',
  'animation module',
  'inspiring call',
  'evolution sage',
  'forgotten ancient',
]);

// Token-focused cards
const TOKEN_PAYOFFS = new Set([
  'anointed procession',
  'doubling season',
  'parallel lives',
  'primal vigor',
  'divine visitation',
  'intangible virtue',
  'cathars\' crusade',
  'purphoros, god of the forge',
  'impact tremors',
  'zulaport cutthroat',
  'blood artist',
  'beastmaster ascension',
  'overwhelming stampede',
]);

function normalizeCardName(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Detect anti-synergies in a deck.
 * @param cardNames Array of card names in the deck
 * @param commander Optional commander name for context
 * @returns Array of detected anti-synergies
 */
export function detectAntiSynergies(
  cardNames: string[],
  commander?: string | null
): AntiSynergyResult[] {
  const results: AntiSynergyResult[] = [];
  const normalizedCards = new Set(cardNames.map(normalizeCardName));
  const normalizedCommander = commander ? normalizeCardName(commander) : null;
  
  // Check graveyard hate vs graveyard payoffs
  const graveyardHateInDeck = [...normalizedCards].filter(c => GRAVEYARD_HATE.has(c));
  const graveyardPayoffsInDeck = [...normalizedCards].filter(c => GRAVEYARD_PAYOFFS.has(c));
  
  if (graveyardHateInDeck.length > 0 && graveyardPayoffsInDeck.length >= 3) {
    results.push({
      severity: 'severe',
      category: 'Graveyard Conflict',
      description: 'Deck contains graveyard hate alongside significant graveyard synergies',
      cards: [...graveyardHateInDeck, ...graveyardPayoffsInDeck.slice(0, 3)],
      suggestion: 'Consider removing graveyard hate or pivoting away from graveyard strategies',
    });
  }
  
  // Check ETB hate vs ETB payoffs
  const etbHateInDeck = [...normalizedCards].filter(c => ETB_HATE.has(c));
  const etbPayoffsInDeck = [...normalizedCards].filter(c => ETB_PAYOFFS.has(c));
  
  if (etbHateInDeck.length > 0 && etbPayoffsInDeck.length >= 2) {
    results.push({
      severity: 'moderate',
      category: 'ETB Conflict',
      description: 'ETB hate effects will shut down your own ETB synergies',
      cards: [...etbHateInDeck, ...etbPayoffsInDeck.slice(0, 3)],
      suggestion: 'Remove ETB hate or reduce reliance on ETB triggers',
    });
  }
  
  // Check if Panharmonicon is in deck without enough ETB creatures
  if (normalizedCards.has('panharmonicon')) {
    const etbCount = etbPayoffsInDeck.length;
    if (etbCount < 8) {
      results.push({
        severity: 'warning',
        category: 'Insufficient ETB Density',
        description: 'Panharmonicon in deck but few ETB effects to double',
        cards: ['Panharmonicon'],
        suggestion: 'Add more ETB creatures/permanents or consider removing Panharmonicon',
      });
    }
  }
  
  // Check mana stax with expensive commander
  const hasManaStax = [...normalizedCards].some(c => MANA_STAX.has(c));
  // Check for expensive commander (heuristic: long names often = higher CMC)
  const expensiveCommanderIndicators = ['titan', 'praetor', 'eldrazi', 'dragon', 'demon'];
  const commanderMightBeExpensive = normalizedCommander && 
    expensiveCommanderIndicators.some(i => normalizedCommander.includes(i));
  
  if (hasManaStax && commanderMightBeExpensive) {
    results.push({
      severity: 'moderate',
      category: 'Stax vs Commander',
      description: 'Mana-restricting stax pieces may prevent you from casting your own expensive commander',
      cards: [...normalizedCards].filter(c => MANA_STAX.has(c)),
      suggestion: 'Ensure you have ways to break parity or consider lighter stax pieces',
    });
  }
  
  // Check Blood Moon danger in 3+ color deck
  const nonbasicHateInDeck = [...normalizedCards].filter(c => NONBASIC_HATE.has(c));
  if (nonbasicHateInDeck.length > 0) {
    // We don't have color info here, but we can warn
    results.push({
      severity: 'warning',
      category: 'Nonbasic Land Hate',
      description: 'Running nonbasic hate - ensure your manabase can function under it',
      cards: nonbasicHateInDeck,
      suggestion: 'Include enough basic lands to cast spells if Blood Moon resolves',
    });
  }
  
  // Check tribal payoffs without tribal focus
  const tribalPayoffsInDeck = [...normalizedCards].filter(c => TRIBAL_PAYOFFS.has(c));
  if (tribalPayoffsInDeck.length >= 2) {
    // This is more of an awareness - we can't easily detect creature type density
    results.push({
      severity: 'info',
      category: 'Tribal Synergies',
      description: 'Deck contains tribal payoffs - ensure creature types are unified',
      cards: tribalPayoffsInDeck,
      suggestion: 'Verify most creatures share a type for maximum value',
    });
  }
  
  // Check counter vs token split (both present but neither dominant)
  const counterPayoffsInDeck = [...normalizedCards].filter(c => COUNTER_PAYOFFS.has(c));
  const tokenPayoffsInDeck = [...normalizedCards].filter(c => TOKEN_PAYOFFS.has(c));
  
  if (counterPayoffsInDeck.length >= 3 && tokenPayoffsInDeck.length >= 3) {
    // Both strategies present - might be diluted
    results.push({
      severity: 'info',
      category: 'Split Focus',
      description: 'Deck has both +1/+1 counter and token themes - consider focusing on one',
      cards: [...counterPayoffsInDeck.slice(0, 2), ...tokenPayoffsInDeck.slice(0, 2)],
      suggestion: 'Pick a primary strategy for more consistent gameplay',
    });
  }
  
  // Check specific known bad combos
  // Teferi's Protection + Phasing permanents (they won't come back)
  if (normalizedCards.has('teferi\'s protection') && 
      (normalizedCards.has('oubliette') || normalizedCards.has('reality ripple'))) {
    results.push({
      severity: 'warning',
      category: 'Phasing Interaction',
      description: 'Teferi\'s Protection phases you out - phased permanents may behave unexpectedly',
      cards: ['Teferi\'s Protection'],
    });
  }
  
  // Solemnity + Undying/Persist
  if (normalizedCards.has('solemnity')) {
    const persistUndying = ['mikaeus, the unhallowed', 'yawgmoth, thran physician', 'murderous redcap', 'kitchen finks', 'glen elendra archmage'];
    const matching = persistUndying.filter(c => normalizedCards.has(c));
    if (matching.length > 0) {
      // This is actually a COMBO, not anti-synergy - but it's notable
      results.push({
        severity: 'info',
        category: 'Solemnity Combo',
        description: 'Solemnity creates infinite loops with Persist/Undying creatures',
        cards: ['Solemnity', ...matching],
        suggestion: 'This is a powerful combo - ensure you have a payoff',
      });
    }
  }
  
  return results;
}

/**
 * Get a summary of anti-synergies for display.
 */
export function summarizeAntiSynergies(results: AntiSynergyResult[]): string {
  if (results.length === 0) {
    return 'No significant anti-synergies detected.';
  }
  
  const severe = results.filter(r => r.severity === 'severe');
  const moderate = results.filter(r => r.severity === 'moderate');
  const warnings = results.filter(r => r.severity === 'warning');
  
  const parts: string[] = [];
  
  if (severe.length > 0) {
    parts.push(`⚠️ ${severe.length} severe conflict${severe.length > 1 ? 's' : ''}`);
  }
  if (moderate.length > 0) {
    parts.push(`${moderate.length} notable issue${moderate.length > 1 ? 's' : ''}`);
  }
  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning${warnings.length > 1 ? 's' : ''}`);
  }
  
  return parts.join(', ');
}
