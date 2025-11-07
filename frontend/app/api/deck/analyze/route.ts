// app/api/deck/analyze/route.ts

import fs from "node:fs/promises";
import path from "node:path";
import {
  type SfCard,
  type InferredDeckContext,
  fetchCard,
  checkIfCommander,
  inferDeckContext,
  fetchCardsBatch,
} from "@/lib/deck/inference";
import { getActivePromptVersion } from "@/lib/config/prompts";

// Commander-only cards that should not be suggested for non-Commander formats
const COMMANDER_ONLY_CARDS = [
  'Sol Ring',
  'Command Tower',
  'Arcane Signet',
  'Commander Sphere',
  'Commander Plate',
  'The Great Henge',
  'Rhystic Study',
  'Smothering Tithe',
  'Mystic Remora',
  'Dockside Extortionist',
  'Fierce Guardianship',
  'Deadly Rollick',
  'Flawless Maneuver',
  'Deflecting Swat',
  'Teferi\'s Protection',
  'Guardian Project',
  'Beast Whisperer',
  'Kindred Discovery',
  'Path of Ancestry',
  'Exotic Orchard',
  'Reflecting Pool',
];

// Prompt Version: Configurable for A/B testing (see getActivePromptVersion() usage below)

async function callGPTForSuggestions(
  deckText: string,
  userMessage: string | undefined,
  context: InferredDeckContext
): Promise<Array<{ card: string; reason: string; category?: string }>> {
  // Get active prompt version for A/B testing
  const PROMPT_VERSION = getActivePromptVersion();
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5";
  if (!apiKey) {
    return [{
      card: "N/A",
      reason: "AI service is not configured. Please contact support.",
      category: "optional"
    }];
  }

  // Build system prompt with constraints (Prompt Version: deck-ai-v4)
  let systemPrompt = "You are an expert MTG deck builder. Analyze the provided decklist and provide suggestions in 3 categories:\n";
  systemPrompt += "1. MUST-FIX issues (curve problems, land count wildly off, missing removal)\n";
  systemPrompt += "2. SYNERGY UPGRADES (on-plan swaps that improve consistency)\n";
  systemPrompt += "3. OPTIONAL/STYLISTIC (nice-to-haves, power upgrades)\n\n";
  
  systemPrompt += `CONTEXT PRIORITIZATION:\n`;
  systemPrompt += `- When giving advice, prioritize information derived from the user's actual decklist over general format trends or card popularity.\n`;
  systemPrompt += `- Do not recommend generic staples if the deck already has sufficient cards fulfilling that role.\n\n`;
  
  systemPrompt += `FORMAT & POWER LEVEL:\n`;
  systemPrompt += `- Detected format: ${context.format}\n`;
  if (context.format === "Commander") {
    systemPrompt += `- WARNING: This is Commander format. Do NOT suggest narrow 4-of-y cards or cards that rely on multiples. Suggest singleton-viable cards only.\n`;
  } else {
    systemPrompt += `- WARNING: This is NOT Commander format (${context.format}). Do NOT suggest Commander-only cards like Sol Ring, Command Tower, Arcane Signet, or any other Commander-only cards.\n`;
    systemPrompt += `- Only suggest cards legal in ${context.format} format.\n`;
  }
  systemPrompt += `- LEGALITY: Only recommend cards that are legal in the deck's current format. Never suggest Unfinity or silver-bordered cards unless the user specifically requests them.\n`;
  systemPrompt += `- Do NOT suggest cards that are already in the decklist.\n`;
  systemPrompt += `- CRITICAL: Do not suggest cards that are already in the user's deck. The current deck list is authoritative.\n`;
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
    if (context.partnerCommanders && context.partnerCommanders.length >= 2) {
      systemPrompt += `- Partner Commanders: ${context.partnerCommanders.join(' + ')}\n`;
    } else {
      systemPrompt += `- Commander: ${context.commander}\n`;
    }
    if (context.commanderOracleText) {
      systemPrompt += `- Commander oracle text: ${context.commanderOracleText}\n`;
      if (context.partnerCommanders && context.partnerCommanders.length >= 2) {
        systemPrompt += `- When evaluating cards, check if they synergize with BOTH partner commanders. Cards that advance either partner's strategy or enable both are highly valuable.\n`;
      } else {
        systemPrompt += `- When evaluating cards, first check: does this card directly advance the commander's text, trigger it more often, or enable the deck's main mechanic? If yes, increase its keep-score.\n`;
      }
    }
    if (context.commanderProvidesRamp || context.existingRampCount >= 3) {
      if (context.commanderProvidesRamp && context.existingRampCount >= 3) {
        systemPrompt += `- WARNING: This deck already has sufficient ramp for its plan (commander provides ramp + ${context.existingRampCount} ramp pieces). Do not suggest common 2-3 mana green ramp spells unless there is a synergy reason.\n`;
      } else if (context.commanderProvidesRamp) {
        systemPrompt += `- WARNING: The commander already provides ramp. Do NOT suggest generic 2-3 mana ramp like Cultivate or Kodama's Reach unless there is a specific synergy reason (e.g., landfall, mana value fixing).\n`;
      } else {
        systemPrompt += `- WARNING: This deck already has ${context.existingRampCount} ramp pieces. Do not suggest common 2-3 mana green ramp spells unless there is a synergy reason.\n`;
      }
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
  
  systemPrompt += `\nSTYLE PRESERVATION:\n`;
  systemPrompt += `- Preserve the deck's playstyle identity (e.g. control, combo, midrange, tokens). Add cards that strengthen its core strategy rather than changing it.\n`;

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
  
  systemPrompt += `\nWIN CONDITION AWARENESS:\n`;
  systemPrompt += `- If the deck already contains multiple finishers or 'overrun' style effects (e.g. Craterhoof Behemoth, Jetmir, Fiery Emancipation, Moonshaker Cavalry), avoid recommending more effects of the same type. Prefer supporting/ramp/fixing cards instead.\n`;
  
  systemPrompt += `\nREDUNDANCY AVOIDANCE:\n`;
  systemPrompt += `- If the deck already has several cards fulfilling the same mechanical role (e.g. multiple board wipes, several mana doublers, or redundant draw engines), avoid suggesting more of the same unless a clear synergy justifies it.\n`;
  systemPrompt += `- This rule applies across all categories: ramp, removal, draw, win conditions, protection, etc. Check existing card counts before suggesting additions.\n`;

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
      
      systemPrompt += `- When commenting on the manabase, compare lands to actual color requirements in the spell list. Only comment on manabase if colors are imbalanced by more than 15%. Do not give generic "balance your manabase" advice if the current distribution already matches spell requirements within 10-15%.\n`;
      
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
  systemPrompt += `\nBUDGET AWARENESS:\n`;
  systemPrompt += `- Respect the deck's budget setting. When suggesting cards, prefer cheaper equivalents over premium versions unless the user explicitly asks for upgrades.\n`;
  systemPrompt += `- Avoid pushing expensive staples (e.g. Gaea's Cradle, Lion's Eye Diamond, Mana Crypt) in casual or budget decks.\n`;

  systemPrompt += `\nCARD ANALYSIS ACCURACY:\n`;
  systemPrompt += `- Only call a card 'draw' or 'filtering' if it actually draws, loots (draw then discard), rummages (discard then draw), or impulsively looks at cards. Do not label burn or removal spells as card advantage.\n`;
  systemPrompt += `- When describing card draw or hand effects, distinguish between card advantage (net gain of cards) and card filtering (same number of cards but improved quality). For example, Faithless Looting and Careful Study are filtering, not draw engines.\n`;
  systemPrompt += `- Tutor cards like Vampiric Tutor, Demonic Tutor, Enlightened Tutor, Worldly Tutor are NOT removal. Classify them as tutors/utility, not removal.\n`;
  
  systemPrompt += `\nCONTINUOUS IMPROVEMENT:\n`;
  systemPrompt += `- Your suggestions are tracked and reviewed. Cards that are frequently shown but not accepted by users may indicate issues with the suggestion (wrong format, off-color, already in deck, etc.). Learn from rejection patterns to improve future suggestions.\n`;
  
  systemPrompt += `\nOUTPUT FORMAT:\n`;
  systemPrompt += `- Structure suggestions in 3 buckets: must-fix, synergy-upgrades, optional-stylistic\n`;
  systemPrompt += `- SUGGESTION DIVERSITY: When giving card suggestions, balance them across roles — a few ramp pieces, a few draw engines, a few interaction options — rather than ten cards from one category.\n`;
  systemPrompt += `- SYNERGY REASONING: Always explain why each suggestion fits the deck's strategy in one short sentence. Make the connection to the deck's plan clear.\n`;
  systemPrompt += `- Add a quick reason per item so users can see why and ignore if hallucinated.\n`;
  systemPrompt += `- Use the provided decklist as source of truth.\n`;
  systemPrompt += `- Return suggestions with short justifications (1 sentence each).\n`;
  systemPrompt += `- Respond ONLY with a JSON array: [{"card": "Card Name", "reason": "short justification", "category": "must-fix|synergy-upgrade|optional"}]\n`;
  
  systemPrompt += `\n### Guidance for MTG user trust\n\n`;
  systemPrompt += `When advising, first acknowledge the deck's existing themes or synergies, then build on them. Example: 'You're already doing landfall, so…'\n\n`;
  systemPrompt += `Treat unusual or flavorful card choices as intentional. Offer complementary cards before suggesting cuts, unless the user asks for strict optimization.\n\n`;
  systemPrompt += `If the user's request is ambiguous (for example 'make it faster'), ask a short clarifying question before giving specific card names.\n\n`;
  systemPrompt += `When recommending a card or combo, explain the interaction in one short sentence so the user can see why it fits.\n\n`;
  systemPrompt += `Use official sources (Oracle/Scryfall data) as the authority for rules, legality, and card text. Don't invent cards.\n\n`;
  systemPrompt += `Avoid overhyped language like 'auto-include' or 'must run'. Prefer 'strong in this archetype' or 'commonly played finisher'.\n\n`;
  systemPrompt += `If the deck's archetype isn't clear from the list, say so and ask the user to clarify whether it's aiming for combo / midrange / tokens / control.\n\n`;
  systemPrompt += `Adjust tone by format: Commander = synergy/fun/politics, 60-card formats = efficiency/curve/consistency.\n\n`;
  systemPrompt += `If the user points out that a previous suggestion was wrong or redundant, acknowledge it and adjust the next suggestions accordingly.\n\n`;
  systemPrompt += `Keep responses concise and scannable — short bullets with card name + reason.\n\n`;
  
  systemPrompt += `### Advanced Co-Pilot Behaviors\n\n`;
  systemPrompt += `1. METAGAME REFERENCE: When mentioning metagame trends, describe them as current tendencies, not absolutes. Example: 'In recent Commander data, this combo is common,' instead of 'This is the best combo.' If no data is available, focus on reasoning from card interactions rather than popularity.\n\n`;
  systemPrompt += `2. ENCOURAGE ITERATION: End deck improvement responses with one line suggesting a next step the user can try, e.g. 'Would you like me to balance the mana curve next?' or 'Want to see alternatives for your ramp package?'\n\n`;
  systemPrompt += `3. FORMAT-LEGAL FALLBACK: If a suggested card is not legal in the current format, automatically offer the closest legal alternative or flag it as 'illegal but similar idea.'\n\n`;
  systemPrompt += `4. MEMORY OF PREVIOUS ANALYSIS: If the user has already analyzed this deck before, summarize what was fixed last time ('You already added ramp last session') before giving new advice.\n\n`;
  systemPrompt += `5. EXPLAIN TRADE-OFFS: For each improvement suggestion, explain one potential drawback. Example: 'This adds consistency but makes you weaker to artifact hate.'\n\n`;
  systemPrompt += `6. AESTHETIC AWARENESS: If the deck clearly has a theme or aesthetic (tribal, color motif, story flavor), mention how new cards fit that identity.\n\n`;
  systemPrompt += `7. FUTURE-PROOFING: If a user asks about a card or mechanic from a set that hasn't released yet, clarify that release info can change and reference previews cautiously.\n\n`;
  systemPrompt += `8. PRE-EMPT SIDEBOARD / META MATCHUPS: When suggesting cards, briefly mention what matchups or archetypes the card helps against (e.g., 'Great vs graveyard decks,' 'Helps against blue control'). This makes advice feel tactical, not theoretical.\n\n`;
  systemPrompt += `9. MENTION PLAY PATTERNS: When recommending a card, describe how it changes actual turns ('lets you keep mana up for removal,' 'smooths early draws'). MTG players think in sequencing — this turns the AI's output from abstract theory into lived experience.\n\n`;
  systemPrompt += `10. TIE RECOMMENDATIONS TO DECK GOALS: When suggesting a change, connect it back to the deck's win condition or philosophy ('helps you reach your combo faster,' 'makes your token swarm lethal sooner'). Every suggestion should feel purpose-linked, not random.\n\n`;
  systemPrompt += `11. NEVER ASSUME SINGLETON: If the format allows multiples (Standard, Modern, etc.), clarify how many copies to consider and why. Most AIs forget that Commander is singleton but others aren't.\n\n`;
  systemPrompt += `12. MIND THE CURVE VISUALLY: When commenting on mana curve, phrase it in plain gameplay terms: 'You might struggle on turns two to three,' instead of 'Your curve distribution is skewed low.' Better UX = wider audience.\n\n`;
  systemPrompt += `13. ACKNOWLEDGE SOCIAL DYNAMICS IN MULTIPLAYER: In Commander advice, mention table perception ('This might draw aggro early,' 'Keeps a low profile until the win turn'). The Commander community loves when the AI respects politics.\n\n`;
  systemPrompt += `14. ENCOURAGE SELF-TESTING: When suggesting changes, remind the user to goldfish or simulate a few opening hands to test curve or ramp consistency. This cross-promotes your own Mulligan Simulator and Probability Panel features naturally.`;

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
    }).catch((error) => {
      // Network/timeout error
      return {
        ok: false,
        error: { message: error?.message || 'Network error', code: 'network_error' }
      } as any;
    });

    if (!r) {
      // Network failure
      return [{
        card: "N/A",
        reason: "AI service temporarily unavailable due to network issues. Please try again in a moment.",
        category: "optional"
      }];
    }

    if (!r.ok) {
      const errorBody = await r.json().catch(() => ({}));
      const errorMsg = String(errorBody?.error?.message || '').toLowerCase();
      const status = r.status;
      
      // Rate limit error
      if (status === 429 || /rate limit|too many requests/i.test(errorMsg)) {
        return [{
          card: "N/A",
          reason: "AI service is currently rate-limited. Please wait a moment and try again.",
          category: "optional"
        }];
      }
      
      // API key missing or invalid
      if (status === 401 || /unauthorized|invalid.*key|api key/i.test(errorMsg)) {
        return [{
          card: "N/A",
          reason: "AI service is not configured. Please contact support.",
          category: "optional"
        }];
      }
      
      // Model not found or access denied
      if (status === 404 || /model.*not found|access denied/i.test(errorMsg)) {
        return [{
          card: "N/A",
          reason: "AI model unavailable. Please try again later.",
          category: "optional"
        }];
      }
      
      // Generic error
      return [{
        card: "N/A",
        reason: "AI service temporarily unavailable. Please try again in a moment.",
        category: "optional"
      }];
    }
    
    const j: any = await r.json().catch(() => ({}));
    const text = (j?.output_text || "").trim();
    
    // Try to extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (parseError) {
        // Parse error - return helpful message
        return [{
          card: "N/A",
          reason: "AI response format error. Please try again.",
          category: "optional"
        }];
      }
    }
    
    // Empty or invalid response
    return [{
      card: "N/A",
      reason: "AI service returned an invalid response. Please try again.",
      category: "optional"
    }];
  } catch (error: any) {
    // Unexpected error
    const errorMsg = String(error?.message || '').toLowerCase();
    if (/timeout|timed out/i.test(errorMsg)) {
      return [{
        card: "N/A",
        reason: "AI service request timed out. Please try again.",
        category: "optional"
      }];
    }
    
    return [{
      card: "N/A",
      reason: "AI service temporarily unavailable. Please try again in a moment.",
      category: "optional"
    }];
  }
}

