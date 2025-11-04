// Shared deck inference functions for analyze and chat routes

// --- Minimal typed Scryfall card for our needs ---
export type SfCard = {
  name: string;
  type_line?: string;
  oracle_text?: string | null;
  color_identity?: string[]; // e.g. ["G","B"]
  cmc?: number;
  legalities?: Record<string, string>;
  mana_cost?: string; // e.g. "{1}{R}{G}"
};

// Simple in-process cache (persists across hot reloads on server)
declare global {
  // eslint-disable-next-line no-var
  var __sfCacheInference: Map<string, SfCard> | undefined;
}
const sfCache: Map<string, SfCard> = globalThis.__sfCacheInference ?? new Map();
globalThis.__sfCacheInference = sfCache;

export async function fetchCard(name: string): Promise<SfCard | null> {
  const key = name.toLowerCase();
  if (sfCache.has(key)) return sfCache.get(key)!;

  type ScryfallNamed = {
    name: string;
    type_line?: string;
    oracle_text?: string | null;
    card_faces?: { oracle_text?: string | null }[];
    color_identity?: string[];
    cmc?: number;
    legalities?: Record<string, string>;
    mana_cost?: string;
  };

  const r = await fetch(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
  );
  if (!r.ok) return null;
  const j = (await r.json()) as ScryfallNamed;

  const card: SfCard = {
    name: j.name,
    type_line: j.type_line,
    oracle_text: j.oracle_text ?? j.card_faces?.[0]?.oracle_text ?? null,
    color_identity: j.color_identity ?? [],
    cmc: typeof j.cmc === "number" ? j.cmc : undefined,
    legalities: j.legalities ?? {},
    mana_cost: j.mana_cost ?? undefined,
  };
  sfCache.set(key, card);
  return card;
}

export async function checkIfCommander(cardName: string): Promise<boolean> {
  try {
    const card = await fetchCard(cardName);
    if (!card) return false;
    const typeLine = (card.type_line || '').toLowerCase();
    const oracleText = (card.oracle_text || '').toLowerCase();
    
    // Check if it's a legendary creature or planeswalker
    if (typeLine.includes('legendary creature')) return true;
    if (typeLine.includes('legendary planeswalker') && oracleText.includes('can be your commander')) return true;
    
    // Check for special commander abilities (Partner, etc.)
    if (oracleText.includes('can be your commander')) return true;
    
    return false;
  } catch {
    return false;
  }
}

export type CardRole = 'commander' | 'ramp_fixing' | 'draw_advantage' | 'removal_interact' | 'wincon_payoff' | 'engine_enabler' | 'protection_recursion' | 'land';

export type CardRoleInfo = {
  name: string;
  roles: CardRole[];
  cmc: number;
  count: number;
};

export type InferredDeckContext = {
  commander: string | null;
  colors: string[];
  format: "Commander" | "Modern" | "Pioneer";
  commanderProvidesRamp: boolean;
  landCount: number;
  existingRampCount: number; // Count of ramp pieces already in deck
  commanderOracleText?: string | null;
  archetype?: 'token_sac' | 'aristocrats' | null;
  protectedRoles?: string[]; // Card names or roles that should not be cut
  powerLevel?: 'casual' | 'battlecruiser' | 'mid' | 'high' | 'cedh';
  isBudget?: boolean;
  userIntent?: string; // Extracted goal from user message
  curveAnalysis?: {
    averageCMC: number;
    highEndCount: number; // 6+ drops
    lowCurve: boolean; // avg <= 3
    tightManabase: boolean; // limited sources relative to pips
  };
  roleDistribution?: {
    byRole: Record<CardRole, number>; // Count per role
    cardRoles: CardRoleInfo[]; // Each card's roles
    redundancy: Record<string, number>; // Cards with similar roles
  };
  manabaseAnalysis?: {
    coloredPips: Record<string, number>; // W, U, B, R, G -> count
    doublePipWeight: Record<string, number>; // Weighted by double pips
    coloredSources: Record<string, number>; // W, U, B, R, G -> count
    ratio: Record<string, number>; // sources/pips ratio per color
    isAcceptable: boolean;
    variance: Record<string, number>; // Percentage variance from ideal
  };
};

