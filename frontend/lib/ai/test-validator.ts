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

  // Should contain keywords
  if (expectedChecks.shouldContain && expectedChecks.shouldContain.length > 0) {
    for (const keyword of expectedChecks.shouldContain) {
      totalChecks++;
      const keywordLower = keyword.toLowerCase();
      const passed = responseLower.includes(keywordLower);
      checks.push({
        type: "shouldContain",
        passed,
        message: passed
          ? `Contains "${keyword}"`
          : `Missing required keyword: "${keyword}"`,
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
  testCase: { name: string; input: any; expectedChecks?: ExpectedChecks },
  apiKey: string
): Promise<{ validation: ValidationResult; judge: JudgeResult }> {
  const systemPrompt = `You are a Magic: The Gathering expert fact-checker. Review the AI assistant's response and provide structured evaluation.

Test case: ${testCase.name}
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
  
  // Problem keywords (should appear early)
  const problemKeywords = [
    "problem", "problems", "issue", "issues", "weakness", "weaknesses",
    "lacks", "missing", "struggles", "weak", "low", "too few", "too many",
    "biggest issue", "main problem", "key problem", "concern", "concerns"
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
  
  // Synergy language patterns
  const synergyPhrases = [
    "works well with", "combos with", "pairs with", "synergizes with",
    "supports", "triggers", "fuels", "payoff for", "engine", "sac outlet",
    "token maker", "enables", "works together", "combines with", "interacts with",
    "when you", "whenever you", "each time you", "when X enters", "when X dies"
  ];
  
  // Extract card names (simple pattern - **Card Name** or [[Card Name]])
  const cardNamePattern = /\*\*([^*]+)\*\*/g;
  const cardNames: string[] = [];
  let match;
  while ((match = cardNamePattern.exec(response)) !== null) {
    cardNames.push(match[1].toLowerCase().trim());
  }
  
  // Check if any sentence contains both synergy language and multiple card names
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
  let hasSynergySentence = false;
  
  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    const hasSynergyPhrase = synergyPhrases.some(phrase => sentenceLower.includes(phrase));
    
    // Count card names in this sentence
    const cardsInSentence = cardNames.filter(card => sentenceLower.includes(card));
    
    if (hasSynergyPhrase && cardsInSentence.length >= 2) {
      hasSynergySentence = true;
      break;
    }
  }
  
  // Also check if response mentions at least 2 cards together in a meaningful way
  // (even without explicit synergy phrases, if cards are mentioned together it might be synergy)
  const hasMultipleCards = cardNames.length >= 2;
  const passed = hasSynergySentence || (hasMultipleCards && responseLower.includes(" and ") && responseLower.length > 100);
  
  checks.push({
    type: "synergy",
    passed,
    message: passed
      ? "Contains synergy language connecting multiple cards"
      : "Missing synergy explanations - should connect multiple cards with phrases like 'works well with', 'combos with', etc.",
  });
  
  return {
    passed,
    score: passed ? 100 : 0,
    checks,
    warnings: passed ? [] : ["Response should explain how cards work together, not just list isolated suggestions"],
  };
}

/**
 * Consistency Judge: Checks that numeric guidelines match concrete suggestions
 */
export function validateConsistency(
  response: string,
  testCase: { input: any; type?: string }
): ValidationResult {
  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  const warnings: string[] = [];
  
  const responseLower = response.toLowerCase();
  
  // Extract numeric ranges mentioned (e.g., "8-12", "33-37", "8 to 12")
  const rangePattern = /(\d+)[\s-]+(?:to|–|-)[\s-]+(\d+)/g;
  const ranges: Array<{ min: number; max: number; context: string }> = [];
  let match;
  
  while ((match = rangePattern.exec(response)) !== null) {
    const min = parseInt(match[1]);
    const max = parseInt(match[2]);
    const context = response.substring(Math.max(0, match.index - 50), match.index + match[0].length + 50).toLowerCase();
    ranges.push({ min, max, context });
  }
  
  // Check for ramp/land count consistency
  for (const range of ranges) {
    if (range.context.includes("ramp") || range.context.includes("mana source")) {
      // Count ramp-related card mentions
      const rampKeywords = ["cultivate", "kodama", "nature's lore", "three visits", "sol ring", "arcane signet", "signet", "talisman", "llanowar", "elvish mystic", "birds of paradise", "ramp"];
      const rampMentions = rampKeywords.filter(kw => responseLower.includes(kw)).length;
      
      // If range says 8-12 but only 1-3 examples, that's inconsistent
      if (rampMentions < range.min * 0.3) {
        checks.push({
          type: "consistency_ramp",
          passed: false,
          message: `States ${range.min}-${range.max} ramp pieces but only provides ${rampMentions} examples`,
        });
        warnings.push(`Ramp guideline (${range.min}-${range.max}) doesn't match examples provided`);
      } else {
        checks.push({
          type: "consistency_ramp",
          passed: true,
          message: `Ramp guideline (${range.min}-${range.max}) roughly matches examples`,
        });
      }
    }
    
    if (range.context.includes("land") && !range.context.includes("ramp")) {
      // Land count consistency - check if suggestions align with range
      const landKeywords = ["land", "lands", "mana base"];
      const landMentions = landKeywords.filter(kw => responseLower.includes(kw)).length;
      
      // This is a softer check - just warn if range is mentioned but no land discussion
      if (landMentions === 0) {
        warnings.push(`Land count range (${range.min}-${range.max}) mentioned but no land discussion follows`);
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
      message: "No numeric guidelines found to check",
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
  
  // Competitive language (should appear for competitive, not for casual)
  const competitiveLanguage = ["cedh", "hyper-efficient", "stax", "infinite combo", "tier", "meta", "optimized", "low curve", "resilient"];
  const hasCompetitiveLanguage = competitiveLanguage.some(kw => responseLower.includes(kw));
  
  // Casual-friendly language
  const casualLanguage = ["fun", "flavorful", "thematic", "casual", "kitchen table", "budget-friendly"];
  const hasCasualLanguage = casualLanguage.some(kw => responseLower.includes(kw));
  
  let passed = true;
  let message = "";
  
  if (userSignalsCasual && hasCompetitiveLanguage && !hasCasualLanguage) {
    passed = false;
    message = "User signaled casual but response uses competitive language (cedh, stax, etc.)";
  } else if (userSignalsCompetitive && !hasCompetitiveLanguage && responseLower.length > 200) {
    // For competitive, should have some efficiency/resilience language
    const efficiencyKeywords = ["efficient", "interaction", "resilient", "refine", "optimize"];
    const hasEfficiency = efficiencyKeywords.some(kw => responseLower.includes(kw));
    if (!hasEfficiency) {
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
 * Specificity Judge: Requires concrete card suggestions in deck analysis
 */
export function validateSpecificity(
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
        type: "specificity",
        passed: true,
        message: "Skipped (not a deck analysis test)",
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
  
  // Require at least 5-8 unique card names for longer responses
  const minCards = responseLength > 500 ? 8 : responseLength > 200 ? 5 : 3;
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
    name: string;
    input: any;
    expectedChecks?: ExpectedChecks;
    expectedAnswer?: string; // For semantic similarity
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
  
  if (runAdvanced) {
    // Deck Style & Plan Judge
    if (checks.requireDeckStyle !== false) { // Default to true for deck_analysis
      results.deckStyleResults = validateDeckStyleAndPlan(response, testCase);
    }
    
    // Problems-First Structure Judge
    if (checks.requireProblemsFirst !== false) { // Default to true for deck_analysis
      results.problemsFirstResults = validateProblemsFirstStructure(response, testCase);
    }
    
    // Synergy Judge
    if (checks.requireSynergy !== false) { // Default to true for deck_analysis
      results.synergyResults = validateSynergy(response, testCase);
    }
    
    // Consistency Judge
    if (checks.requireConsistency !== false) {
      results.consistencyResults = validateConsistency(response, testCase);
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
      results.specificityResults = validateSpecificity(response, testCase);
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

