// app/api/deck/analyze/route.ts

import fs from "node:fs/promises";
import path from "node:path";

// --- Minimal typed Scryfall card for our needs ---
type SfCard = {
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
  var __sfCacheAnalyze: Map<string, SfCard> | undefined;
}
const sfCache: Map<string, SfCard> = globalThis.__sfCacheAnalyze ?? new Map();
globalThis.__sfCacheAnalyze = sfCache;

async function fetchCard(name: string): Promise<SfCard | null> {
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

async function checkIfCommander(cardName: string): Promise<boolean> {
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

type CardRole = 'commander' | 'ramp_fixing' | 'draw_advantage' | 'removal_interact' | 'wincon_payoff' | 'engine_enabler' | 'protection_recursion' | 'land';

type CardRoleInfo = {
  name: string;
  roles: CardRole[];
  cmc: number;
  count: number;
};

type InferredDeckContext = {
  commander: string | null;
  colors: string[];
  format: "Commander" | "Modern" | "Pioneer";
  commanderProvidesRamp: boolean;
  landCount: number;
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

function detectFormat(
  totalCards: number,
  commander: string | null,
  format: "Commander" | "Modern" | "Pioneer"
): "Commander" | "Modern" | "Pioneer" {
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

function detectPowerLevel(
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

function tagCardRoles(
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

function analyzeRedundancy(
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

function analyzeCurve(
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

function extractUserIntent(userMessage: string | undefined): string | undefined {
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

function detectArchetype(
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

function analyzeManabase(
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

async function inferDeckContext(
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
  context.format = detectFormat(totalCards, context.commander, format);

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

  // Detect archetype and protected roles (after role tagging)
  const { archetype, protectedRoles } = detectArchetype(entries, context.commanderOracleText, byName);
  context.archetype = archetype;
  context.protectedRoles = protectedRoles;

  return context;
}

async function callGPTForSuggestions(
  deckText: string,
  userMessage: string | undefined,
  context: InferredDeckContext
): Promise<Array<{ card: string; reason: string }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5";
  if (!apiKey) return [];

  // Build system prompt with constraints
  let systemPrompt = "You are an expert MTG deck builder. Analyze the provided decklist and provide suggestions in 3 categories:\n";
  systemPrompt += "1. MUST-FIX issues (curve problems, land count wildly off, missing removal)\n";
  systemPrompt += "2. SYNERGY UPGRADES (on-plan swaps that improve consistency)\n";
  systemPrompt += "3. OPTIONAL/STYLISTIC (nice-to-haves, power upgrades)\n\n";
  
  systemPrompt += `FORMAT & POWER LEVEL:\n`;
  systemPrompt += `- Detected format: ${context.format}\n`;
  if (context.format === "Commander") {
    systemPrompt += `- WARNING: This is Commander format. Do NOT suggest narrow 4-of-y cards or cards that rely on multiples. Suggest singleton-viable cards only.\n`;
  }
  systemPrompt += `- Detected power level: ${context.powerLevel}\n`;
  if (context.powerLevel === 'casual' || context.powerLevel === 'battlecruiser') {
    systemPrompt += `- This is a ${context.powerLevel} deck. Do NOT recommend trimming to razor-efficiency or cutting fun cards. Respect the deck's power level.\n`;
    if (context.curveAnalysis && context.curveAnalysis.highEndCount >= 8) {
      systemPrompt += `- The deck has many 6-7 drops (${context.curveAnalysis.highEndCount}). This is intentional for battlecruiser. Do NOT suggest cutting them.\n`;
    }
  }
  
  systemPrompt += `\nCOLOR IDENTITY:\n`;
  systemPrompt += `- Only suggest cards that are within this color identity: ${context.colors.join(', ') || 'No restrictions'}. Reject or replace anything outside those colors.\n`;
  
  if (context.commander) {
    systemPrompt += `\nCOMMANDER SYNERGY:\n`;
    systemPrompt += `- Commander: ${context.commander}\n`;
    if (context.commanderOracleText) {
      systemPrompt += `- Commander oracle text: ${context.commanderOracleText}\n`;
      systemPrompt += `- When evaluating cards, first check: does this card directly advance the commander's text, trigger it more often, or enable the deck's main mechanic? If yes, increase its keep-score.\n`;
    }
    if (context.commanderProvidesRamp) {
      systemPrompt += `- WARNING: The commander already provides ramp. Do NOT suggest generic 2-3 mana ramp like Cultivate or Kodama's Reach unless there is a specific synergy reason (e.g., landfall, mana value fixing).\n`;
    }
  }

  if (context.landCount > 38) {
    systemPrompt += `- The deck has ${context.landCount} lands (already above the recommended 35-38). Recommend cutting lands instead of adding them.\n`;
  }

  // Archetype protection rules
  if (context.archetype && context.protectedRoles && context.protectedRoles.length > 0) {
    systemPrompt += `\nARCHETYPE PROTECTION RULES:\n`;
    systemPrompt += `- This deck is a ${context.archetype === 'aristocrats' ? 'aristocrats' : 'token/sacrifice'} deck.\n`;
    systemPrompt += `- PROTECTED_ROLES (do NOT suggest cutting these unless there are strictly better functional duplicates in the deck):\n`;
    context.protectedRoles.forEach(role => {
      systemPrompt += `  * ${role}\n`;
    });
    systemPrompt += `- When suggesting "cuts", do NOT suggest cutting cards in PROTECTED_ROLES.\n`;
    systemPrompt += `- When suggesting "protection" cards, prefer cards that protect or recur the board in the deck's colors and gameplan, instead of random high-CMC off-plan enchantments.\n`;
  }

  // Role tagging and cut rules
  if (context.roleDistribution) {
    systemPrompt += `\nROLE DISTRIBUTION:\n`;
    const rd = context.roleDistribution;
    systemPrompt += `- Role counts: ${Object.entries(rd.byRole).filter(([_, count]) => count > 0).map(([role, count]) => `${role}: ${count}`).join(', ')}\n`;
    systemPrompt += `- CRITICAL RULE: Never cut the last remaining card in a needed role. Check role distribution before suggesting cuts.\n`;
    systemPrompt += `- If a role has only 1-2 cards, those cards are PROTECTED and should not be cut unless there's a strictly better functional duplicate.\n`;
    
    // Redundancy rules
    const redundant = Object.entries(rd.redundancy).filter(([_, count]) => count >= 5);
    if (redundant.length > 0) {
      systemPrompt += `- REDUNDANT CARDS (valid cut candidates): ${redundant.map(([name]) => name).join(', ')}\n`;
      systemPrompt += `- If there are 5+ almost-identical cards in the same role, those are valid cut candidates.\n`;
      systemPrompt += `- Prefer to cut "highest CMC in the most overcrowded role" for more human-like cuts.\n`;
    }
    
    const unique = Object.entries(rd.redundancy).filter(([_, count]) => count <= 2);
    if (unique.length > 0) {
      systemPrompt += `- UNIQUE ENGINE PIECES (do NOT cut): ${unique.slice(0, 10).map(([name]) => name).join(', ')}\n`;
      systemPrompt += `- If there are only 2 nearly-unique engine pieces, do NOT cut those.\n`;
    }
  }

  // Curve awareness
  if (context.curveAnalysis) {
    systemPrompt += `\nCURVE ANALYSIS:\n`;
    const curve = context.curveAnalysis;
    systemPrompt += `- Average CMC: ${curve.averageCMC.toFixed(2)}\n`;
    systemPrompt += `- High-end cards (6+ CMC): ${curve.highEndCount}\n`;
    if (curve.lowCurve) {
      systemPrompt += `- This is a low-curve deck (avg ≤ 3). Do NOT suggest 6-drops unless they're wincons.\n`;
    }
    if (curve.tightManabase) {
      systemPrompt += `- Manabase is tight (limited sources). Do NOT suggest double-pip splash cards.\n`;
    }
  }

  // Manabase feedback rules
  if (context.manabaseAnalysis) {
    systemPrompt += `\nMANABASE ANALYSIS:\n`;
    const mb = context.manabaseAnalysis;
    const activeColors = context.colors.filter(c => mb.coloredPips[c] > 0);
    
    if (activeColors.length > 0) {
      systemPrompt += `- Colored pips per color: ${activeColors.map(c => `${c}: ${mb.coloredPips[c].toFixed(1)}`).join(', ')}\n`;
      systemPrompt += `- Colored sources per color: ${activeColors.map(c => `${c}: ${mb.coloredSources[c]}`).join(', ')}\n`;
      systemPrompt += `- Source-to-pip ratios: ${activeColors.map(c => `${c}: ${mb.ratio[c].toFixed(2)}`).join(', ')}\n`;
      systemPrompt += `- Variance from ideal: ${activeColors.map(c => `${c}: ${mb.variance[c].toFixed(1)}%`).join(', ')}\n`;
      
      systemPrompt += `- When commenting on the manabase, compare lands to actual color requirements in the spell list. Do not give generic "balance your manabase" advice if the current distribution already matches spell requirements within 10-15%.\n`;
      
      if (mb.isAcceptable) {
        systemPrompt += `- MANABASE FEEDBACK: The manabase is acceptable for this deck. The ratio of sources to pips is balanced (within 10-15% variance). Return "manabase is acceptable for this deck" instead of generic "make it balanced".\n`;
      } else {
        systemPrompt += `- MANABASE FEEDBACK: The manabase needs adjustment. Some colors have imbalanced source-to-pip ratios (variance > 15%). Provide specific feedback on which colors need more or fewer sources.\n`;
      }
    }
  }

  // User intent protection
  if (context.userIntent) {
    systemPrompt += `\nUSER INTENT:\n`;
    systemPrompt += `- Detected user goal: "${context.userIntent}"\n`;
    systemPrompt += `- CRITICAL: Do NOT suggest cuts that undermine this goal. Instead, improve consistency of that goal.\n`;
    systemPrompt += `- If the user prompt contains a goal, do NOT contradict it. Enhance it instead.\n`;
  }

  // Budget awareness
  if (context.isBudget) {
    systemPrompt += `\nBUDGET CONSTRAINT:\n`;
    systemPrompt += `- User indicated this is a budget deck. Prefer cards under $5-10 unless they explicitly ask for expensive upgrades.\n`;
    systemPrompt += `- Suggest two tracks if appropriate: same-price swaps and premium upgrades.\n`;
  }

  systemPrompt += `\nOUTPUT FORMAT:\n`;
  systemPrompt += `- Structure suggestions in 3 buckets: must-fix, synergy-upgrades, optional-stylistic\n`;
  systemPrompt += `- Add a quick reason per item so users can see why and ignore if hallucinated.\n`;
  systemPrompt += `- Use the provided decklist as source of truth.\n`;
  systemPrompt += `- Return suggestions with short justifications (1 sentence each).\n`;
  systemPrompt += `- Respond ONLY with a JSON array: [{"card": "Card Name", "reason": "short justification", "category": "must-fix|synergy-upgrade|optional"}]`;

  const userPrompt = userMessage 
    ? `${userMessage}\n\nDecklist:\n${deckText}`
    : `Analyze this deck and suggest improvements:\n\n${deckText}`;

  try {
    const body: any = {
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
      max_output_tokens: 512,
      temperature: 0.7,
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    }).catch(() => null as any);

    if (!r || !r.ok) return [];
    
    const j: any = await r.json().catch(() => ({}));
    const text = (j?.output_text || "").trim();
    
    // Try to extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }
    
    return [];
  } catch {
    return [];
  }
}

async function postFilterSuggestions(
  suggestions: Array<{ card: string; reason: string; category?: string }>,
  context: InferredDeckContext,
  byName: Map<string, SfCard>,
  currency: string = 'USD'
): Promise<Array<{ card: string; reason: string; category?: string }>> {
  const allowedColors = new Set(context.colors.map(c => c.toUpperCase()));
  const filtered: Array<{ card: string; reason: string; category?: string }> = [];

  // Fetch prices if budget constraint
  let priceMap: Map<string, number> = new Map();
  if (context.isBudget) {
    try {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
      const cardNames = suggestions.map(s => s.card);
      
      // Normalize names (lowercase)
      const normalizedNames = cardNames.map(n => n.toLowerCase().trim());
      
      // Fetch from price_cache
      const { data: priceData } = await supabase
        .from('price_cache')
        .select('name, usd, eur, gbp')
        .in('name', normalizedNames);
      
      if (priceData) {
        for (const row of priceData) {
          const price = currency === 'EUR' ? (row.eur || 0) : 
                       currency === 'GBP' ? (row.gbp || 0) : 
                       (row.usd || 0);
          priceMap.set(row.name.toLowerCase(), price);
        }
      }
    } catch (error) {
      console.warn('[filter] Failed to fetch prices for budget filtering:', error);
    }
  }

  for (const suggestion of suggestions) {
    try {
      // Fetch card data if not already cached
      let card = byName.get(suggestion.card.toLowerCase());
      if (!card) {
        const fetchedCard = await fetchCard(suggestion.card);
        if (fetchedCard) {
          card = fetchedCard;
          byName.set(fetchedCard.name.toLowerCase(), fetchedCard);
        }
      }

      if (!card) {
        // Skip if we can't fetch card data (fail gracefully)
        continue;
      }

      // Check color identity
      const cardColors = (card.color_identity || []).map(c => c.toUpperCase());
      const isLegal = cardColors.length === 0 || cardColors.every(c => allowedColors.has(c));
      
      if (!isLegal) {
        console.log(`[filter] Rejected ${suggestion.card}: colors ${cardColors.join(',')} not in ${Array.from(allowedColors).join(',')}`);
        continue;
      }

      // Check curve constraints
      if (context.curveAnalysis) {
        const cmc = card.cmc || 0;
        // Don't suggest 6-drops if low curve unless wincon
        if (context.curveAnalysis.lowCurve && cmc >= 6) {
          const reasonLower = suggestion.reason.toLowerCase();
          if (!reasonLower.includes('win') && !reasonLower.includes('finisher')) {
            console.log(`[filter] Removed ${suggestion.card}: 6+ CMC in low-curve deck`);
            continue;
          }
        }
        
        // Don't suggest double-pip cards if manabase is tight
        if (context.curveAnalysis.tightManabase && card.mana_cost) {
          const doublePipRe = /\{([WUBRG])\}\{([WUBRG])\}/;
          if (doublePipRe.test(card.mana_cost)) {
            console.log(`[filter] Removed ${suggestion.card}: double-pip card in tight manabase`);
            continue;
          }
        }
      }

      // Filter out Cultivate/Kodama's Reach if commander provides ramp
      const cardNameLower = suggestion.card.toLowerCase();
      if (context.commanderProvidesRamp && 
          (cardNameLower.includes('cultivate') || cardNameLower.includes("kodama's reach"))) {
        // Check if reason explicitly mentions landfall/mana fixing
        const reasonLower = suggestion.reason.toLowerCase();
        if (!reasonLower.includes('landfall') && !reasonLower.includes('mana value') && !reasonLower.includes('fixing')) {
          console.log(`[filter] Removed ${suggestion.card}: generic ramp when commander already ramps`);
          continue;
        }
      }

      // Budget filtering
      if (context.isBudget) {
        const cardPrice = priceMap.get(suggestion.card.toLowerCase());
        if (cardPrice !== undefined && cardPrice > 10) {
          // Allow expensive cards only if explicitly mentioned as upgrade
          const reasonLower = suggestion.reason.toLowerCase();
          if (!reasonLower.includes('upgrade') && !reasonLower.includes('premium') && !reasonLower.includes('powerful')) {
            console.log(`[filter] Removed ${suggestion.card}: too expensive (${cardPrice}) for budget deck`);
            continue;
          }
        }
      }

      filtered.push(suggestion);
    } catch (error) {
      // Skip on error (fail gracefully)
      console.warn(`[filter] Error processing ${suggestion.card}:`, error);
      continue;
    }
  }

  return filtered;
}

export async function POST(req: Request) {
  const t0 = Date.now();

  type AnalyzeBody = {
    deckText?: string;
    format?: "Commander" | "Modern" | "Pioneer";
    plan?: "Budget" | "Optimized";
    colors?: string[]; // e.g. ["G","B"]
    currency?: "USD" | "EUR" | "GBP";
    useScryfall?: boolean; // true = do real lookups
    commander?: string; // optional commander name for meta suggestions
    userMessage?: string; // optional user prompt/question
    useGPT?: boolean; // true = call GPT for suggestions
  };

  const body = (await req.json().catch(() => ({}))) as AnalyzeBody;

  const deckText: string = body.deckText ?? "";
  const format: "Commander" | "Modern" | "Pioneer" = body.format ?? "Commander";
  const plan: "Budget" | "Optimized" = body.plan ?? "Optimized";
  const useScryfall: boolean = Boolean(body.useScryfall);
  const selectedColors: string[] = Array.isArray(body.colors) ? body.colors : [];
  const reqCommander: string | null = typeof body.commander === 'string' && body.commander.trim() ? String(body.commander).trim() : null;
  const userMessage: string | undefined = typeof body.userMessage === 'string' ? body.userMessage.trim() || undefined : undefined;
  const useGPT: boolean = Boolean(body.useGPT);

  // Parse text into entries {count, name}
  const lines = deckText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => Boolean(s));

  const entries = lines.map((l) => {
    const m = l.match(/^(\d+)\s*x?\s*(.+)$/i);
    const count = m ? Number(m[1]) : 1;
    const name = (m ? m[2] : l).replace(/\s*\(.*?\)\s*$/, "").trim();
    return { count: Number.isFinite(count) ? count : 1, name };
  });

  const totalCards = entries.reduce((s, e) => s + e.count, 0);

  // Tally bands
  let lands = 0,
    draw = 0,
    ramp = 0,
    removal = 0;

  // Curve buckets: [<=1, 2, 3, 4, >=5]
  const curveBuckets = [0, 0, 0, 0, 0];

  // Store Scryfall results by name for reuse + legality
  const byName = new Map<string, SfCard>();

  if (useScryfall) {
    const unique = Array.from(new Set(entries.map((e) => e.name))).slice(0, 160);
    const looked = await Promise.all(unique.map(fetchCard));
    for (const c of looked) {
      if (c) byName.set(c.name.toLowerCase(), c);
    }

    const landRe = /land/i;
    const drawRe = /draw a card|scry [1-9]/i;
    const rampRe = /add \{[wubrg]\}|search your library for (a|up to .*?) land/i;
    const killRe = /destroy target|exile target|counter target/i;

    for (const { name, count } of entries) {
      const c = byName.get(name.toLowerCase());
      const t = c?.type_line ?? "";
      const o = c?.oracle_text ?? "";
      if (landRe.test(t)) lands += count;
      if (drawRe.test(o)) draw += count;
      if (rampRe.test(o) || /signet|talisman|sol ring/i.test(name)) ramp += count;
      if (killRe.test(o)) removal += count;

      // CMC bucket
      const cmc = typeof c?.cmc === "number" ? c!.cmc : undefined;
      if (typeof cmc === "number") {
        if (cmc <= 1) curveBuckets[0] += count;
        else if (cmc <= 2) curveBuckets[1] += count;
        else if (cmc <= 3) curveBuckets[2] += count;
        else if (cmc <= 4) curveBuckets[3] += count;
        else curveBuckets[4] += count;
      }
    }
  } else {
    const landRx = /\b(Island|Swamp|Plains|Forest|Mountain|Gate|Temple|Land)\b/i;
    const drawRx =
      /\b(Draw|Opt|Ponder|Brainstorm|Read the Bones|Sign in Blood|Beast Whisperer|Inspiring Call)\b/i;
    const rampRx =
      /\b(Rampant Growth|Cultivate|Kodama's|Solemn|Signet|Talisman|Sol Ring|Arcane Signet|Fellwar Stone)\b/i;
    const removalRx =
      /\b(Removal|Swords to Plowshares|Path to Exile|Terminate|Go for the Throat|Beast Within)\b/i;

    lands = entries.filter((e) => landRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    draw = entries.filter((e) => drawRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    ramp = entries.filter((e) => rampRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    removal = entries.filter((e) => removalRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    // No CMC data without Scryfall; buckets remain 0s.
  }

  // Simple curve band from deck size; ramp/draw/removal normalized
  const landTarget = format === "Commander" ? 35 : 24;
  const manaBand = lands >= landTarget ? 0.8 : lands >= landTarget - 2 ? 0.7 : 0.55;

  const bands = {
    curve: Math.min(1, Math.max(0.5, 0.8 - Math.max(0, totalCards - (format === "Commander" ? 100 : 60)) * 0.001)),
    ramp: Math.min(1, ramp / 6 + 0.4),
    draw: Math.min(1, draw / 6 + 0.4),
    removal: Math.min(1, removal / 6 + 0.2),
    mana: Math.min(1, manaBand),
  };

  const score = Math.round((bands.curve + bands.ramp + bands.draw + bands.removal + bands.mana) * 20);

  const whatsGood: string[] = [];
  const quickFixes: string[] = [];

  if (lands >= landTarget) whatsGood.push(`Mana base looks stable for ${format}.`);
  else quickFixes.push(`Add ${format === "Commander" ? "2–3" : "1–2"} lands (aim ${landTarget}${format === "Commander" ? " for EDH" : ""}).`);

  if (ramp >= 8) whatsGood.push("Healthy ramp density.");
  else quickFixes.push("Add 2 cheap rocks: <em>Arcane Signet</em>, <em>Fellwar Stone</em>.");

  if (draw >= 8) whatsGood.push("Card draw density looks fine.");
  else quickFixes.push("Add 2 draw spells: <em>Beast Whisperer</em>, <em>Inspiring Call</em>.");

  if (removal < 5) quickFixes.push(`Add 1–2 interaction pieces: <em>Swords to Plowshares</em>, <em>Path to Exile</em>.`);

  // --- NEW: Commander color-identity legality check (requires Scryfall + colors) ---
  let illegalByCI = 0;
  let illegalExamples: string[] = [];

  // --- NEW: Banned cards for selected format ---
  let bannedCount = 0;
  let bannedExamples: string[] = [];

  if (format === "Commander" && useScryfall) {
    // Banned list via Scryfall legalities
    const banned: string[] = [];
    for (const { name } of entries) {
      const c = byName.get(name.toLowerCase());
      if (!c) continue;
      if ((c.legalities?.commander || '').toLowerCase() === 'banned') banned.push(c.name);
    }
    const uniqBanned = Array.from(new Set(banned));
    bannedCount = uniqBanned.length;
    bannedExamples = uniqBanned.slice(0, 5);
  }

  if (format === "Commander" && useScryfall && selectedColors.length > 0) {
    const allowed = new Set(selectedColors.map((c) => c.toUpperCase())); // e.g. G,B
    const offenders: string[] = [];

    for (const { name } of entries) {
      const c = byName.get(name.toLowerCase());
      if (!c) continue;

      const ci = (c.color_identity ?? []).map((x) => x.toUpperCase());
      const illegal = ci.length > 0 && ci.some((symbol) => !allowed.has(symbol));
      if (illegal) offenders.push(c.name);
    }

    const uniqueOffenders = Array.from(new Set(offenders));
    illegalByCI = uniqueOffenders.length;
    illegalExamples = uniqueOffenders.slice(0, 5);
  }

  // --- NEW: curve-aware quick fixes (format-aware targets) ---
  if (useScryfall) {
    const [b01, b2, b3, b4, b5p] = curveBuckets;
    if (format === "Commander") {
      // loose, friendly targets for 100-card singleton decks
      if (b2 < 12) quickFixes.push("Fill the 2-drop gap (aim ~12): cheap dorks, signets/talismans, utility bears.");
      if (b01 < 8) quickFixes.push("Add 1–2 more one-drops: ramp dorks or cheap interaction.");
      if (b5p > 16) quickFixes.push("Top-end is heavy; trim a few 5+ CMC spells for smoother starts.");
    } else {
      // 60-card formats: suggest smoothing low curve
      if (b01 < 10) quickFixes.push("Increase low curve (≤1 CMC) to improve early plays.");
      if (b2 < 8) quickFixes.push("Add a couple more 2-drops for consistent curve.");
    }
  }

  const note =
    draw < 6 ? "needs a touch more draw" : lands < landTarget - 2 ? "mana base is light" : "solid, room to tune";

  // Meta inclusion hints: annotate cards that are popular across commanders
  let metaHints: Array<{ card: string; inclusion_rate: string; commanders: string[] }> = [];

  // --- NEW: Token needs summary (naive oracle scan for common tokens) ---
  const tokenNames = ['Treasure','Clue','Food','Soldier','Zombie','Goblin','Saproling','Spirit','Thopter','Angel','Dragon','Vampire','Eldrazi','Golem','Cat','Beast','Faerie','Plant','Insect'];
  const tokenNeedsSet = new Set<string>();
  try {
    for (const { name } of entries) {
      const c = byName.get(name.toLowerCase());
      const o = (c?.oracle_text || '').toString();
      if (/create/i.test(o) && /token/i.test(o)) {
        for (const t of tokenNames) { if (new RegExp(`\n|\b${t}\b`, 'i').test(o)) tokenNeedsSet.add(t); }
      }
    }
  } catch {}
  const tokenNeeds = Array.from(tokenNeedsSet).sort();
  try {
    const metaPath = path.resolve(process.cwd(), "AI research (2)", "AI research", "commander_metagame.json");
    const buf = await fs.readFile(metaPath, "utf8");
    const meta = JSON.parse(buf);
    if (Array.isArray(meta)) {
      const inclMap = new Map<string, { rate: string; commanders: Set<string> }>();
      for (const entry of meta) {
        const commander = String(entry?.commander_name || "");
        for (const tc of (entry?.top_cards || []) as any[]) {
          const name = String(tc?.card_name || "");
          const rate = String(tc?.inclusion_rate || "");
          if (!name) continue;
          const key = name.toLowerCase();
          const cur = inclMap.get(key) || { rate, commanders: new Set<string>() };
          const curNum = parseFloat((cur.rate || "0").replace(/[^0-9.]/g, "")) || 0;
          const newNum = parseFloat((rate || "0").replace(/[^0-9.]/g, "")) || 0;
          if (newNum > curNum) cur.rate = rate;
          cur.commanders.add(commander);
          inclMap.set(key, cur);
        }
      }
      // 1) For cards in this deck (contextual notes)
      for (const { name } of entries) {
        const m = inclMap.get(name.toLowerCase());
        if (m) metaHints.push({ card: name, inclusion_rate: m.rate, commanders: Array.from(m.commanders).slice(0, 3) });
      }
      // 2) If commander provided, offer top includes not already in deck
      if (reqCommander) {
        const deckSet = new Set(entries.map(e => e.name.toLowerCase()));
        const byCommander = (meta as any[]).find((e:any) => String(e?.commander_name || '').toLowerCase() === reqCommander.toLowerCase());
        if (byCommander && Array.isArray(byCommander.top_cards)) {
          const picks = [] as Array<{ card: string; inclusion_rate: string; commanders: string[] }>;
          for (const tc of byCommander.top_cards as any[]) {
            const name = String(tc?.card_name || '').trim();
            if (!name) continue;
            if (!deckSet.has(name.toLowerCase())) picks.push({ card: name, inclusion_rate: String(tc?.inclusion_rate || ''), commanders: [byCommander.commander_name] });
            if (picks.length >= 12) break;
          }
          // If metaHints is empty, use these as suggestions; else append
          metaHints = metaHints.concat(picks);
        }
      }
    }
  } catch {}

  // Combo detection (present + one piece missing) using the Scryfall data we already fetched
  let combosPresent: Array<{ name: string; pieces: string[] }> = [];
  let combosMissing: Array<{ name: string; have: string[]; missing: string[]; suggest: string }> = [];
  try {
    const { normalizeDeckNames, detectCombosSmart } = await import("@/lib/combos/detect");
    const names = normalizeDeckNames(deckText);
    const details: Record<string, { type_line?: string; oracle_text?: string | null; name?: string }> = {};
    for (const [k, v] of byName.entries()) details[k] = { name: v.name, type_line: v.type_line, oracle_text: v.oracle_text };
    const res = detectCombosSmart(names, details);
    combosPresent = (res.present || []).map(p => ({ name: p.name, pieces: p.pieces }));
    combosMissing = (res.missing || []).map(m => ({ name: m.name, have: m.have, missing: m.missing, suggest: m.suggest }));
  } catch {}

  // GPT-based suggestions with inference and filtering (enabled by default when useScryfall is true)
  let gptSuggestions: Array<{ card: string; reason: string }> = [];
  if (useScryfall) {
    try {
      // Infer deck context
      const inferredContext = await inferDeckContext(
        deckText,
        userMessage,
        entries,
        format,
        reqCommander,
        selectedColors,
        byName
      );

      // Log inferred values
      console.log('[analyze] Inferred context:', {
        commander: inferredContext.commander,
        colors: inferredContext.colors,
        format: inferredContext.format,
        powerLevel: inferredContext.powerLevel,
        commanderProvidesRamp: inferredContext.commanderProvidesRamp,
        landCount: inferredContext.landCount,
        archetype: inferredContext.archetype,
        protectedRoles: inferredContext.protectedRoles?.length || 0,
        isBudget: inferredContext.isBudget,
        userIntent: inferredContext.userIntent,
        curveAnalysis: inferredContext.curveAnalysis,
        roleDistribution: inferredContext.roleDistribution ? {
          byRole: inferredContext.roleDistribution.byRole,
          redundancyCount: Object.keys(inferredContext.roleDistribution.redundancy).length,
        } : null,
        manabaseAcceptable: inferredContext.manabaseAnalysis?.isAcceptable,
      });

      // Call GPT for suggestions
      const rawSuggestions = await callGPTForSuggestions(deckText, userMessage, inferredContext);
      console.log('[analyze] Raw GPT suggestions:', rawSuggestions.length, rawSuggestions.map(s => s.card));

      // Post-filter suggestions
      const currency = body.currency || 'USD';
      gptSuggestions = await postFilterSuggestions(rawSuggestions, inferredContext, byName, currency);
      console.log('[analyze] Filtered suggestions:', gptSuggestions.length, gptSuggestions.map(s => s.card));
    } catch (error) {
      console.error('[analyze] Error in GPT suggestions:', error);
      // Silently fail - GPT suggestions are nice-to-have, not critical
    }
  }

  return Response.json({
    score,
    note,
    bands,
    curveBuckets, // <= NEW
    counts: { lands, ramp, draw, removal }, // <= NEW: raw category counts for presets
    whatsGood: whatsGood.length ? whatsGood : ["Core plan looks coherent."],
    quickFixes: plan === "Budget" ? quickFixes.map((s) => s.replace("Beast Whisperer", "Guardian Project")) : quickFixes,
    illegalByCI,
    illegalExamples,
    bannedCount,
    bannedExamples,
    tokenNeeds,
    metaHints,
    combosPresent,
    combosMissing,
    suggestions: gptSuggestions, // GPT-filtered suggestions
  });
}