export function detectFormat(
  totalCards: number,
  commander: string | null,
  format: "Commander" | "Modern" | "Pioneer",
  userMessage?: string
): "Commander" | "Modern" | "Pioneer" {
  // Check user message for format hints first
  if (userMessage) {
    const msgLower = userMessage.toLowerCase();
    if (/\b(commander|edh)\b/i.test(msgLower)) return "Commander";
    if (/\b(modern)\b/i.test(msgLower)) return "Modern";
    if (/\b(pioneer|standard)\b/i.test(msgLower)) return "Pioneer";
  }
  
  // If format explicitly set, use it
  if (format) return format;
  
  // Commander name present → EDH
  if (commander) return "Commander";
  
  // 100-ish cards → EDH
  if (totalCards >= 95 && totalCards <= 105) return "Commander";
  
  // 60-card → standard/pioneer/modern
  if (totalCards >= 55 && totalCards <= 75) {
    // Default to Modern if ambiguous
    return "Modern";
  }
  
  // Default to Commander for singleton/bigger decks
  return "Commander";
}

export function detectPowerLevel(
  userMessage: string | undefined,
  highEndCount: number,
  averageCMC: number
): 'casual' | 'battlecruiser' | 'mid' | 'high' | 'cedh' {
  if (userMessage) {
    const msgLower = userMessage.toLowerCase();
    if (/\bcedh\b/i.test(msgLower)) return 'cedh';
    if (/\b(high|optimized|competitive)\b/i.test(msgLower)) return 'high';
    if (/\b(battlecruiser|battle cruiser|big spells)\b/i.test(msgLower)) return 'battlecruiser';
    if (/\b(casual|fun|kitchen table)\b/i.test(msgLower)) return 'casual';
  }
  
  // Heuristic: tons of 6-7 drops → battlecruiser
  if (highEndCount >= 8 && averageCMC > 4.5) return 'battlecruiser';
  
  // Very low curve, efficient → might be high power
  if (averageCMC < 2.5 && highEndCount <= 2) return 'high';
  
  // Default
  return 'mid';
}

export function tagCardRoles(
  entries: Array<{ count: number; name: string }>,
  commander: string | null,
  byName: Map<string, SfCard>
): CardRoleInfo[] {
  const roleInfo: CardRoleInfo[] = [];
  
  for (const { name, count } of entries) {
    const c = byName.get(name.toLowerCase());
    if (!c) continue;
    
    const roles: CardRole[] = [];
    const typeLine = (c.type_line || '').toLowerCase();
    const oracleText = (c.oracle_text || '').toLowerCase();
    const cmc = c.cmc || 0;
    
    // Commander
    if (commander && name.toLowerCase() === commander.toLowerCase()) {
      roles.push('commander');
    }
    
    // Lands
    if (/land/i.test(typeLine)) {
      roles.push('land');
      if (/basic/i.test(typeLine)) {
        // Basic lands are also ramp/fixing
        roles.push('ramp_fixing');
      }
    }
    
    // Ramp/fixing
    if (
      /search your library for (a|up to .*?) (?:basic )?land/i.test(oracleText) ||
      /add \{[wubrg]\}/i.test(oracleText) ||
      /signet|talisman|sol ring|mana rock|mana dork/i.test(name.toLowerCase()) ||
      /ramp|mana/i.test(typeLine)
    ) {
      roles.push('ramp_fixing');
    }
    
    // Draw/advantage
    if (
      /draw a card|draw.*cards|scry|look at|reveal.*top/i.test(oracleText) ||
      /card advantage|draw|library/i.test(name.toLowerCase())
    ) {
      roles.push('draw_advantage');
    }
    
    // Removal/interaction
    if (
      /destroy target|exile target|counter target|remove target|bounce target/i.test(oracleText) ||
      /removal|removal|kill|destroy|exile/i.test(name.toLowerCase())
    ) {
      roles.push('removal_interact');
    }
    
    // Wincon/payoff
    if (
      /you win the game|players.*lose|deal.*damage to each opponent|mill.*library/i.test(oracleText) ||
      /win|payoff|finisher/i.test(name.toLowerCase()) ||
      (cmc >= 6 && /creature|planeswalker/i.test(typeLine))
    ) {
      roles.push('wincon_payoff');
    }
    
    // Engine/enabler
    if (
      /whenever|when.*enters|when.*dies|when.*attacks|trigger/i.test(oracleText) ||
      /engine|enabler|synergy|combo piece/i.test(name.toLowerCase())
    ) {
      roles.push('engine_enabler');
    }
    
    // Protection/recursion
    if (
      /hexproof|indestructible|protection|shroud|can't be|regenerate/i.test(oracleText) ||
      /return.*from (graveyard|exile)|regenerate|recur/i.test(oracleText) ||
      /protection|recursion|recur/i.test(name.toLowerCase())
    ) {
      roles.push('protection_recursion');
    }
    
    // If no roles assigned, skip (or assign generic role)
    if (roles.length > 0) {
      roleInfo.push({
        name,
        roles,
        cmc,
        count,
      });
    }
  }
  
  return roleInfo;
}

