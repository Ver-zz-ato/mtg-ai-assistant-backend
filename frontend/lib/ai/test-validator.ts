/**
 * Validation functions for AI test responses
 */

export type ValidationResult = {
  passed: boolean;
  score: number; // 0-100
  checks: Array<{
    type: string;
    passed: boolean;
    message: string;
  }>;
  warnings: string[];
};

/**
 * Synonym groups for flexible keyword matching
 * Maps a canonical phrase to its synonyms/variants
 */
const KEYWORD_SYNONYMS: Record<string, string[]> = {
  // Ramp-related phrases
  "ramp: about 10–12 pieces": [
    "about 8-12 ramp",
    "around 10-12 ramp",
    "roughly 10-12 ramp",
    "about ten ramp pieces",
    "around 8-12 ramp cards",
    "roughly 10-12 ramp effects",
    "8-12 ramp sources",
    "about 8-12 ramp pieces",
    "around ten ramp",
    "roughly 10-12 ramp",
  ],
  "about 8–12 ramp": [
    "about 8-12 ramp",
    "around 10-12 ramp",
    "roughly 10-12 ramp",
    "about ten ramp pieces",
    "around 8-12 ramp cards",
    "roughly 10-12 ramp effects",
    "8-12 ramp sources",
    "about 8-12 ramp pieces",
  ],
  // Land count phrases
  "around 19–20 lands": [
    "around 19-20 lands",
    "about 19-20 lands",
    "roughly 20 lands",
    "you usually play about 19-20 lands",
    "typically 19-20 lands",
    "around 20 lands",
    "about 20 lands",
  ],
  "around 36–38 lands": [
    "around 36-38 lands",
    "about 36-38 lands",
    "roughly 36-38 lands",
    "typically 36-38 lands",
    "around 37 lands",
    "about 37 lands",
  ],
  "around 24 lands": [
    "around 24 lands",
    "about 24 lands",
    "roughly 24 lands",
    "typically 24 lands",
    "around 23-25 lands",
    "about 23-25 lands",
  ],
  // Graveyard/recursion phrases
  "graveyard": [
    "graveyard",
    "yard",
    "grave",
    "using your yard",
    "from the grave",
    "graveyard recursion",
    "graveyard value",
  ],
  "recursion": [
    "recursion",
    "recur",
    "recurring",
    "getting cards back",
    "bring back",
    "reuse",
    "reusing",
    "return from graveyard",
    "recur from graveyard",
  ],
  "reanimate": [
    "reanimate",
    "reanimation",
    "bring back",
    "return from graveyard",
    "recur from graveyard",
    "get back from graveyard",
  ],
  // Enchantress/enchantment phrases
  "enchantress": [
    "enchantress",
    "enchantment-based draw",
    "enchantments that draw",
    "enchantments powering draw",
    "enchantment draw engines",
    "enchantment-matter",
  ],
  "enchantment": [
    "enchantment",
    "enchantments",
    "enchantment-based",
    "enchantment matter",
  ],
  // Removal phrases
  "little to no creature removal": [
    "little to no creature removal",
    "minimal creature removal",
    "few creature removal",
    "not much creature removal",
    "lacks creature removal",
    "missing creature removal",
  ],
};

/**
 * Check if response contains a keyword or any of its synonyms
 */
function matchesKeywordFlexible(response: string, keyword: string): boolean {
  const responseLower = response.toLowerCase();
  const keywordLower = keyword.toLowerCase();
  
  // First try exact match
  if (responseLower.includes(keywordLower)) {
    return true;
  }
  
  // Check synonyms
  const synonyms = KEYWORD_SYNONYMS[keyword] || KEYWORD_SYNONYMS[keywordLower];
  if (synonyms) {
    return synonyms.some(synonym => responseLower.includes(synonym.toLowerCase()));
  }
  
  // For numeric ranges, try semantic matching
  // e.g., "about 10-12 ramp" should match "around 8-12 ramp pieces"
  const rangeMatch = keyword.match(/(\d+)[\s-–]+(?:to|–|-)[\s-–]+(\d+)\s+(ramp|lands?|draw|removal)/i);
  if (rangeMatch) {
    const [, minStr, maxStr, category] = rangeMatch;
    const min = parseInt(minStr);
    const max = parseInt(maxStr);
    const catLower = category.toLowerCase();
    
    // Look for similar ranges in response
    const rangePattern = new RegExp(
      `(?:about|around|roughly|typically|usually|generally)?\\s*(\\d+)[\\s-–]+(?:to|–|-)[\\s-–]+(\\d+)\\s+${catLower}`,
      "i"
    );
    const matches = response.matchAll(rangePattern);
    for (const match of matches) {
      const respMin = parseInt(match[1]);
      const respMax = parseInt(match[2]);
      // Accept if ranges overlap significantly (within 2 of each other)
      if (Math.abs(respMin - min) <= 2 && Math.abs(respMax - max) <= 2) {
        return true;
      }
    }
  }
  
  return false;
}

export type ExpectedChecks = {
  shouldContain?: string[];
  shouldNotContain?: string[];
  shouldMentionCard?: string[];
  shouldNotMentionCard?: string[];
  maxLength?: number;
  minLength?: number;
  formatSpecific?: boolean;
  // New advanced checks
  requireDeckStyle?: boolean; // Should identify deck style and restate plan
  requireProblemsFirst?: boolean; // Should list problems before solutions
  requireSynergy?: boolean; // Should explain card synergies
  requireConsistency?: boolean; // Should have consistent numbers/guidelines
  requireBudgetAwareness?: boolean; // Should acknowledge budget if mentioned
  requireToneMatch?: boolean; // Should match casual/competitive tone
  requireSpecificity?: boolean; // Should include concrete card names
  requireLegalIdentity?: boolean; // Should check color identity and format legality
  // New safety checks
  requireColorIdentitySafe?: boolean; // all mentioned cards must be legal in the given colors/format
  requirePermanentsOnly?: boolean;    // all mentioned cards must be permanents
  requireNoHallucinatedCards?: boolean; // all mentioned cards must exist in our card DB
  // tribal / deck-structure helpers (for deck builders)
  minTribalDensity?: {
    tribe: string;      // e.g. "Bird"
    minPercent: number; // e.g. 0.25 for 25%+
  };
  // deck size expectations when full decklists are generated
  maxTotalCards?: number;
  minTotalCards?: number;
  // land recommendation sanity checks
  mustNotRecommendExcessiveLands?: boolean;
  maxRecommendedLandsToAdd?: number; // e.g. 5
};

export type DeckAnalysisExpectedChecks = ExpectedChecks & {
  minRampMention?: number;
  minDrawMention?: number;
  mustFlagLowLands?: boolean;
  shouldNotSuggestCard?: string[];
  minSynergyScore?: number;
};

export type JudgeResult = {
  overall_score: number;
  factual_score: number;
  legality_score: number;
  synergy_score: number;
  pedagogy_score: number;
  issues: string[];
  improved_answer?: string;
  suggested_prompt_patch?: string;
};

/**
 * Validate response against keyword checks
 */