// Helper: Check if land produces colors outside allowed colors
function checkLandColors(card: SfCard, allowedColors: Set<string>): boolean {
  const typeLine = (card.type_line || '').toLowerCase();
  const oracleText = (card.oracle_text || '').toLowerCase();
  
  // If not a land, skip this check
  if (!/land/i.test(typeLine)) return true;
  
  // Check color_identity first
  const cardColors = (card.color_identity || []).map(c => c.toUpperCase());
  if (cardColors.length > 0) {
    const hasOffColor = cardColors.some(c => !allowedColors.has(c));
    if (hasOffColor) return false;
  }
  
  // Check what colors the land produces from oracle text
  const producedColors = new Set<string>();
  
  // Check for "add {W/U/B/R/G}" patterns
  const addManaRe = /add\s+\{([WUBRG])\}/gi;
  let match;
  while ((match = addManaRe.exec(oracleText)) !== null) {
    producedColors.add(match[1].toUpperCase());
  }
  
  // Check for "tapped" lands that produce specific colors
  if (/tapped/i.test(oracleText)) {
    // Panoramas and fetch lands: check what they can fetch
    if (/panorama/i.test(card.name)) {
      // Extract color words from name (e.g., "Jund Panorama" -> B, R, G)
      const nameLower = card.name.toLowerCase();
      // Shards (3-color combinations)
      if (nameLower.includes('jund')) {
        producedColors.add('B');
        producedColors.add('R');
        producedColors.add('G');
      }
      if (nameLower.includes('naya')) {
        producedColors.add('W');
        producedColors.add('R');
        producedColors.add('G');
      }
      if (nameLower.includes('bant')) {
        producedColors.add('W');
        producedColors.add('U');
        producedColors.add('G');
      }
      if (nameLower.includes('esper')) {
        producedColors.add('W');
        producedColors.add('U');
        producedColors.add('B');
      }
      if (nameLower.includes('grixis')) {
        producedColors.add('U');
        producedColors.add('B');
        producedColors.add('R');
      }
      // Wedges (2+1 color combinations)
      if (nameLower.includes('abzan')) {
        producedColors.add('W');
        producedColors.add('B');
        producedColors.add('G');
      }
      if (nameLower.includes('jeskai')) {
        producedColors.add('W');
        producedColors.add('U');
        producedColors.add('R');
      }
      if (nameLower.includes('sultai')) {
        producedColors.add('U');
        producedColors.add('B');
        producedColors.add('G');
      }
      if (nameLower.includes('mardu')) {
        producedColors.add('W');
        producedColors.add('B');
        producedColors.add('R');
      }
      if (nameLower.includes('temur')) {
        producedColors.add('U');
        producedColors.add('R');
        producedColors.add('G');
      }
    }
    
    // Fetch lands: check oracle text for what they can fetch
    if (/fetch|search.*library.*land/i.test(oracleText)) {
      // Check for "Mountain or Forest", "Plains or Island", etc.
      const landTypes = ['plains', 'island', 'swamp', 'mountain', 'forest'];
      const colorMap: Record<string, string> = {
        plains: 'W',
        island: 'U',
        swamp: 'B',
        mountain: 'R',
        forest: 'G',
      };
      for (const landType of landTypes) {
        if (new RegExp(landType, 'i').test(oracleText)) {
          producedColors.add(colorMap[landType]);
        }
      }
    }
  }
  
  // Check basic lands
  if (/plains/i.test(card.name)) producedColors.add('W');
  if (/island/i.test(card.name)) producedColors.add('U');
  if (/swamp/i.test(card.name)) producedColors.add('B');
  if (/mountain/i.test(card.name)) producedColors.add('R');
  if (/forest/i.test(card.name)) producedColors.add('G');
  
  // If land produces colors, all must be in allowed colors
  if (producedColors.size > 0) {
    for (const color of producedColors) {
      if (!allowedColors.has(color)) return false;
    }
  }
  
  return true;
}