export function analyzeRedundancy(
  cardRoles: CardRoleInfo[]
): Record<string, number> {
  const redundancy: Record<string, number> = {};
  
  // Group cards by role combinations
  const roleGroups: Record<string, string[]> = {};
  
  for (const card of cardRoles) {
    const roleKey = card.roles.sort().join('|');
    if (!roleGroups[roleKey]) {
      roleGroups[roleKey] = [];
    }
    roleGroups[roleKey].push(card.name);
  }
  
  // Count how many cards share similar roles
  for (const [roleKey, cards] of Object.entries(roleGroups)) {
    if (cards.length > 1) {
      for (const cardName of cards) {
        redundancy[cardName] = cards.length;
      }
    }
  }
  
  return redundancy;
}

export function analyzeCurve(
  entries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>,
  manabaseAnalysis: InferredDeckContext['manabaseAnalysis']
): InferredDeckContext['curveAnalysis'] {
  let totalCMC = 0;
  let totalCards = 0;
  let highEndCount = 0;
  
  for (const { name, count } of entries) {
    const c = byName.get(name.toLowerCase());
    if (!c) continue;
    
    const cmc = c.cmc || 0;
    const typeLine = (c.type_line || '').toLowerCase();
    
    // Skip lands from curve calculation
    if (/land/i.test(typeLine)) continue;
    
    totalCMC += cmc * count;
    totalCards += count;
    
    if (cmc >= 6) {
      highEndCount += count;
    }
  }
  
  const averageCMC = totalCards > 0 ? totalCMC / totalCards : 0;
  const lowCurve = averageCMC <= 3;
  
  // Check if manabase is tight (sources < pips * 0.9 for any color)
  let tightManabase = false;
  if (manabaseAnalysis) {
    for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
      if (manabaseAnalysis.coloredPips[color] > 0) {
        const ratio = manabaseAnalysis.ratio[color];
        if (ratio < 0.9) {
          tightManabase = true;
          break;
        }
      }
    }
  }
  
  return {
    averageCMC,
    highEndCount,
    lowCurve,
    tightManabase,
  };
}