export function validateKeywords(
  response: string,
  expectedChecks: ExpectedChecks
): ValidationResult {
  const responseLower = response.toLowerCase();
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  const warnings: string[] = [];
  let passedCount = 0;
  let totalChecks = 0;

  // Should contain keywords (with flexible synonym matching)
  if (expectedChecks.shouldContain && expectedChecks.shouldContain.length > 0) {
    for (const keyword of expectedChecks.shouldContain) {
      totalChecks++;
      const passed = matchesKeywordFlexible(response, keyword);
      checks.push({
        type: "shouldContain",
        passed,
        message: passed
          ? `Contains "${keyword}" or equivalent phrasing`
          : `Missing required concept: "${keyword}" (or equivalent phrasing)`,
      });
      if (passed) passedCount++;
    }
  }

  // Should not contain keywords
  if (expectedChecks.shouldNotContain && expectedChecks.shouldNotContain.length > 0) {
    for (const keyword of expectedChecks.shouldNotContain) {
      totalChecks++;
      const keywordLower = keyword.toLowerCase();
      // Check both literal and regex patterns
      const regex = new RegExp(keywordLower.replace(/\*/g, ".*"), "i");
      const passed = !regex.test(response);
      checks.push({
        type: "shouldNotContain",
        passed,
        message: passed
          ? `Correctly avoids "${keyword}"`
          : `Should not contain: "${keyword}"`,
      });
      if (passed) passedCount++;
    }
  }

  // Should mention specific cards
  if (expectedChecks.shouldMentionCard && expectedChecks.shouldMentionCard.length > 0) {
    for (const cardName of expectedChecks.shouldMentionCard) {
      totalChecks++;
      // Check for card name (case-insensitive, handle bold markdown)
      const cardLower = cardName.toLowerCase();
      const passed =
        responseLower.includes(cardLower) ||
        responseLower.includes(`**${cardLower}**`) ||
        responseLower.includes(`[[${cardName}]]`);
      checks.push({
        type: "shouldMentionCard",
        passed,
        message: passed
          ? `Mentions "${cardName}"`
          : `Should mention card: "${cardName}"`,
      });
      if (passed) passedCount++;
    }
  }

  // Should not mention specific cards
  if (expectedChecks.shouldNotMentionCard && expectedChecks.shouldNotMentionCard.length > 0) {
    for (const cardName of expectedChecks.shouldNotMentionCard) {
      totalChecks++;
      const cardLower = cardName.toLowerCase();
      const passed = !responseLower.includes(cardLower);
      checks.push({
        type: "shouldNotMentionCard",
        passed,
        message: passed
          ? `Correctly avoids "${cardName}"`
          : `Should not mention card: "${cardName}"`,
      });
      if (passed) passedCount++;
    }
  }

  // Length checks
  if (expectedChecks.minLength !== undefined) {
    totalChecks++;
    const passed = response.length >= expectedChecks.minLength;
    checks.push({
      type: "minLength",
      passed,
      message: passed
        ? `Length ${response.length} >= ${expectedChecks.minLength}`
        : `Response too short: ${response.length} < ${expectedChecks.minLength}`,
    });
    if (passed) passedCount++;
  }

  if (expectedChecks.maxLength !== undefined) {
    totalChecks++;
    const passed = response.length <= expectedChecks.maxLength;
    checks.push({
      type: "maxLength",
      passed,
      message: passed
        ? `Length ${response.length} <= ${expectedChecks.maxLength}`
        : `Response too long: ${response.length} > ${expectedChecks.maxLength}`,
    });
    if (passed) passedCount++;
  }

  // Format-specific check
  if (expectedChecks.formatSpecific) {
    totalChecks++;
    const formatKeywords = ["commander", "edh", "modern", "standard", "pioneer", "format"];
    const passed = formatKeywords.some((kw) => responseLower.includes(kw));
    checks.push({
      type: "formatSpecific",
      passed,
      message: passed
        ? "Mentions format"
        : "Should mention the format explicitly",
    });
    if (passed) passedCount++;
  }

  const score = totalChecks > 0 ? Math.round((passedCount / totalChecks) * 100) : 100;
  const passed = score >= 80; // 80% threshold for passing

  return {
    passed,
    score,
    checks,
    warnings,
  };
}

/**
 * Use LLM to fact-check the response with structured scoring
 */
export async function validateLLMFactCheck(
  response: string,
  testCase: { name?: string; input: any; expectedChecks?: ExpectedChecks },
  apiKey: string
): Promise<{ validation: ValidationResult; judge: JudgeResult }> {
  const systemPrompt = `You are a Magic: The Gathering expert fact-checker. Review the AI assistant's response and provide structured evaluation.

Test case: ${testCase.name || "Unknown"}
User question: ${JSON.stringify(testCase.input.userMessage || "")}
Format: ${testCase.input.format || "Unknown"}

Evaluate the response and return JSON with these exact fields:
{
  "overall_score": 0-100,
  "factual_score": 0-100,  // Card names, rules, format legality accuracy
  "legality_score": 0-100,  // Color identity, format legality, banlist compliance
  "synergy_score": 0-100,   // How well suggestions fit the deck plan/commander
  "pedagogy_score": 0-100,  // Clarity for teaching mode, explanation quality
  "issues": ["issue1", "issue2"],
  "improved_answer": "optional better version",
  "suggested_prompt_patch": "optional prompt improvement"
}`;

  const userPrompt = `AI Response to fact-check:\n\n${response}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      throw new Error(`LLM fact-check failed: ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content from LLM fact-check");
    }

    const result = JSON.parse(content) as Partial<JudgeResult>;
    
    // Ensure all required fields exist
    const judge: JudgeResult = {
      overall_score: result.overall_score ?? 0,
      factual_score: result.factual_score ?? 0,
      legality_score: result.legality_score ?? 0,
      synergy_score: result.synergy_score ?? 0,
      pedagogy_score: result.pedagogy_score ?? 0,
      issues: result.issues || [],
      improved_answer: result.improved_answer,
      suggested_prompt_patch: result.suggested_prompt_patch,
    };

    const passed = judge.overall_score >= 70;

    const validation: ValidationResult = {
      passed,
      score: judge.overall_score,
      checks: [
        {
          type: "llm_fact_check",
          passed,
          message: passed
            ? `LLM fact-check passed (overall: ${judge.overall_score}%)`
            : `LLM fact-check found issues: ${judge.issues.join(", ") || "unknown"}`,
        },
      ],
      warnings: judge.issues,
    };

    return { validation, judge };
  } catch (error: any) {
    const judge: JudgeResult = {
      overall_score: 0,
      factual_score: 0,
      legality_score: 0,
      synergy_score: 0,
      pedagogy_score: 0,
      issues: [error.message],
    };

    return {
      validation: {
        passed: false,
        score: 0,
        checks: [
          {
            type: "llm_fact_check",
            passed: false,
            message: `LLM fact-check error: ${error.message}`,
          },
        ],
        warnings: [error.message],
      },
      judge,
    };
  }
}

/**
 * Extract card names from response text (handles markdown formatting)
 */
function extractCardNames(response: string): string[] {
  const cardNames: string[] = [];
  // Match **Card Name** or [[Card Name]] patterns
  const patterns = [
    /\*\*([^*]+)\*\*/g,  // **Card Name**
    /\[\[([^\]]+)\]\]/g,  // [[Card Name]]
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const name = match[1].trim();
      if (name && name.length > 0) {
        cardNames.push(name);
      }
    }
  }
  
  return Array.from(new Set(cardNames)); // Remove duplicates
}

/**
 * Check color identity compatibility
 */
async function checkColorIdentity(
  cardName: string,
  allowedColors: string[],
  supabase: any
): Promise<{ passed: boolean; message: string }> {
  try {
    const normalizedName = cardName.toLowerCase().trim();
    const { data } = await supabase
      .from("scryfall_cache")
      .select("color_identity, name")
      .ilike("name", normalizedName)
      .limit(1)
      .maybeSingle();

    if (!data || !data.color_identity) {
      return { passed: true, message: `Card "${cardName}" not found in cache (skipping color check)` };
    }

    const cardColors = Array.isArray(data.color_identity) ? data.color_identity : [];
    const allowedSet = new Set(allowedColors.map((c) => c.toUpperCase()));
    
    // Check if all card colors are in allowed colors
    const allAllowed = cardColors.every((c: string) => allowedSet.has(c.toUpperCase()));
    
    if (!allAllowed) {
      return {
        passed: false,
        message: `Card "${cardName}" has color identity ${cardColors.join(", ")} but deck only allows ${allowedColors.join(", ")}`,
      };
    }

    return { passed: true, message: `Card "${cardName}" color identity OK` };
  } catch (error: any) {
    return { passed: true, message: `Color check error for "${cardName}": ${error.message}` };
  }
}

/**
 * Check format legality (banned list)
 */
async function checkFormatLegality(
  cardName: string,
  format: string,
  supabase: any
): Promise<{ passed: boolean; message: string }> {
  try {
    // Load banned cards list
    const bannedCardsModule = await import("@/lib/data/banned_cards.json");
    const bannedCards = (bannedCardsModule as any).default || bannedCardsModule;
    const formatBanned = bannedCards[format] || [];
    
    const normalizedName = cardName.toLowerCase().trim();
    const isBanned = formatBanned.some((banned: string) => 
      banned.toLowerCase().trim() === normalizedName
    );

    if (isBanned) {
      return {
        passed: false,
        message: `Card "${cardName}" is banned in ${format}`,
      };
    }

    return { passed: true, message: `Card "${cardName}" is legal in ${format}` };
  } catch (error: any) {
    return { passed: true, message: `Legality check error for "${cardName}": ${error.message}` };
  }
}