function extractManaColors(manaCost: string | undefined): Set<string> {
  const colors = new Set<string>();
  if (!manaCost) return colors;
  const symbolRe = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = symbolRe.exec(manaCost)) !== null) {
    const symbol = match[1].toUpperCase();
    const letters = symbol.match(/[WUBRG]/g);
    if (letters) {
      letters.forEach((letter) => colors.add(letter));
    }
  }
  return colors;
}

function hasDoublePip(manaCost: string | undefined): boolean {
  if (!manaCost) return false;
  const counts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const symbolRe = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = symbolRe.exec(manaCost)) !== null) {
    const symbol = match[1].toUpperCase();
    const letters = symbol.match(/[WUBRG]/g);
    if (letters) {
      for (const letter of letters) {
        counts[letter] = (counts[letter] || 0) + 1;
        if (counts[letter] >= 2) return true;
      }
    }
  }
  return false;
}

// Helper: Check if card actually draws/loots/rummages/impulses
function isRealDrawOrFilter(card: SfCard): boolean {
  const oracleText = (card.oracle_text || '').toLowerCase();
  
  // Check for actual draw effects
  if (/draw a card|draw.*cards|draw equal to/i.test(oracleText)) return true;
  
  // Check for looting (draw then discard)
  if (/draw.*card.*discard|draw.*then discard/i.test(oracleText)) return true;
  
  // Check for rummaging (discard then draw)
  if (/discard.*card.*draw|discard.*then draw/i.test(oracleText)) return true;
  
  // Check for impulse draw (exile and cast)
  if (/exile.*cards.*cast|exile.*top.*cast|look at.*exile.*cast/i.test(oracleText)) return true;
  
  // Check for "look at" / "reveal" that lets you take cards
  if (/look at.*top.*put.*into|reveal.*top.*put.*into|look at.*choose.*put/i.test(oracleText)) return true;
  
  // Check for scry (filtering, not draw, but counts as card quality improvement)
  if (/scry [0-9]/i.test(oracleText)) return true;
  
  return false;
}

