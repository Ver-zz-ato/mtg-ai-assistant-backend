// lib/deck/analysis-validator.ts
// Validator for deck analysis responses

import { fetchCard } from "./inference";
import { normalizeCardName, isWithinColorIdentity, isLegalForFormat } from "./mtgValidators";
import { BANNED_LISTS } from "./banned-cards";
import { detectAntiSynergies, type AntiSynergyResult } from "./antiSynergy";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  antiSynergies?: AntiSynergyResult[];
};

export type DeckAnalysisJSON = {
  commander_name?: string;
  archetype?: string;
  game_plan?: string;
  problems?: string[];
  synergy_chains?: string[];
  recommendations?: Array<{
    card_name: string;
    reason?: string;
  }>;
};

export type ValidationContext = {
  format: "Commander" | "Modern" | "Pioneer" | "Standard" | "Brawl";
  commander?: string | null;
  colors: string[];
  deckText: string;
};

/**
 * Validates a deck analysis response (both JSON and text)
 */
export async function validateDeckAnalysis(
  response: string,
  jsonData: DeckAnalysisJSON | null,
  context: ValidationContext
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if JSON is provided
  if (!jsonData) {
    errors.push("Missing JSON output");
  } else {
    // Validate JSON structure
    if (!jsonData.commander_name && context.commander) {
      errors.push("Missing commander_name in JSON");
    }
    if (!jsonData.archetype) {
      errors.push("Missing archetype identification");
    }
    if (!jsonData.game_plan) {
      errors.push("Missing game_plan description");
    }
    if (!Array.isArray(jsonData.problems) || jsonData.problems.length === 0) {
      errors.push("Missing problems-first analysis (must list at least one problem)");
    }
    if (!Array.isArray(jsonData.synergy_chains) || jsonData.synergy_chains.length === 0) {
      errors.push("Missing synergy chains (must provide at least one synergy chain)");
    }
    if (!Array.isArray(jsonData.recommendations) || jsonData.recommendations.length < 3) {
      errors.push("Missing recommendations (must provide at least 3 legal card recommendations)");
    }

    // Validate recommendations
    if (Array.isArray(jsonData.recommendations)) {
      const bannedList = BANNED_LISTS[context.format] || {};
      const allowedColors = context.colors.length ? context.colors.map(c => c.toUpperCase()) : ["C"];

      for (const rec of jsonData.recommendations) {
        if (!rec.card_name || !rec.card_name.trim()) {
          errors.push("Recommendation missing card_name");
          continue;
        }

        const cardName = rec.card_name.trim();
        
        // Check if card exists in Scryfall
        try {
          const card = await fetchCard(cardName);
          if (!card) {
            errors.push(`Hallucinated card: ${cardName} (not found in Scryfall)`);
            continue;
          }

          // Check color identity
          if (!isWithinColorIdentity(card, allowedColors)) {
            errors.push(`Off-color recommendation: ${cardName} (not in ${allowedColors.join("/")} color identity)`);
          }

          // Check format legality
          if (!isLegalForFormat(card, context.format)) {
            errors.push(`Illegal card: ${cardName} (not legal in ${context.format})`);
          }

          // Check if banned
          if (bannedList[card.name]) {
            errors.push(`Banned card: ${cardName} (banned in ${context.format})`);
          }
        } catch (e) {
          warnings.push(`Could not validate card ${cardName}: ${String(e)}`);
        }
      }
    }
  }

  // Validate text response
  const textLower = response.toLowerCase();
  
  // Check for commander name in text (if commander provided)
  if (context.commander && !textLower.includes(context.commander.toLowerCase())) {
    warnings.push("Commander name not mentioned in text response");
  }

  // Check for archetype identification
  const archetypeKeywords = [
    "tokens", "aristocrats", "landfall", "blink", "voltron", "graveyard", "recursion",
    "spellslinger", "control", "combo", "stax", "midrange", "aggro", "ramp"
  ];
  const hasArchetype = archetypeKeywords.some(keyword => textLower.includes(keyword));
  if (!hasArchetype && !jsonData?.archetype) {
    errors.push("No archetype identified in response");
  }

  // Check for problems-first structure
  const problemKeywords = ["problem", "issue", "weakness", "missing", "lack", "low", "too few", "struggles"];
  const hasProblems = problemKeywords.some(keyword => textLower.includes(keyword));
  if (!hasProblems && (!jsonData?.problems || jsonData.problems.length === 0)) {
    errors.push("No problems-first analysis found");
  }

  // Check for synergy chains
  const synergyKeywords = ["synergy", "works with", "triggers", "enables", "payoff", "chain", "loop", "combo"];
  const hasSynergy = synergyKeywords.some(keyword => textLower.includes(keyword));
  if (!hasSynergy && (!jsonData?.synergy_chains || jsonData.synergy_chains.length === 0)) {
    errors.push("No synergy chains explained");
  }

  // Check for generic/pillar-only output
  const genericPatterns = [
    /^.*(?:ramp|draw|removal|wincons?)(?:\s+and\s+(?:ramp|draw|removal|wincons?)){2,}.*$/i,
    /you need (?:more|some) (?:ramp|draw|removal|wincons?)/i
  ];
  const isGeneric = genericPatterns.some(pattern => pattern.test(response));
  if (isGeneric && response.length < 300) {
    errors.push("Response appears to be generic pillar-only output without specific analysis");
  }

  // Check for contradictory statements
  const contradictions = [
    { pattern: /(\d+)\s*ramp/i, check: (n: number) => n < 4 || n > 20 },
    { pattern: /(\d+)\s*lands/i, check: (n: number) => n < 20 || n > 50 },
  ];
  for (const { pattern, check } of contradictions) {
    const matches = response.match(pattern);
    if (matches) {
      const num = parseInt(matches[1], 10);
      if (check(num)) {
        warnings.push(`Potentially contradictory number: ${matches[0]}`);
      }
    }
  }

  // Detect anti-synergies in the deck
  const cardLines = context.deckText.split('\n').filter(l => l.trim());
  const cardNames: string[] = [];
  for (const line of cardLines) {
    const match = line.match(/^\d*\s*x?\s*(.+?)(?:\s*\*|$)/i);
    if (match) {
      cardNames.push(match[1].trim());
    }
  }
  
  const antiSynergies = detectAntiSynergies(cardNames, context.commander);
  
  // Add severe anti-synergies to warnings
  for (const as of antiSynergies) {
    if (as.severity === 'severe') {
      warnings.push(`Anti-synergy: ${as.description} (${as.cards.slice(0, 3).join(', ')})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    antiSynergies,
  };
}