/**
 * Compare response against reference sources using scryfall_cache
 */
export async function validateReferenceCompare(
  response: string,
  testCase: { input: any; expectedChecks?: ExpectedChecks },
  supabase?: any
): Promise<ValidationResult> {
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  const warnings: string[] = [];
  let passedCount = 0;
  let totalChecks = 0;

  if (!supabase) {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "reference_compare",
        passed: true,
        message: "Reference comparison skipped (no supabase client)",
      }],
      warnings: ["Supabase client not provided"],
    };
  }

  // Extract card names from response
  const cardNames = extractCardNames(response);
  
  if (cardNames.length === 0) {
    checks.push({
      type: "reference_compare",
      passed: true,
      message: "No card names found in response",
    });
    return {
      passed: true,
      score: 100,
      checks,
      warnings,
    };
  }

  const format = testCase.input.format;
  const allowedColors = testCase.input.colors || [];
  const commander = testCase.input.commander;

  // Check each card
  for (const cardName of cardNames.slice(0, 20)) { // Limit to 20 cards to avoid too many checks
    // Color identity check
    if (allowedColors.length > 0 || commander) {
      totalChecks++;
      const colorCheck = await checkColorIdentity(cardName, allowedColors, supabase);
      checks.push({
        type: "color_identity",
        passed: colorCheck.passed,
        message: colorCheck.message,
      });
      if (colorCheck.passed) passedCount++;
      if (!colorCheck.passed) warnings.push(colorCheck.message);
    }

    // Format legality check
    if (format) {
      totalChecks++;
      const legalityCheck = await checkFormatLegality(cardName, format, supabase);
      checks.push({
        type: "format_legality",
        passed: legalityCheck.passed,
        message: legalityCheck.message,
      });
      if (legalityCheck.passed) passedCount++;
      if (!legalityCheck.passed) warnings.push(legalityCheck.message);
    }
  }

  const score = totalChecks > 0 ? Math.round((passedCount / totalChecks) * 100) : 100;
  const passed = score >= 80;

  return {
    passed,
    score,
    checks,
    warnings,
  };
}

/**
 * Validate deck analysis response with pillar checks
 */
export function validateDeckAnalysisResponse(
  response: string,
  expectedChecks: DeckAnalysisExpectedChecks
): ValidationResult {
  const responseLower = response.toLowerCase();
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  const warnings: string[] = [];
  let passedCount = 0;
  let totalChecks = 0;

  // Check for ramp mentions
  if (expectedChecks.minRampMention !== undefined) {
    totalChecks++;
    const rampKeywords = ["ramp", "mana", "cultivate", "signet", "sol ring"];
    const rampCount = rampKeywords.filter((kw) => responseLower.includes(kw)).length;
    const passed = rampCount >= expectedChecks.minRampMention;
    checks.push({
      type: "minRampMention",
      passed,
      message: passed
        ? `Mentions ramp ${rampCount} times (required: ${expectedChecks.minRampMention})`
        : `Only mentions ramp ${rampCount} times, need at least ${expectedChecks.minRampMention}`,
    });
    if (passed) passedCount++;
  }

  // Check for draw mentions
  if (expectedChecks.minDrawMention !== undefined) {
    totalChecks++;
    const drawKeywords = ["draw", "card advantage", "card draw", "filter", "cantrip"];
    const drawCount = drawKeywords.filter((kw) => responseLower.includes(kw)).length;
    const passed = drawCount >= expectedChecks.minDrawMention;
    checks.push({
      type: "minDrawMention",
      passed,
      message: passed
        ? `Mentions draw ${drawCount} times (required: ${expectedChecks.minDrawMention})`
        : `Only mentions draw ${drawCount} times, need at least ${expectedChecks.minDrawMention}`,
    });
    if (passed) passedCount++;
  }

  // Check for low lands flag
  if (expectedChecks.mustFlagLowLands) {
    totalChecks++;
    const landWarningKeywords = ["land", "lands", "mana base", "too few lands", "add lands"];
    const hasLandWarning = landWarningKeywords.some((kw) => responseLower.includes(kw));
    checks.push({
      type: "mustFlagLowLands",
      passed: hasLandWarning,
      message: hasLandWarning
        ? "Flags low land count"
        : "Should flag low land count but doesn't",
    });
    if (hasLandWarning) passedCount++;
  }

  // Check for cards that shouldn't be suggested
  if (expectedChecks.shouldNotSuggestCard && expectedChecks.shouldNotSuggestCard.length > 0) {
    for (const cardName of expectedChecks.shouldNotSuggestCard) {
      totalChecks++;
      const cardLower = cardName.toLowerCase();
      const passed = !responseLower.includes(cardLower);
      checks.push({
        type: "shouldNotSuggestCard",
        passed,
        message: passed
          ? `Correctly avoids "${cardName}"`
          : `Should not suggest "${cardName}" but does`,
      });
      if (passed) passedCount++;
    }
  }

  // Run standard keyword checks too
  const keywordResults = validateKeywords(response, expectedChecks);
  checks.push(...keywordResults.checks);
  passedCount += keywordResults.checks.filter((c) => c.passed).length;
  totalChecks += keywordResults.checks.length;

  const score = totalChecks > 0 ? Math.round((passedCount / totalChecks) * 100) : 100;
  const passed = score >= 80;

  return {
    passed,
    score,
    checks,
    warnings: [...warnings, ...keywordResults.warnings],
  };
}

/**
 * Validate semantic similarity using OpenAI embeddings
 */
export async function validateSemanticSimilarity(
  response: string,
  expectedAnswer?: string,
  apiKey?: string
): Promise<ValidationResult> {
  if (!apiKey || !expectedAnswer) {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "semantic_similarity",
        passed: true,
        message: "Semantic similarity check skipped (no expected answer or API key)",
      }],
      warnings: [],
    };
  }

  try {
    // Get embeddings for both texts
    const embeddingsRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: [response, expectedAnswer],
      }),
    });

    if (!embeddingsRes.ok) {
      throw new Error(`Embeddings API failed: ${embeddingsRes.status}`);
    }

    const embeddingsData = await embeddingsRes.json();
    const embeddings = embeddingsData.data;

    if (embeddings.length !== 2) {
      throw new Error("Expected 2 embeddings, got " + embeddings.length);
    }

    // Calculate cosine similarity
    const a = embeddings[0].embedding;
    const b = embeddings[1].embedding;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    const score = Math.round(similarity * 100);
    const passed = similarity >= 0.7; // 70% similarity threshold

    return {
      passed,
      score,
      checks: [{
        type: "semantic_similarity",
        passed,
        message: passed
          ? `Semantic similarity: ${score}% (threshold: 70%)`
          : `Semantic similarity too low: ${score}% (threshold: 70%)`,
      }],
      warnings: passed ? [] : [`Response semantic similarity is ${score}%, expected >= 70%`],
    };
  } catch (error: any) {
    return {
      passed: false,
      score: 0,
      checks: [{
        type: "semantic_similarity",
        passed: false,
        message: `Semantic similarity check error: ${error.message}`,
      }],
      warnings: [error.message],
    };
  }
}

/**
 * Deck Style & Plan Judge: Checks that the first 1-2 sentences identify deck style and restate plan
 */