// Helper: Check if card is generic ramp
function isGenericRamp(cardName: string): boolean {
  const nameLower = cardName.toLowerCase();
  const genericRamp = [
    // Land ramp
    'cultivate',
    "kodama's reach",
    'rampant growth',
    'farseek',
    "nature's lore",
    'three visits',
    'sakura-tribe elder',
    'wood elves',
    'farhaven elf',
    'solemn simulacrum',
    // Generic mana rocks
    'arcane signet',
    'sol ring',
    'emerald medallion',
    'sapphire medallion',
    'jet medallion',
    'ruby medallion',
    'pearl medallion',
    'thought vessel',
    'mind stone',
    'fellwar stone',
    'prismatic lens',
    'star compass',
    'commander sphere',
    'guardian idol',
    'coldsteel heart',
    'firemind vessel',
    'honed edge',
  ];
  return genericRamp.some(ramp => nameLower.includes(ramp));
}

// Helper: Normalize card name for comparison (lowercase, trim, remove punctuation)
function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,;:'"!?()[\]{}]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\s+/g, ''); // Remove all spaces for comparison
}

// Helper: Check if card is a board wipe that might harm the deck's plan
function isHarmfulBoardWipe(card: SfCard, context: InferredDeckContext): boolean {
  const oracleText = (card.oracle_text || '').toLowerCase();
  const typeLine = (card.type_line || '').toLowerCase();
  const nameLower = card.name.toLowerCase();
  
  // Check if it's a board wipe
  const isBoardWipe = 
    /destroy all (creatures|permanents|nonland|artifacts|enchantments)/i.test(oracleText) ||
    /exile all (creatures|permanents|nonland)/i.test(oracleText) ||
    /all (creatures|permanents|nonland) get -[0-9]/i.test(oracleText) ||
    /damage to each (creature|permanent|nonland)/i.test(oracleText) ||
    /wrath|damnation|terminus|doomsday/i.test(nameLower) ||
    /board wipe|sweeper/i.test(nameLower);
  
  if (!isBoardWipe) return false;
  
  // Check if deck is creature-heavy (token/sac/aristocrats archetype)
  if (context.archetype === 'token_sac' || context.archetype === 'aristocrats') {
    return true; // Harmful to creature-heavy decks
  }
  
  // Check if deck has many creatures (from role distribution)
  const creatureCount = context.roleDistribution?.byRole.engine_enabler || 0;
  const tokenProducers = context.roleDistribution?.cardRoles.filter(c => 
    c.roles.includes('engine_enabler') && 
    /create|token|1\/1|2\/2/i.test((c.name || '').toLowerCase())
  ).length || 0;
  
  // If deck has many creatures or token producers, board wipes are harmful
  if (creatureCount > 10 || tokenProducers > 3) {
    return true;
  }
  
  return false;
}

