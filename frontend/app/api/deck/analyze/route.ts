// app/api/deck/analyze/route.ts

import fs from "node:fs/promises";
import path from "node:path";
import {
  type SfCard,
  type InferredDeckContext,
  fetchCard,
  checkIfCommander,
  inferDeckContext,
} from "@/lib/deck/inference";

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
  } else {
    systemPrompt += `- WARNING: This is NOT Commander format (${context.format}). Do NOT suggest Commander-only cards like Sol Ring, Command Tower, Arcane Signet, or any other Commander-only cards.\n`;
    systemPrompt += `- Only suggest cards legal in ${context.format} format.\n`;
  }
  systemPrompt += `- Do NOT suggest cards that are already in the decklist.\n`;
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

  systemPrompt += `\nCARD ANALYSIS ACCURACY:\n`;
  systemPrompt += `- When describing card draw or hand effects, distinguish between card advantage (net gain of cards) and card filtering (same number of cards but improved quality). For example, Faithless Looting and Careful Study are filtering, not draw engines.\n`;
  
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
  currency: string = 'USD',
  deckEntries: Array<{ count: number; name: string }> = []
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
        console.log(`[filter] Removed ${suggestion.card}: colors ${cardColors.join(',')} not in ${Array.from(allowedColors).join(',')}`);
        continue;
      }

      // Check for duplicate cards (already in deck)
      const cardNameNormalized = suggestion.card.toLowerCase().trim();
      const isDuplicate = deckEntries.some(entry => entry.name.toLowerCase().trim() === cardNameNormalized);
      if (isDuplicate) {
        console.log(`[filter] Removed ${suggestion.card}: already in deck`);
        continue;
      }

      // Check for Commander-only cards in non-Commander formats
      if (context.format !== "Commander") {
        const isCommanderOnly = COMMANDER_ONLY_CARDS.some(cmdCard => 
          cardNameNormalized === cmdCard.toLowerCase() || 
          cardNameNormalized.includes(cmdCard.toLowerCase())
        );
        if (isCommanderOnly) {
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

  // If all suggestions were filtered out, return a helpful message
  if (filtered.length === 0 && suggestions.length > 0) {
    console.log(`[filter] Final suggestions: 0 (removed ${suggestions.length})`);
    return [{
      card: "N/A",
      reason: "Your deck already runs most of the good staples for this strategy. Consider meta-specific tech or power-level upgrades.",
      category: "optional"
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
      const currency = body.currency || 'USD';
      gptSuggestions = await postFilterSuggestions(rawSuggestions, inferredContext, byName, currency, entries);
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