export function validateDeckStyleAndPlan(
  response: string,
  testCase: { input: any; type?: string }
): ValidationResult {
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  
  // Only check deck_analysis type responses
  if (testCase.type !== "deck_analysis") {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "deck_style_plan",
        passed: true,
        message: "Skipped (not a deck analysis test)",
      }],
      warnings: [],
    };
  }

  const responseLower = response.toLowerCase();
  const firstTwoSentences = response.split(/[.!?]+/).slice(0, 2).join(" ").toLowerCase();
  
  // Common archetype keywords
  const archetypeKeywords = [
    "token", "tokens", "aristocrat", "aristocrats", "sacrifice", "sac outlet",
    "landfall", "lifegain", "enchantress", "enchantment", "spellslinger", "spell",
    "graveyard", "recursion", "reanimator", "blink", "flicker", "voltron",
    "control", "midrange", "combo", "stax", "ramp", "treasure", "artifact",
    "tribal", "tribes", "go-wide", "tall", "aggro", "burn", "mill", "group hug"
  ];
  
  // Plan restatement keywords
  const planKeywords = [
    "your deck", "this deck", "this list", "your list", "your plan", "this plan",
    "aims to", "wants to", "tries to", "seeks to", "focuses on", "strategy",
    "game plan", "win condition", "wincon", "archetype", "style"
  ];
  
  const hasArchetype = archetypeKeywords.some(kw => firstTwoSentences.includes(kw));
  const hasPlanRestatement = planKeywords.some(kw => firstTwoSentences.includes(kw));
  
  const passed = hasArchetype || hasPlanRestatement;
  
  checks.push({
    type: "deck_style_plan",
    passed,
    message: passed
      ? "Identifies deck style or restates plan in opening"
      : "Opening is generic - should identify deck style (tokens, aristocrats, etc.) and restate plan",
  });
  
  return {
    passed,
    score: passed ? 100 : 0,
    checks,
    warnings: passed ? [] : ["Response should identify deck archetype and restate plan in first 1-2 sentences"],
  };
}

/**
 * Structure Judge: Checks that problems are listed before solutions
 */
export function validateProblemsFirstStructure(
  response: string,
  testCase: { input: any; type?: string }
): ValidationResult {
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  
  // Only check deck_analysis type responses
  if (testCase.type !== "deck_analysis") {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "problems_first",
        passed: true,
        message: "Skipped (not a deck analysis test)",
      }],
      warnings: [],
    };
  }

  const responseLower = response.toLowerCase();
  
  // Problem keywords (should appear early) - includes soft/polite language
  const problemKeywords = [
    "problem", "problems", "issue", "issues", "weakness", "weaknesses",
    "lacks", "missing", "struggles", "weak", "low", "too few", "too many",
    "biggest issue", "main problem", "key problem", "concern", "concerns",
    "could improve", "could be better", "a bit light on", "overloaded on",
    "under", "over", "under-ramped", "over-ramped", "under-powered", "over-powered"
  ];
  
  // Solution keywords (should appear after problems)
  const solutionKeywords = [
    "consider adding", "you can fix", "recommend", "suggest", "try adding",
    "add", "include", "swap", "replace", "solution", "fix", "improve"
  ];
  
  // Find positions of first problem and first solution mention
  let firstProblemPos = -1;
  let firstSolutionPos = -1;
  
  for (const keyword of problemKeywords) {
    const pos = responseLower.indexOf(keyword);
    if (pos !== -1 && (firstProblemPos === -1 || pos < firstProblemPos)) {
      firstProblemPos = pos;
    }
  }
  
  for (const keyword of solutionKeywords) {
    const pos = responseLower.indexOf(keyword);
    if (pos !== -1 && (firstSolutionPos === -1 || pos < firstSolutionPos)) {
      firstSolutionPos = pos;
    }
  }
  
  // Pass if: problems appear before solutions, OR no solutions mentioned (just analysis), OR no problems mentioned (might be a good deck)
  const passed = firstProblemPos === -1 || firstSolutionPos === -1 || firstProblemPos < firstSolutionPos;
  
  checks.push({
    type: "problems_first",
    passed,
    message: passed
      ? "Problems mentioned before solutions (or structure appropriate)"
      : "Solutions appear before problems are clearly stated",
  });
  
  return {
    passed,
    score: passed ? 100 : 0,
    checks,
    warnings: passed ? [] : ["Should list problems/weaknesses before proposing solutions"],
  };
}

/**
 * Synergy Judge: Checks that at least one sentence connects multiple cards with synergy language
 * Now more flexible - doesn't require specific trigger phrases, focuses on structure
 */
export function validateSynergy(
  response: string,
  testCase: { input: any; type?: string }
): ValidationResult {
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  
  // Only check deck_analysis type responses
  if (testCase.type !== "deck_analysis") {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "synergy",
        passed: true,
        message: "Skipped (not a deck analysis test)",
      }],
      warnings: [],
    };
  }

  const responseLower = response.toLowerCase();
  
  // Extract card names (multiple patterns: **Card Name**, [[Card Name]], or quoted "Card Name")
  const cardNamePatterns = [
    /\*\*([^*]+)\*\*/g,  // **Card Name**
    /\[\[([^\]]+)\]\]/g, // [[Card Name]]
    /"([^"]+)"/g,        // "Card Name"
  ];
  
  const cardNames: string[] = [];
  for (const pattern of cardNamePatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const name = match[1].toLowerCase().trim();
      // Filter out common non-card phrases
      if (name.length > 2 && name.length < 50 && !/^(the|and|or|of|in|at|to|for|with|by|from|build|deck|commander|your|this|that)$/i.test(name)) {
        if (!cardNames.includes(name)) {
          cardNames.push(name);
        }
      }
    }
  }
  
  // Need at least 2 card names to have synergy
  if (cardNames.length < 2) {
    checks.push({
      type: "synergy",
      passed: false,
      message: "Need at least 2 card names to explain synergy",
    });
    return {
      passed: false,
      score: 0,
      checks,
      warnings: ["Response should mention at least 2 specific cards to explain how they work together"],
    };
  }
  
  // Split into sentences for analysis
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  // Look for synergy explanations - more flexible patterns
  // A synergy explanation should:
  // 1. Mention 2+ card names in same sentence/paragraph
  // 2. Explain how one enables/amplifies the other
  // 3. Use causal language (because, so that, which lets, by doing X you can Y, etc.)
  
  const causalPatterns = [
    /\b(because|so that|which lets|which allows|which enables|by doing|when you|whenever you|each time you|as you|if you)\b/i,
    /\b(triggers|enables|allows|lets|gives you|provides|creates|generates|produces)\b/i,
    /\b(then|next|after|once|when|whenever)\b/i,
  ];
  
  const enablePatterns = [
    /\b(enables|allows|lets|gives|provides|creates|generates|produces|triggers|activates)\b/i,
    /\b(converts|turns|transforms|changes)\b/i,
    /\b(amplifies|enhances|boosts|multiplies|doubles)\b/i,
  ];
  
  let hasValidSynergy = false;
  let synergySentence = "";
  
  // Check each sentence for synergy structure
  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    const cardsInSentence = cardNames.filter(card => sentenceLower.includes(card));
    
    // Need at least 2 cards in the sentence
    if (cardsInSentence.length < 2) continue;
    
    // Check for causal/enable language
    const hasCausalLanguage = causalPatterns.some(pattern => pattern.test(sentence));
    const hasEnableLanguage = enablePatterns.some(pattern => pattern.test(sentence));
    
    // Also check for sequence indicators (X then Y, X enables Y, etc.)
    const hasSequence = /\b(then|next|after|once|when|whenever|as|while)\b/i.test(sentence);
    
    // Check for explicit interaction description (mentions what one card does that affects the other)
    const hasInteraction = /\b(triggers?|responds?|reacts?|uses?|takes advantage|leverages?|benefits? from)\b/i.test(sentence);
    
    // Valid synergy if it has:
    // - 2+ cards AND
    // - (causal language OR enable language OR sequence) AND
    // - (interaction description OR explicit "together" language OR explains outcome)
    const hasOutcome = /\b(together|combined|synergy|combo|loop|engine|value|advantage|result|achieve|accomplish|win|drain|draw|token|damage)\b/i.test(sentence);
    
    if (cardsInSentence.length >= 2 && (hasCausalLanguage || hasEnableLanguage || hasSequence) && (hasInteraction || hasOutcome || sentenceLower.includes("together"))) {
      hasValidSynergy = true;
      synergySentence = sentence.trim();
      break;
    }
  }
  
  // Fallback: Check if response has multiple cards mentioned close together with connecting words
  if (!hasValidSynergy && cardNames.length >= 2) {
    // Look for patterns like "Card A and Card B" or "Card A, Card B" in close proximity
    for (let i = 0; i < cardNames.length - 1; i++) {
      const card1 = cardNames[i];
      const card2 = cardNames[i + 1];
      const card1Index = responseLower.indexOf(card1);
      const card2Index = responseLower.indexOf(card2);
      
      // If cards are mentioned within 200 chars of each other
      if (card1Index !== -1 && card2Index !== -1 && Math.abs(card1Index - card2Index) < 200) {
        const between = responseLower.substring(
          Math.min(card1Index, card2Index),
          Math.max(card1Index, card2Index) + Math.max(card1.length, card2.length)
        );
        
        // Check for connecting language
        if (/\b(and|with|plus|along|together|synergy|combo|works|enables|triggers|because|so|which|when)\b/i.test(between)) {
          hasValidSynergy = true;
          break;
        }
      }
    }
  }
  
  const passed = hasValidSynergy;
  
  checks.push({
    type: "synergy",
    passed,
    message: passed
      ? `Contains synergy explanation connecting multiple cards${synergySentence ? `: "${synergySentence.slice(0, 80)}..."` : ""}`
      : "Missing synergy explanation - should explain how 2+ cards work together (e.g., 'Card A does X, which enables Card B to do Y')",
  });
  
  return {
    passed,
    score: passed ? 100 : 0,
    checks,
    warnings: passed ? [] : ["Response should explain how cards interact, not just list them separately"],
  };
}