async function postFilterSuggestions(
  suggestions: Array<{ card: string; reason: string; category?: string }>,
  context: InferredDeckContext,
  byName: Map<string, SfCard>,
  currency: string = 'USD',
  deckEntries: Array<{ count: number; name: string }> = [],
  userId: string | null = null
): Promise<Array<{ card: string; reason: string; category?: string; id?: string; needs_review?: boolean }>> {
  let allowedColors = new Set(context.colors.map(c => c.toUpperCase()));
  if (allowedColors.size === 0) {
    allowedColors = new Set(['C']);
  }
  const filtered: Array<{ card: string; reason: string; category?: string; id?: string; needs_review?: boolean }> = [];
  const removalReasons = new Set<string>();
  
  // Normalize deck entry names for deduplication
  const normalizedDeckNames = new Set(
    deckEntries.map(e => normalizeCardName(e.name))
  );

  const wantsBudgetChecks = context.isBudget || context.budgetCapPerCard !== undefined || context.budgetTotalCap !== undefined;
  const priceMap: Map<string, number> = new Map();
  let deckPriceTotal = 0;
  let deckPricedCardCount = 0;
  let deckAveragePrice = 0;

  if (wantsBudgetChecks) {
    try {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();

      const suggestionNames = suggestions.map((s) => s.card.toLowerCase().trim()).filter(Boolean);
      const deckNames = deckEntries.map((d) => d.name.toLowerCase().trim()).filter(Boolean);
      const uniqueNames = Array.from(new Set([...suggestionNames, ...deckNames]));

      if (uniqueNames.length > 0) {
        const { data: priceRows } = await supabase
          .from('price_cache')
          .select('name, usd, eur, gbp')
          .in('name', uniqueNames);

        if (priceRows) {
          const pickPrice = (row: { usd?: number | null; eur?: number | null; gbp?: number | null }): number | undefined => {
            if (currency === 'EUR') return row.eur ?? undefined;
            if (currency === 'GBP') return row.gbp ?? undefined;
            return row.usd ?? undefined;
          };

          const normalizedPriceMap = new Map<string, number>();
          for (const row of priceRows) {
            const key = row.name?.toLowerCase?.() ?? '';
            if (!key) continue;
            const price = pickPrice(row);
            if (price !== undefined && price >= 0) {
              normalizedPriceMap.set(key, price);
            }
          }

          // Populate suggestion price map
          for (const name of suggestionNames) {
            if (normalizedPriceMap.has(name)) {
              priceMap.set(name, normalizedPriceMap.get(name)!);
            }
          }

          // Compute deck price estimates
          for (const entry of deckEntries) {
            const norm = entry.name.toLowerCase().trim();
            const price = normalizedPriceMap.get(norm);
            if (price !== undefined && price > 0) {
              deckPriceTotal += price * entry.count;
              deckPricedCardCount += entry.count;
            }
          }

          if (deckPricedCardCount > 0) {
            deckAveragePrice = deckPriceTotal / deckPricedCardCount;
          }
        }
      }
    } catch (error) {
      console.warn('[filter] Failed to fetch prices for budget filtering:', error);
    }
  }

  if (wantsBudgetChecks && deckPriceTotal > 0) {
    context.deckPriceEstimate = deckPriceTotal;
    if (typeof context.budgetTotalCap === 'number') {
      context.budgetHeadroom = context.budgetTotalCap - deckPriceTotal;
    }
  }

  const budgetPerCardCap = context.budgetCapPerCard ?? (context.isBudget ? 10 : undefined);
  const budgetTotalCap = typeof context.budgetTotalCap === 'number' ? context.budgetTotalCap : undefined;
  const requiresPriceData = budgetPerCardCap !== undefined || budgetTotalCap !== undefined;

  filterLoop: for (const suggestion of suggestions) {
    try {
      // VERIFY CARD EXISTS: Drop hallucinated card names
      // First try exact match, then try normalized
      let card = byName.get(suggestion.card.toLowerCase());
      
      // If not found, try normalized name lookup
      if (!card) {
        const normalized = normalizeCardName(suggestion.card);
        // Try to find by iterating through map keys
        for (const [key, value] of byName.entries()) {
          if (normalizeCardName(key) === normalized) {
            card = value;
            break;
          }
        }
      }
      
      // If still not found, try fetching from Scryfall
      if (!card) {
        const fetchedCard = await fetchCard(suggestion.card);
        if (fetchedCard) {
          card = fetchedCard;
          byName.set(fetchedCard.name.toLowerCase(), fetchedCard);
        }
      }
      
      // If still not found, this is likely a hallucinated card name - mark for review but don't drop
      // (we'll let it through but flag it so frontend can show a warning)
      if (!card) {
        console.log(`[filter] Dropped ${suggestion.card}: card lookup failed (likely hallucinated)`);
        removalReasons.add('card lookup failed');
        continue;
      }

      // Ensure we have up-to-date legality info for format checks
      if (context.format !== "Commander") {
        const legalityKey = context.format.toLowerCase();
        const existingLegality = card.legalities ? card.legalities[legalityKey] : undefined;
        if (typeof existingLegality !== 'string') {
          const refreshed = await fetchCard(card.name);
          const refreshedLegality = refreshed?.legalities ? refreshed.legalities[legalityKey] : undefined;
          if (refreshed && typeof refreshedLegality === 'string') {
            card = refreshed;
            byName.set(refreshed.name.toLowerCase(), refreshed);
          } else {
            console.log(`[filter] Dropped ${suggestion.card}: legality data unavailable for ${context.format}`);
            removalReasons.add('format data unavailable');
            continue;
          }
        }
      }

      // At this point, card is guaranteed to be defined (not null/undefined)
      // STRICT COLOR FILTERING: Remove any card with colors outside allowed colors
      // Even if partially shared (e.g., Lightning Helix in Mono-Red)
      const cardColors = (card.color_identity || []).map(c => c.toUpperCase());
      const hasOffColor = cardColors.length > 0 && cardColors.some(c => !allowedColors.has(c));
      
      if (hasOffColor) {
        removalReasons.add('off-color identity');
        console.log(`[filter] Removed ${suggestion.card}: off-color (${cardColors.join(',')} not in ${Array.from(allowedColors).join(',')})`);
        continue;
      }
      
      // For colorless cards, allow them (they don't have color identity)
      // But if they have mana costs with colors, check those too
      const manaCostColors = extractManaColors(card.mana_cost);
      for (const color of manaCostColors) {
        if (!allowedColors.has(color)) {
          removalReasons.add('off-color mana cost');
          console.log(`[filter] Removed ${suggestion.card}: mana cost includes off-color (${color})`);
          continue filterLoop;
        }
      }
      
      // Special check for lands: verify they produce allowed colors
      const typeLine = (card.type_line || '').toLowerCase();
      if (/land/i.test(typeLine)) {
        const landColorsOk = checkLandColors(card, allowedColors);
        if (!landColorsOk) {
          removalReasons.add('off-color land');
          console.log(`[filter] Removed ${suggestion.card}: off-color land (produces colors outside deck)`);
          continue;
        }
      }

      // Check for duplicate cards (already in deck) - using normalized names
      const cardNameNormalized = normalizeCardName(suggestion.card);
      if (normalizedDeckNames.has(cardNameNormalized)) {
        removalReasons.add('duplicate');
        console.log(`[filter] Removed ${suggestion.card}: already in deck (normalized match)`);
        continue;
      }

      // Check for Commander-only cards in non-Commander formats
      if (context.format !== "Commander") {
        const normalizedCardName = normalizeCardName(suggestion.card);
        const isCommanderOnly = COMMANDER_ONLY_CARDS.some(cmdCard => {
          const normalizedCmdCard = normalizeCardName(cmdCard);
          return normalizedCardName === normalizedCmdCard || normalizedCardName.includes(normalizedCmdCard);
        });
        if (isCommanderOnly) {
          removalReasons.add('format restriction');
          console.log(`[filter] Removed ${suggestion.card}: Commander-only card in ${context.format} format`);
          continue;
        }
      }

      // Check format legality (if format is specified)
      if (context.format === "Modern" || context.format === "Pioneer") {
        const formatLegal = context.format === "Modern" 
          ? (card.legalities?.modern || '').toLowerCase() === 'legal'
          : (card.legalities?.pioneer || '').toLowerCase() === 'legal';
        if (!formatLegal && card.legalities) {
          removalReasons.add('format restriction');
          console.log(`[filter] Removed ${suggestion.card}: not legal in ${context.format}`);
          continue;
        }
      }

      // Check curve constraints
      if (context.curveAnalysis) {
        const cmc = card.cmc || 0;
        // Don't suggest 6-drops if low curve unless wincon
        if (context.curveAnalysis.lowCurve && cmc >= 6) {
          const reasonLower = suggestion.reason.toLowerCase();
          if (!reasonLower.includes('win') && !reasonLower.includes('finisher')) {
            removalReasons.add('curve cap');
            console.log(`[filter] Removed ${suggestion.card}: 6+ CMC in low-curve deck`);
            continue;
          }
        }
        
        // Don't suggest double-pip cards if manabase is tight
        if (context.curveAnalysis.tightManabase && hasDoublePip(card.mana_cost)) {
          removalReasons.add('mana base constraint');
          console.log(`[filter] Removed ${suggestion.card}: double-pip card in tight manabase`);
          continue;
        }
      }

      // Check for incorrect draw/filter classification
      const reasonLower = suggestion.reason.toLowerCase();
      const claimsDraw = /\b(draw|filtering|hand full|card advantage|keeps.*hand|refills.*hand)\b/i.test(reasonLower);
      if (claimsDraw && !isRealDrawOrFilter(card)) {
        removalReasons.add('misclassified draw');
        console.log(`[filter] Removed ${suggestion.card}: not real draw/filter (reason claimed draw but card doesn't)`);
        continue;
      }
      
      // Filter out generic ramp if commander provides ramp OR deck has sufficient ramp
      const isGenRamp = isGenericRamp(suggestion.card);
      if (isGenRamp && (context.commanderProvidesRamp || context.existingRampCount >= 3)) {
        // Check if reason explicitly mentions synergy (landfall, fixing, etc.)
        const hasSynergy = reasonLower.includes('landfall') || 
                          reasonLower.includes('mana value') || 
                          reasonLower.includes('fixing') ||
                          reasonLower.includes('synergy');
        if (!hasSynergy) {
          removalReasons.add('redundant ramp');
          console.log(`[filter] Removed ${suggestion.card}: redundant ramp when commander/deck already ramps`);
          continue;
        }
      }
      
      // Filter out board wipes that harm the deck's plan
      if (isHarmfulBoardWipe(card, context)) {
        removalReasons.add('plan conflict');
        console.log(`[filter] Removed ${suggestion.card}: harmful board wipe for creature-heavy deck`);
        continue;
      }

      // Budget filtering
      let cardPrice: number | undefined;
      if (requiresPriceData) {
        cardPrice = priceMap.get(suggestion.card.toLowerCase().trim());
        if (cardPrice === undefined) {
          removalReasons.add('price unavailable');
          console.log(`[filter] Removed ${suggestion.card}: price unavailable for budget enforcement`);
          continue;
        }
      }

      if (budgetPerCardCap !== undefined && cardPrice !== undefined) {
        const allowsPremium = reasonLower.includes('upgrade') || reasonLower.includes('premium') || reasonLower.includes('powerful');
        if (cardPrice > budgetPerCardCap && !allowsPremium) {
          removalReasons.add('budget cap');
          console.log(`[filter] Removed ${suggestion.card}: ${currency} ${cardPrice.toFixed(2)} exceeds per-card cap ${budgetPerCardCap}`);
          continue;
        }
      }

      if (
        budgetTotalCap !== undefined &&
        cardPrice !== undefined &&
        deckPriceTotal > 0 &&
        deckAveragePrice > 0
      ) {
        const baselineReplace = deckAveragePrice;
        const estimatedNewTotal = deckPriceTotal - baselineReplace + cardPrice;
        if (estimatedNewTotal > budgetTotalCap + 0.01) {
          removalReasons.add('budget total cap');
          console.log(`[filter] Removed ${suggestion.card}: would exceed total budget (${estimatedNewTotal.toFixed(2)} > ${budgetTotalCap.toFixed(2)})`);
          continue;
        }
      }

      // Add unique ID and needs_review flag (card is guaranteed to exist here)
      const suggestionWithMeta = {
        ...suggestion,
        id: crypto.randomUUID(),
        needs_review: false,
      };
      filtered.push(suggestionWithMeta);
    } catch (error) {
      // Skip on error (fail gracefully)
      console.warn(`[filter] Error processing ${suggestion.card}:`, error);
      continue filterLoop;
    }
  }

  // If all suggestions were filtered out, return a helpful message
  if (filtered.length === 0 && suggestions.length > 0) {
    console.log(`[filter] Final suggestions: 0 (removed ${suggestions.length})`);
    
    // Evaluation Mode: Track when suggestions are exhausted
    const deckSize = deckEntries.reduce((sum, e) => sum + e.count, 0);
    const evalData = {
      format: context.format,
      colors: context.colors.join(','),
      deck_size: deckSize,
      archetype: context.archetype || 'none',
      power_level: context.powerLevel || 'unknown',
      raw_suggestions_count: suggestions.length,
      prompt_version: getActivePromptVersion(),
    };
    
    console.log(`[evaluation] ai_suggestion_exhausted`, evalData);
    
    // Server-side PostHog tracking
    try {
      const { captureServer } = await import("@/lib/server/analytics");
      await captureServer('ai_suggestion_exhausted', evalData, userId || null);
    } catch (error) {
      console.warn('[evaluation] Failed to track ai_suggestion_exhausted:', error);
    }
    
    const reasonList = Array.from(removalReasons);
    const fallbackReason = reasonList.length
      ? `No suggestions survived filtering (${reasonList.join(', ')}). Ask for a reroll with a different focus or adjust your request.`
      : "Your deck is already tight for this format. I can help in one of these ways: [1] fine-tune manabase, [2] add interaction, [3] budget passes, [4] polish theme text.";

    return [{
      card: "N/A",
      reason: fallbackReason,
      category: "optional",
      id: crypto.randomUUID(),
      needs_review: false,
    }];
  }

  console.log(`[filter] Final suggestions: ${filtered.length} (removed ${suggestions.length - filtered.length})`);
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
  const currency: "USD" | "EUR" | "GBP" = (body.currency as "USD" | "EUR" | "GBP") ?? "USD";

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
    // Use batch fetching for better performance (checks DB cache first, then fetches missing cards in batches of 75)
    const batchResults = await fetchCardsBatch(unique);
    // Copy batch results to byName map
    // fetchCardsBatch returns normalized keys, but we store using lowercase for compatibility with existing code
    for (const [key, card] of batchResults.entries()) {
      byName.set(card.name.toLowerCase(), card);
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

  // Get user ID for analytics (optional - doesn't block if auth fails)
  let userId: string | null = null;
  try {
    const { getServerSupabase } = await import("@/lib/server-supabase");
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || null;
  } catch {
    // User ID is optional for analytics
  }

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
        byName,
        { plan, currency }
      );

      // Log inferred values with enhanced logging
      const totalCards = entries.reduce((sum, e) => sum + e.count, 0);
      console.log('[inference] Detected format:', inferredContext.format, `(cards: ${totalCards}, commander: ${inferredContext.commander || 'none'})`);
      console.log('[inference] Detected colors:', inferredContext.colors.join(', ') || 'none');
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
      gptSuggestions = await postFilterSuggestions(rawSuggestions, inferredContext, byName, currency, entries, userId);
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
    prompt_version: useGPT && useScryfall ? getActivePromptVersion() : undefined, // Include for A/B testing analytics
  });
}