export function extractUserIntent(userMessage: string | undefined): string | undefined {
  if (!userMessage) return undefined;
  
  // Look for goal statements
  const goalPatterns = [
    /(?:this|my|the) (?:deck|list) (?:focuses?|is|aims?) (?:on|to) ([^.?!]+)/i,
    /(?:i want|goal|trying) (?:to|is) ([^.?!]+)/i,
    /(?:focus|theme|strategy) (?:is|:) ([^.?!]+)/i,
  ];
  
  for (const pattern of goalPatterns) {
    const match = userMessage.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

export function detectArchetype(
  entries: Array<{ count: number; name: string }>,
  commanderOracleText: string | null | undefined,
  byName: Map<string, SfCard>
): { archetype: 'token_sac' | 'aristocrats' | null; protectedRoles: string[] } {
  let tokenSacScore = 0;
  const protectedRoles: string[] = [];

  // Check commander for token/sac themes
  if (commanderOracleText) {
    const oracleLower = commanderOracleText.toLowerCase();
    if (/token|sacrifice|whenever.*dies|aristocrat/i.test(oracleLower)) {
      tokenSacScore += 3;
    }
  }

  // Scan decklist for patterns
  for (const { name, count } of entries) {
    const c = byName.get(name.toLowerCase());
    if (!c) continue;
    
    const oracleText = (c.oracle_text || '').toLowerCase();
    const typeLine = (c.type_line || '').toLowerCase();
    const cmc = c.cmc || 0;

    // Token producers
    if (/create.*token|create a 1\/1|create.*creature token/i.test(oracleText)) {
      tokenSacScore += 1;
      if (cmc <= 3) {
        protectedRoles.push(`${name} (low-CMC token producer)`);
      }
    }

    // After attacking create tokens
    if (/after attacking.*create|whenever.*attacks.*create.*token/i.test(oracleText)) {
      tokenSacScore += 1;
      protectedRoles.push(`${name} (attack token trigger)`);
    }

    // Sacrifice outlets
    if (/sacrifice.*creature|sacrifice.*as a cost/i.test(oracleText)) {
      tokenSacScore += 1;
      if (/tap|:.*sacrifice/i.test(oracleText)) {
        protectedRoles.push(`${name} (free/repeatable sacrifice outlet)`);
      } else {
        protectedRoles.push(`${name} (sacrifice outlet)`);
      }
    }

    // Death triggers
    if (/whenever.*creature.*dies|whenever.*dies.*you|death trigger/i.test(oracleText)) {
      tokenSacScore += 1;
      protectedRoles.push(`${name} (death-trigger payoff)`);
    }

    // Key 1-drops for aristocrats
    if (cmc === 1 && /token|sacrifice|whenever.*dies/i.test(oracleText)) {
      protectedRoles.push(`${name} (key 1-drop engine starter)`);
    }
  }

  const archetype = tokenSacScore >= 4 ? (tokenSacScore >= 6 ? 'aristocrats' : 'token_sac') : null;
  
  return { archetype, protectedRoles };
}

export function analyzeManabase(
  entries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>
): InferredDeckContext['manabaseAnalysis'] {
  const coloredPips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const doublePipWeight: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const coloredSources: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  // Extract mana pips from oracle text of non-land spells
  for (const { name, count } of entries) {
    const c = byName.get(name.toLowerCase());
    if (!c) continue;
    
    const typeLine = (c.type_line || '').toLowerCase();
    const oracleText = (c.oracle_text || '') + (c.type_line || '');
    
    // Skip lands
    if (/land/i.test(typeLine)) {
      // Count colored sources in lands
      const colors = c.color_identity || [];
      colors.forEach((color: string) => {
        const upper = color.toUpperCase();
        if (upper in coloredSources) {
          coloredSources[upper] += count;
        }
      });
      // Also check for basic lands
      if (/plains/i.test(name)) coloredSources.W += count;
      if (/island/i.test(name)) coloredSources.U += count;
      if (/swamp/i.test(name)) coloredSources.B += count;
      if (/mountain/i.test(name)) coloredSources.R += count;
      if (/forest/i.test(name)) coloredSources.G += count;
      continue;
    }

    // Count colored pips in mana costs
    const manaCost = c.mana_cost || '';
    
    // Count single color pips {W}, {U}, {B}, {R}, {G}
    const singlePipRe = /\{([WUBRG])\}/g;
    let match;
    const pipCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    
    while ((match = singlePipRe.exec(manaCost)) !== null) {
      const color = match[1].toUpperCase();
      if (color in pipCounts) {
        pipCounts[color] += 1;
      }
    }

    // Count hybrid pips {W/U}, {2/W}, etc. (count as 0.5 each)
    const hybridPipRe = /\{([WUBRG])\/([WUBRG])\}/g;
    while ((match = hybridPipRe.exec(manaCost)) !== null) {
      const color1 = match[1].toUpperCase();
      const color2 = match[2].toUpperCase();
      if (color1 in pipCounts) pipCounts[color1] += 0.5;
      if (color2 in pipCounts) pipCounts[color2] += 0.5;
    }
    
    // Add to totals and weight double pips
    for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
      const pips = pipCounts[color] * count;
      coloredPips[color] += pips;
      // Double-pip cards get extra weight (2x)
      if (pipCounts[color] >= 2) {
        doublePipWeight[color] += pips * 2;
      } else {
        doublePipWeight[color] += pips;
      }
    }
  }

  // Calculate ratios and variance
  const ratio: Record<string, number> = {};
  const variance: Record<string, number> = {};
  let allAcceptable = true;
  
  for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
    if (coloredPips[color] > 0) {
      const idealSources = coloredPips[color]; // 1:1 is ideal
      ratio[color] = coloredSources[color] / coloredPips[color];
      
      // Calculate variance percentage (how far from ideal)
      const diff = Math.abs(coloredSources[color] - idealSources);
      variance[color] = (diff / idealSources) * 100;
      
      // Consider acceptable if ratio is between 0.85 and 1.15 (10-15% variance)
      if (ratio[color] < 0.85 || ratio[color] > 1.15) {
        allAcceptable = false;
      }
    } else {
      ratio[color] = 0;
      variance[color] = 0;
    }
  }

  return {
    coloredPips,
    doublePipWeight,
    coloredSources,
    ratio,
    isAcceptable: allAcceptable,
    variance,
  };
}