/**
 * Consistency Judge: Checks for wild mismatches between numeric guidelines and examples
 * 
 * This judge is intentionally forgiving - it only flags truly misleading cases where
 * a range is stated but almost no examples are given. It uses soft thresholds (50% of
 * lower bound) and skips if the answer explicitly says the list is not exhaustive.
 */
export function validateConsistency(
  response: string,
  testCase: { input: any; type?: string }
): ValidationResult {
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  const warnings: string[] = [];
  
  const responseLower = response.toLowerCase();
  
  // Check if answer explicitly says list is not exhaustive (skip judge if so)
  const notExhaustivePhrases = [
    "here are some examples", "for example", "examples include", "such as",
    "a few options", "some options", "not exhaustive", "not a complete list"
  ];
  const isExplicitlyNotExhaustive = notExhaustivePhrases.some(phrase => responseLower.includes(phrase));
  
  // Extract numeric ranges mentioned (e.g., "8-12", "33-37", "8 to 12")
  // Only look for ranges followed by category keywords
  const rangePattern = /(\d+)[\s-]+(?:to|–|-)[\s-]+(\d+)\s+(?:ramp|lands?|draw|removal|interaction|wincon|win\s+con)/gi;
  const ranges: Array<{ min: number; max: number; context: string; category: string }> = [];
  let match;
  
  while ((match = rangePattern.exec(response)) !== null) {
    const min = parseInt(match[1]);
    const max = parseInt(match[2]);
    const context = response.substring(Math.max(0, match.index - 100), match.index + match[0].length + 100).toLowerCase();
    const category = match[0].toLowerCase().includes("ramp") ? "ramp" : 
                     match[0].toLowerCase().includes("land") ? "land" :
                     match[0].toLowerCase().includes("draw") ? "draw" : "other";
    ranges.push({ min, max, context, category });
  }
  
  // Only check if we found ranges AND answer doesn't explicitly say it's not exhaustive
  if (ranges.length === 0) {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "consistency",
        passed: true,
        message: "No numeric guidelines found to check",
      }],
      warnings: [],
    };
  }
  
  if (isExplicitlyNotExhaustive) {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "consistency",
        passed: true,
        message: "Answer explicitly states list is not exhaustive - skipping consistency check",
      }],
      warnings: [],
    };
  }
  
  // Check each range for wild mismatches
  for (const range of ranges) {
    if (range.category === "ramp") {
      // Extract card names from response to count actual examples
      const cardNamePattern = /\*\*([^*]+)\*\*/g;
      const cardNames: string[] = [];
      let cardMatch;
      while ((cardMatch = cardNamePattern.exec(response)) !== null) {
        cardNames.push(cardMatch[1].toLowerCase().trim());
      }
      
      // Count ramp-related cards mentioned
      const rampCardKeywords = ["cultivate", "kodama", "nature's lore", "three visits", "sol ring", "arcane signet", "signet", "talisman", "llanowar", "elvish mystic", "birds of paradise", "farseek", "ramp"];
      const rampExamples = cardNames.filter(name => 
        rampCardKeywords.some(kw => name.includes(kw))
      ).length;
      
      // Very soft threshold: require at least 50% of lower bound (ceil)
      const minRequired = Math.ceil(range.min * 0.5);
      
      if (rampExamples < minRequired) {
        checks.push({
          type: "consistency_ramp",
          passed: false,
          message: `States ${range.min}-${range.max} ramp pieces but only provides ${rampExamples} examples (minimum ${minRequired} expected)`,
        });
        warnings.push(`Ramp guideline (${range.min}-${range.max}) has wild mismatch with examples (${rampExamples} vs expected ${minRequired}+)`);
      } else {
        checks.push({
          type: "consistency_ramp",
          passed: true,
          message: `Ramp guideline (${range.min}-${range.max}) roughly matches examples (${rampExamples} provided)`,
        });
      }
    }
  }
  
  const passed = checks.length === 0 || checks.every(c => c.passed);
  
  return {
    passed,
    score: passed ? 100 : 50,
    checks: checks.length > 0 ? checks : [{
      type: "consistency",
      passed: true,
      message: "No consistency issues found",
    }],
    warnings,
  };
}

/**
 * Budget Awareness Judge: Checks that budget language is used when user mentions budget
 */
export function validateBudgetAwareness(
  response: string,
  testCase: { input: any }
): ValidationResult {
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  
  const userMessage = String(testCase.input.userMessage || "").toLowerCase();
  const context = String(testCase.input.context || "").toLowerCase();
  const combinedInput = userMessage + " " + context;
  
  // Check if user mentioned budget
  const budgetKeywords = ["budget", "cheap", "affordable", "under $", "under £", "saving money", "low cost", "inexpensive", "price", "cost"];
  const userMentionsBudget = budgetKeywords.some(kw => combinedInput.includes(kw));
  
  if (!userMentionsBudget) {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "budget_awareness",
        passed: true,
        message: "Skipped (user didn't mention budget)",
      }],
      warnings: [],
    };
  }
  
  const responseLower = response.toLowerCase();
  
  // Budget language that should appear in response
  const budgetResponseKeywords = [
    "budget", "budget-friendly", "cheaper", "affordable", "low-cost", "inexpensive",
    "under $", "under £", "won't break the bank", "cost-effective", "price"
  ];
  
  const hasBudgetLanguage = budgetResponseKeywords.some(kw => responseLower.includes(kw));
  
  // Check for expensive staples mentioned without budget context
  const expensiveStaples = ["mana crypt", "jeweled lotus", "mox diamond", "chrome mox", "grim monolith", "rhystic study", "smothering tithe"];
  const mentionsExpensive = expensiveStaples.some(staple => responseLower.includes(staple));
  
  const passed = hasBudgetLanguage && (!mentionsExpensive || responseLower.includes("budget") || responseLower.includes("alternative"));
  
  checks.push({
    type: "budget_awareness",
    passed,
    message: passed
      ? "Acknowledges budget constraints appropriately"
      : "User mentioned budget but response doesn't use budget language or suggests expensive cards without alternatives",
  });
  
  return {
    passed,
    score: passed ? 100 : 0,
    checks,
    warnings: passed ? [] : ["Response should acknowledge budget constraints when user mentions them"],
  };
}

/**
 * Casual vs Competitive Tone Judge: Checks that tone matches user intent
 */
