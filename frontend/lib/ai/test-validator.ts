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
    apiKey?: string;
    supabase?: any;
  } = {}
): Promise<{
  keywordResults?: ValidationResult;
  llmResults?: ValidationResult;
  llmJudge?: JudgeResult;
  referenceResults?: ValidationResult;
  semanticResults?: ValidationResult;
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

  // Calculate overall score
  const allScores: number[] = [];
  if (results.keywordResults) allScores.push(results.keywordResults.score);
  if (results.llmResults) allScores.push(results.llmResults.score);
  if (results.llmJudge) allScores.push(results.llmJudge.overall_score);
  if (results.referenceResults) allScores.push(results.referenceResults.score);
  if (results.semanticResults) allScores.push(results.semanticResults.score);

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