export async function inferDeckContext(
  deckText: string,
  userMessage: string | undefined,
  entries: Array<{ count: number; name: string }>,
  format: "Commander" | "Modern" | "Pioneer",
  reqCommander: string | null,
  selectedColors: string[],
  byName: Map<string, SfCard>
): Promise<InferredDeckContext> {
  const context: InferredDeckContext = {
    commander: null,
    colors: [],
    format,
    commanderProvidesRamp: false,
    landCount: 0,
    existingRampCount: 0,
  };

  // Count lands
  const landRe = /land/i;
  for (const { name, count } of entries) {
    const c = byName.get(name.toLowerCase());
    const t = c?.type_line ?? "";
    if (landRe.test(t)) context.landCount += count;
  }

  // Try to detect commander
  let detectedCommander: string | null = reqCommander;

  // Check user message for commander mention
  if (!detectedCommander && userMessage) {
    const commanderMatch = userMessage.match(/my commander (?:is|:)\s*([^.?!]+)/i);
    if (commanderMatch) {
      detectedCommander = commanderMatch[1].trim();
    }
  }

  // Check first card in decklist if no commander found
  if (!detectedCommander && entries.length > 0) {
    const firstCard = entries[0].name;
    const isCommander = await checkIfCommander(firstCard);
    if (isCommander) {
      detectedCommander = firstCard;
    }
  }

  // If we have a commander, fetch its data
  if (detectedCommander) {
    const commanderCard = await fetchCard(detectedCommander);
    if (commanderCard) {
      context.commander = commanderCard.name;
      context.colors = (commanderCard.color_identity || []).map(c => c.toUpperCase());
      context.commanderOracleText = commanderCard.oracle_text;

      // Check if commander provides ramp
      const oracleText = (commanderCard.oracle_text || '').toLowerCase();
      if (
        /search your library for (a|up to .*?) (?:basic )?land/i.test(oracleText) ||
        /create.*treasure/i.test(oracleText) ||
        /you may play an additional land/i.test(oracleText) ||
        /add \{[wubrg]\}/i.test(oracleText)
      ) {
        context.commanderProvidesRamp = true;
      }
    }
  }

  // Use selectedColors if provided (from UI presets)
  if (selectedColors.length > 0) {
    context.colors = selectedColors.map(c => c.toUpperCase());
  }

  // If still no colors, infer from all non-basic cards
  if (context.colors.length === 0) {
    const colorSet = new Set<string>();
    for (const { name } of entries) {
      const c = byName.get(name.toLowerCase());
      if (!c) continue;
      const ci = c.color_identity || [];
      // Skip colorless artifacts and basic lands
      if (ci.length > 0 && !/^\s*(basic|land)\s*$/i.test(c.type_line || '')) {
        ci.forEach(col => colorSet.add(col.toUpperCase()));
      }
    }
    context.colors = Array.from(colorSet);
  }

  // Parse user message for color hints (overrides if found)
  if (userMessage) {
    const msgLower = userMessage.toLowerCase();
    const colorWords: Record<string, string[]> = {
      gruul: ['R', 'G'],
      simic: ['G', 'U'],
      mardu: ['R', 'W', 'B'],
      azorius: ['W', 'U'],
      dimir: ['U', 'B'],
      rakdos: ['B', 'R'],
      selesnya: ['G', 'W'],
      orzhov: ['W', 'B'],
      izzet: ['U', 'R'],
      golgari: ['B', 'G'],
      boros: ['R', 'W'],
    };
    
    for (const [key, colors] of Object.entries(colorWords)) {
      if (new RegExp(`\\b${key}\\b`).test(msgLower)) {
        context.colors = colors;
        break;
      }
    }
  }

  // Detect format
  const totalCards = entries.reduce((sum, e) => sum + e.count, 0);
  context.format = detectFormat(totalCards, context.commander, format, userMessage);

  // Analyze manabase (needed for curve analysis)
  context.manabaseAnalysis = analyzeManabase(entries, byName);

  // Analyze curve
  context.curveAnalysis = analyzeCurve(entries, byName, context.manabaseAnalysis);

  // Detect power level
  context.powerLevel = detectPowerLevel(
    userMessage,
    context.curveAnalysis?.highEndCount || 0,
    context.curveAnalysis?.averageCMC || 0
  );

  // Detect budget intent
  context.isBudget = userMessage ? /\b(budget|cheap|affordable|low cost)\b/i.test(userMessage) : false;

  // Extract user intent/goal
  context.userIntent = extractUserIntent(userMessage);

  // Tag card roles
  const cardRoles = tagCardRoles(entries, context.commander, byName);
  
  // Calculate role distribution
  const byRole: Record<CardRole, number> = {
    commander: 0,
    ramp_fixing: 0,
    draw_advantage: 0,
    removal_interact: 0,
    wincon_payoff: 0,
    engine_enabler: 0,
    protection_recursion: 0,
    land: 0,
  };
  
  for (const card of cardRoles) {
    for (const role of card.roles) {
      byRole[role] += card.count;
    }
  }
  
  // Analyze redundancy
  const redundancy = analyzeRedundancy(cardRoles);
  
  context.roleDistribution = {
    byRole,
    cardRoles,
    redundancy,
  };

  // Count existing ramp pieces
  context.existingRampCount = byRole.ramp_fixing || 0;

  // Detect archetype and protected roles (after role tagging)
  const { archetype, protectedRoles } = detectArchetype(entries, context.commanderOracleText, byName);
  context.archetype = archetype;
  context.protectedRoles = protectedRoles;

  return context;
}