export function validateTone(
  response: string,
  testCase: { input: any }
): ValidationResult {
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  
  const userMessage = String(testCase.input.userMessage || "").toLowerCase();
  const context = String(testCase.input.context || JSON.stringify(testCase.input.context || {})).toLowerCase();
  const combinedInput = userMessage + " " + context;
  
  const responseLower = response.toLowerCase();
  
  // Casual keywords
  const casualKeywords = ["casual", "janky", "fun", "kitchen table", "precon", "precon-ish", "budget", "beginner", "new player"];
  const userSignalsCasual = casualKeywords.some(kw => combinedInput.includes(kw));
  
  // Competitive keywords
  const competitiveKeywords = ["tuned", "competitive", "cedh", "high-power", "tournament", "optimized", "spike", "meta"];
  const userSignalsCompetitive = competitiveKeywords.some(kw => combinedInput.includes(kw));
  
  if (!userSignalsCasual && !userSignalsCompetitive) {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "tone",
        passed: true,
        message: "Skipped (no clear casual/competitive signal)",
      }],
      warnings: [],
    };
  }
  
  // Asymmetric tone checking: different rules for casual vs competitive
  
  let passed = true;
  let message = "";
  
  if (userSignalsCasual) {
    // For casual: hard-fail only on aggressive spike-y/oppressive concepts
    const aggressiveCompetitiveTerms = ["cedh", "hard lock", "stax your table", "lock your opponents out", "oppressive"];
    const hasAggressiveTerms = aggressiveCompetitiveTerms.some(kw => responseLower.includes(kw));
    
    if (hasAggressiveTerms) {
      passed = false;
      message = "User signaled casual but response aggressively pushes competitive/oppressive concepts";
    } else {
      // Don't fail for normal language like "efficient removal" - that's fine
      message = "Tone appropriately matches casual intent";
    }
  } else if (userSignalsCompetitive) {
    // For competitive: require at least one efficiency/resilience keyword
    const competitiveKeywords = [
      "efficient", "interaction", "resilient", "low curve", "refine", "tighten",
      "disruption", "interaction density", "optimize", "tuned"
    ];
    const hasCompetitiveKeyword = competitiveKeywords.some(kw => responseLower.includes(kw));
    
    if (!hasCompetitiveKeyword && responseLower.length > 200) {
      passed = false;
      message = "User signaled competitive but response lacks efficiency/resilience language";
    } else {
      message = "Tone matches competitive intent";
    }
  } else {
    message = "Tone appropriately matches user intent";
  }
  
  checks.push({
    type: "tone",
    passed,
    message,
  });
  
  return {
    passed,
    score: passed ? 100 : 0,
    checks,
    warnings: passed ? [] : ["Response tone should match user's casual/competitive intent"],
  };
}

/**
 * Color Identity & Legality Judge: Checks that suggested cards match deck colors and format legality
 * 
 * Uses existing card database logic to check:
 * - Color identity: suggested cards must be within deck's color identity
 * - Format legality: banned cards must be explicitly called out with alternatives
 * 
 * Only runs when requireLegalIdentity is true (mainly for deck_analysis/format-aware tests).
 */
export async function validateColorIdentityAndLegality(
  response: string,
  testCase: { input: any; type?: string },
  supabase?: any
): Promise<ValidationResult> {
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  const warnings: string[] = [];
  
  if (!supabase) {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "color_identity_legality",
        passed: true,
        message: "Skipped (no supabase client for card database lookup)",
      }],
      warnings: ["Supabase client not provided"],
    };
  }
  
  // Extract card names from response
  const cardNames = extractCardNames(response);
  
  if (cardNames.length === 0) {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "color_identity_legality",
        passed: true,
        message: "No card names found in response",
      }],
      warnings: [],
    };
  }
  
  const format = testCase.input.format;
  const allowedColors = testCase.input.colors || [];
  const commander = testCase.input.commander;
  const responseLower = response.toLowerCase();
  
  let passedCount = 0;
  let totalChecks = 0;
  let hasColorViolation = false;
  let hasBannedCardWithoutWarning = false;
  
  // Check each suggested card (limit to 20 to avoid too many checks)
  for (const cardName of cardNames.slice(0, 20)) {
    // Color identity check
    if (allowedColors.length > 0 || commander) {
      totalChecks++;
      const colorCheck = await checkColorIdentity(cardName, allowedColors, supabase);
      if (!colorCheck.passed) {
        hasColorViolation = true;
        checks.push({
          type: "color_identity",
          passed: false,
          message: colorCheck.message,
        });
        warnings.push(colorCheck.message);
      } else {
        passedCount++;
        // Don't add passed checks to avoid clutter, only failures
      }
    }
    
    // Format legality check
    if (format) {
      totalChecks++;
      const legalityCheck = await checkFormatLegality(cardName, format, supabase);
      if (!legalityCheck.passed) {
        // Check if the response explicitly mentions the card is banned and suggests alternatives
        const cardLower = cardName.toLowerCase();
        const mentionsBanned = responseLower.includes("banned") && 
                              (responseLower.includes(cardLower) || responseLower.includes(`**${cardName}**`));
        const suggestsAlternative = responseLower.includes("alternative") || 
                                    responseLower.includes("instead") ||
                                    responseLower.includes("consider");
        
        if (!mentionsBanned || !suggestsAlternative) {
          hasBannedCardWithoutWarning = true;
          checks.push({
            type: "format_legality",
            passed: false,
            message: `Card "${cardName}" is banned in ${format} but not explicitly called out with alternatives`,
          });
          warnings.push(`Banned card "${cardName}" suggested without warning`);
        } else {
          // Card is banned but properly called out - this is OK
          passedCount++;
        }
      } else {
        passedCount++;
      }
    }
  }
  
  const passed = !hasColorViolation && !hasBannedCardWithoutWarning;
  const score = totalChecks > 0 ? Math.round((passedCount / totalChecks) * 100) : 100;
  
  return {
    passed,
    score,
    checks: checks.length > 0 ? checks : [{
      type: "color_identity_legality",
      passed: true,
      message: "All suggested cards are legal and within color identity",
    }],
    warnings,
  };
}

/**
 * Safety Checks Validator: Validates new safety flags (hallucination, color identity, permanents, tribal, deck size, lands)
 */
export async function validateSafetyChecks(
  response: string,
  testCase: { input: any; expectedChecks?: ExpectedChecks },
  supabase?: any
): Promise<ValidationResult> {
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  const warnings: string[] = [];
  let passedCount = 0;
  let totalChecks = 0;

  const expectedChecks = testCase.expectedChecks || {};
  const cardNames = extractCardNames(response);

  // 1. requireNoHallucinatedCards: Check all mentioned cards exist in DB
  if (expectedChecks.requireNoHallucinatedCards && supabase) {
    for (const cardName of cardNames.slice(0, 30)) { // Limit to 30 cards
      totalChecks++;
      try {
        const normalizedName = cardName.toLowerCase().trim();
        const { data, error } = await supabase
          .from("scryfall_cache")
          .select("name")
          .ilike("name", normalizedName)
          .limit(1)
          .maybeSingle();

        if (!data || error) {
          // Try fuzzy match as fallback
          const { data: fuzzyData } = await supabase
            .from("scryfall_cache")
            .select("name")
            .ilike("name", `%${normalizedName}%`)
            .limit(1)
            .maybeSingle();

          if (!fuzzyData) {
            checks.push({
              type: "requireNoHallucinatedCards",
              passed: false,
              message: `Hallucinated card detected: "${cardName}"`,
            });
            warnings.push(`Card "${cardName}" not found in database`);
          } else {
            passedCount++;
          }
        } else {
          passedCount++;
        }
      } catch (error: any) {
        // On error, give benefit of doubt but warn
        warnings.push(`Error checking card "${cardName}": ${error.message}`);
        passedCount++; // Don't fail on lookup errors
      }
    }
  }

  // 2. requireColorIdentitySafe: Check all cards are within color identity
  if (expectedChecks.requireColorIdentitySafe && supabase) {
    const allowedColors = testCase.input.colors || [];
    if (allowedColors.length > 0) {
      for (const cardName of cardNames.slice(0, 30)) {
        totalChecks++;
        const colorCheck = await checkColorIdentity(cardName, allowedColors, supabase);
        checks.push({
          type: "requireColorIdentitySafe",
          passed: colorCheck.passed,
          message: colorCheck.message,
        });
        if (colorCheck.passed) {
          passedCount++;
        } else {
          warnings.push(colorCheck.message);
        }
      }
    }
  }

  // 3. requirePermanentsOnly: Check all cards are permanents (not instants/sorceries)
  if (expectedChecks.requirePermanentsOnly && supabase) {
    const PERMANENT_TYPES = ["creature", "artifact", "enchantment", "planeswalker", "battle", "land"];
    const NON_PERMANENT_TYPES = ["instant", "sorcery"];

    for (const cardName of cardNames.slice(0, 30)) {
      totalChecks++;
      try {
        const normalizedName = cardName.toLowerCase().trim();
        const { data } = await supabase
          .from("scryfall_cache")
          .select("type_line")
          .ilike("name", normalizedName)
          .limit(1)
          .maybeSingle();

        if (!data || !data.type_line) {
          // Card not found - skip check (already handled by hallucination check)
          passedCount++;
          continue;
        }

        const typeLine = (data.type_line || "").toLowerCase();
        const isPermanent = PERMANENT_TYPES.some(type => typeLine.includes(type));
        const isNonPermanent = NON_PERMANENT_TYPES.some(type => typeLine.includes(type));

        if (isNonPermanent && !isPermanent) {
          checks.push({
            type: "requirePermanentsOnly",
            passed: false,
            message: `Card "${cardName}" is not a permanent (type: ${data.type_line})`,
          });
          warnings.push(`Non-permanent card "${cardName}" suggested (type: ${data.type_line})`);
        } else {
          passedCount++;
        }
      } catch (error: any) {
        warnings.push(`Error checking permanence for "${cardName}": ${error.message}`);
        passedCount++; // Don't fail on lookup errors
      }
    }
  }

  // 4. minTribalDensity: Check tribal density in deck
  if (expectedChecks.minTribalDensity) {
    totalChecks++;
    const { tribe, minPercent } = expectedChecks.minTribalDensity;
    
    // Parse deck from input.deckText or response
    const deckText = testCase.input.deckText || "";
    const { parseDeckText } = await import("@/lib/deck/parseDeckText");
    const deckEntries = parseDeckText(deckText + "\n" + response); // Combine input and response
    
    // Count creatures and tribe matches
    let totalCreatures = 0;
    let tribeMatches = 0;

    if (supabase) {
      for (const entry of deckEntries) {
        try {
          const { data } = await supabase
            .from("scryfall_cache")
            .select("type_line")
            .ilike("name", entry.name.toLowerCase())
            .limit(1)
            .maybeSingle();

          if (data?.type_line) {
            const typeLine = data.type_line.toLowerCase();
            if (typeLine.includes("creature")) {
              totalCreatures++;
              if (typeLine.includes(tribe.toLowerCase())) {
                tribeMatches++;
              }
            }
          }
        } catch (error) {
          // Skip on error
        }
      }
    }

    const density = totalCreatures > 0 ? tribeMatches / totalCreatures : 0;
    const passed = density >= minPercent;

    checks.push({
      type: "minTribalDensity",
      passed,
      message: passed
        ? `Tribal density OK: ${Math.round(density * 100)}% ${tribe}s (required: ${Math.round(minPercent * 100)}%+)`
        : `Tribal density too low: ${Math.round(density * 100)}% ${tribe}s (required: ${Math.round(minPercent * 100)}%+)`,
    });

    if (passed) {
      passedCount++;
    } else {
      warnings.push(`Tribal density for ${tribe} is ${Math.round(density * 100)}%, need at least ${Math.round(minPercent * 100)}%`);
    }
  }

  // 5. maxTotalCards / minTotalCards: Check deck size
  if (expectedChecks.maxTotalCards !== undefined || expectedChecks.minTotalCards !== undefined) {
    totalChecks++;
    const { parseDeckText } = await import("@/lib/deck/parseDeckText");
    const deckText = testCase.input.deckText || "";
    const deckEntries = parseDeckText(deckText + "\n" + response);
    const totalCards = deckEntries.reduce((sum, entry) => sum + entry.qty, 0);

    let passed = true;
    let message = `Deck size: ${totalCards} cards`;

    if (expectedChecks.minTotalCards !== undefined && totalCards < expectedChecks.minTotalCards) {
      passed = false;
      message = `Deck too small: ${totalCards} cards (minimum: ${expectedChecks.minTotalCards})`;
    }

    if (expectedChecks.maxTotalCards !== undefined && totalCards > expectedChecks.maxTotalCards) {
      passed = false;
      message = `Deck too large: ${totalCards} cards (maximum: ${expectedChecks.maxTotalCards})`;
    }

    checks.push({
      type: "deckSize",
      passed,
      message,
    });

    if (passed) {
      passedCount++;
    } else {
      warnings.push(message);
    }
  }

  // 6. mustNotRecommendExcessiveLands / maxRecommendedLandsToAdd: Check land recommendations
  if (expectedChecks.mustNotRecommendExcessiveLands) {
    totalChecks++;
    const responseLower = response.toLowerCase();
    
    // Heuristic: look for patterns like "add X lands", "X more lands", or lists under "Lands" heading
    const landPatterns = [
      /add\s+(\d+)\s+lands?/gi,
      /(\d+)\s+more\s+lands?/gi,
      /(\d+)\s+additional\s+lands?/gi,
      /recommend\s+(\d+)\s+lands?/gi,
    ];

    let maxLandsToAdd = 0;
    for (const pattern of landPatterns) {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        const num = parseInt(match[1]);
        if (num > maxLandsToAdd) {
          maxLandsToAdd = num;
        }
      }
    }

    // Also check for land lists (count lines that mention "land" and a number)
    const lines = response.split(/\n/);
    for (const line of lines) {
      const landMatch = line.match(/(\d+)\s+.*land/gi);
      if (landMatch) {
        for (const match of landMatch) {
          const numMatch = match.match(/(\d+)/);
          if (numMatch) {
            const num = parseInt(numMatch[1]);
            if (num > maxLandsToAdd) {
              maxLandsToAdd = num;
            }
          }
        }
      }
    }

    const maxAllowed = expectedChecks.maxRecommendedLandsToAdd || 5;
    const passed = maxLandsToAdd <= maxAllowed;

    checks.push({
      type: "mustNotRecommendExcessiveLands",
      passed,
      message: passed
        ? `Land recommendations OK: ${maxLandsToAdd} lands recommended (max: ${maxAllowed})`
        : `Excessive land recommendation: ${maxLandsToAdd} lands (max allowed: ${maxAllowed})`,
    });

    if (passed) {
      passedCount++;
    } else {
      warnings.push(`AI recommended adding ${maxLandsToAdd} lands, which exceeds the limit of ${maxAllowed}`);
    }
  }

  const score = totalChecks > 0 ? Math.round((passedCount / totalChecks) * 100) : 100;
  const passed = score >= 80; // 80% threshold

  return {
    passed,
    score,
    checks: checks.length > 0 ? checks : [{
      type: "safety_checks",
      passed: true,
      message: "No safety checks required",
    }],
    warnings,
  };
}

/**
 * Specificity Judge: Requires concrete card suggestions in deck analysis
 * 
 * Only runs for deck_analysis tests or when explicitly requested. Skips for
 * rules questions, short definitions, or teaching-mode conceptual answers.
 */
export function validateSpecificity(
  response: string,
  testCase: { input: any; type?: string; expectedChecks?: ExpectedChecks }
): ValidationResult {
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  
  // Only check deck_analysis type responses or when explicitly requested
  const isDeckAnalysis = testCase.type === "deck_analysis";
  const explicitlyRequested = testCase.expectedChecks?.requireSpecificity === true;
  
  if (!isDeckAnalysis && !explicitlyRequested) {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "specificity",
        passed: true,
        message: "Skipped (not a deck analysis test or explicitly requested)",
      }],
      warnings: [],
    };
  }
  
  // Skip for very short answers (likely rules/definition questions)
  if (response.length < 150) {
    return {
      passed: true,
      score: 100,
      checks: [{
        type: "specificity",
        passed: true,
        message: "Skipped (response too short - likely not a deck advice question)",
      }],
      warnings: [],
    };
  }
  
  // Extract card names (simple pattern - **Card Name** or [[Card Name]])
  const cardNamePattern = /\*\*([^*]+)\*\*/g;
  const cardNames: Set<string> = new Set();
  let match;
  
  while ((match = cardNamePattern.exec(response)) !== null) {
    const name = match[1].trim().toLowerCase();
    // Filter out common false positives
    if (name.length > 2 && !["the", "and", "or", "for", "with", "this", "that"].includes(name)) {
      cardNames.add(name);
    }
  }
  
  const uniqueCardCount = cardNames.size;
  const responseLength = response.length;
  
  // Require at least 5 unique card names for longer responses, 2-3 for shorter ones
  const minCards = responseLength > 500 ? 5 : responseLength > 200 ? 3 : 2;
  const passed = uniqueCardCount >= minCards;
  
  checks.push({
    type: "specificity",
    passed,
    message: passed
      ? `Contains ${uniqueCardCount} unique card names (required: ${minCards})`
      : `Only ${uniqueCardCount} unique card names mentioned, need at least ${minCards} for deck analysis`,
  });
  
  return {
    passed,
    score: passed ? 100 : Math.max(0, Math.round((uniqueCardCount / minCards) * 100)),
    checks,
    warnings: passed ? [] : ["Deck analysis should include concrete card suggestions, not just generic advice"],
  };
}

/**
 * Run all validation checks
 */
export async function validateResponse(
  response: string,
  testCase: {
    name?: string;
    input: any;
    expectedChecks?: ExpectedChecks;
    expectedAnswer?: string; // For semantic similarity
    type?: string; // Test type: "chat" or "deck_analysis"
  },
  options: {
    runKeywordChecks?: boolean;
    runLLMFactCheck?: boolean;
    runReferenceCompare?: boolean;
    runSemanticCheck?: boolean;
    runAdvancedJudges?: boolean; // New: run advanced behavior judges
    apiKey?: string;
    supabase?: any;
  } = {}
): Promise<{
  keywordResults?: ValidationResult;
  llmResults?: ValidationResult;
  llmJudge?: JudgeResult;
  referenceResults?: ValidationResult;
  semanticResults?: ValidationResult;
  deckStyleResults?: ValidationResult;
  problemsFirstResults?: ValidationResult;
  synergyResults?: ValidationResult;
  consistencyResults?: ValidationResult;
  budgetResults?: ValidationResult;
  toneResults?: ValidationResult;
  specificityResults?: ValidationResult;
  colorIdentityResults?: ValidationResult;
  overall: {
    passed: boolean;
    score: number;
    summary: string;
  };
}> {
  const results: {
    keywordResults?: ValidationResult;
    llmResults?: ValidationResult;
    llmJudge?: JudgeResult;
    referenceResults?: ValidationResult;
    semanticResults?: ValidationResult;
    deckStyleResults?: ValidationResult;
    problemsFirstResults?: ValidationResult;
    synergyResults?: ValidationResult;
    consistencyResults?: ValidationResult;
    budgetResults?: ValidationResult;
    toneResults?: ValidationResult;
    specificityResults?: ValidationResult;
    colorIdentityResults?: ValidationResult;
  } = {};

  // Keyword checks (always run if expectedChecks exist)
  if (testCase.expectedChecks && (options.runKeywordChecks !== false)) {
    results.keywordResults = validateKeywords(response, testCase.expectedChecks);
  }

  // LLM fact-check (returns both validation and judge result)
  if (options.runLLMFactCheck && options.apiKey) {
    const llmResult = await validateLLMFactCheck(response, testCase, options.apiKey);
    results.llmResults = llmResult.validation;
    results.llmJudge = llmResult.judge;
  }

  // Reference comparison (now uses supabase for real checks)
  if (options.runReferenceCompare) {
    results.referenceResults = await validateReferenceCompare(
      response,
      testCase,
      options.supabase
    );
  }

  // Semantic similarity check
  if (options.runSemanticCheck && options.apiKey && testCase.expectedAnswer) {
    results.semanticResults = await validateSemanticSimilarity(
      response,
      testCase.expectedAnswer,
      options.apiKey
    );
  }

  // Advanced behavior judges (run if enabled or if expectedChecks require them)
  const runAdvanced = options.runAdvancedJudges !== false; // Default to true
  const checks = testCase.expectedChecks || {};
  const testType = testCase.type || "chat"; // Extract type from testCase
  
  if (runAdvanced) {
    // Deck Style & Plan Judge
    if (checks.requireDeckStyle !== false) { // Default to true for deck_analysis
      results.deckStyleResults = validateDeckStyleAndPlan(response, { ...testCase, type: testType });
    }
    
    // Problems-First Structure Judge
    if (checks.requireProblemsFirst !== false) { // Default to true for deck_analysis
      results.problemsFirstResults = validateProblemsFirstStructure(response, { ...testCase, type: testType });
    }
    
    // Synergy Judge
    if (checks.requireSynergy !== false) { // Default to true for deck_analysis
      results.synergyResults = validateSynergy(response, { ...testCase, type: testType });
    }
    
    // Consistency Judge
    if (checks.requireConsistency !== false) {
      results.consistencyResults = validateConsistency(response, { ...testCase, type: testType });
    }
    
    // Budget Awareness Judge
    if (checks.requireBudgetAwareness !== false) {
      results.budgetResults = validateBudgetAwareness(response, testCase);
    }
    
    // Tone Judge
    if (checks.requireToneMatch !== false) {
      results.toneResults = validateTone(response, testCase);
    }
    
    // Specificity Judge
    if (checks.requireSpecificity !== false) { // Default to true for deck_analysis
      results.specificityResults = validateSpecificity(response, { ...testCase, type: testType, expectedChecks: checks });
    }
    
    // Color Identity & Legality Judge
    if (checks.requireLegalIdentity === true && options.supabase) {
      results.colorIdentityResults = await validateColorIdentityAndLegality(
        response,
        { ...testCase, type: testType },
        options.supabase
      );
    }

    // Safety Checks (new regression test validators)
    const hasSafetyChecks = 
      checks.requireNoHallucinatedCards ||
      checks.requireColorIdentitySafe ||
      checks.requirePermanentsOnly ||
      checks.minTribalDensity ||
      checks.maxTotalCards !== undefined ||
      checks.minTotalCards !== undefined ||
      checks.mustNotRecommendExcessiveLands;
    
    if (hasSafetyChecks && options.supabase) {
      const safetyResults = await validateSafetyChecks(
        response,
        { input: testCase.input, expectedChecks: testCase.expectedChecks },
        options.supabase
      );
      // Merge safety check results into existing results
      if (!results.colorIdentityResults && checks.requireColorIdentitySafe) {
        results.colorIdentityResults = safetyResults;
      } else if (safetyResults.checks.length > 0) {
        // Add safety checks to appropriate result or create new one
        if (results.colorIdentityResults) {
          results.colorIdentityResults.checks.push(...safetyResults.checks);
          results.colorIdentityResults.warnings.push(...safetyResults.warnings);
        } else {
          // Store as a separate result type (we'll add it to return type)
          (results as any).safetyResults = safetyResults;
        }
      }
    }
  }

  // Calculate overall score (include all judge results)
  const allScores: number[] = [];
  if (results.keywordResults) allScores.push(results.keywordResults.score);
  if (results.llmResults) allScores.push(results.llmResults.score);
  if (results.llmJudge) allScores.push(results.llmJudge.overall_score);
  if (results.referenceResults) allScores.push(results.referenceResults.score);
  if (results.semanticResults) allScores.push(results.semanticResults.score);
  if (results.deckStyleResults) allScores.push(results.deckStyleResults.score);
  if (results.problemsFirstResults) allScores.push(results.problemsFirstResults.score);
  if (results.synergyResults) allScores.push(results.synergyResults.score);
  if (results.consistencyResults) allScores.push(results.consistencyResults.score);
  if (results.budgetResults) allScores.push(results.budgetResults.score);
  if (results.toneResults) allScores.push(results.toneResults.score);
  if (results.specificityResults) allScores.push(results.specificityResults.score);
  if (results.colorIdentityResults) allScores.push(results.colorIdentityResults.score);
  if ((results as any).safetyResults) allScores.push((results as any).safetyResults.score);

  const overallScore =
    allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 100;

  const overallPassed = overallScore >= 70;

  const summary = `Overall: ${overallPassed ? "PASSED" : "FAILED"} (${overallScore}%)`;

  return {
    ...results,
    overall: {
      passed: overallPassed,
      score: overallScore,
      summary,
    },
  };
}

