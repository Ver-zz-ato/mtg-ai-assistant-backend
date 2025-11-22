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
 * Use LLM to fact-check the response
 */
export async function validateLLMFactCheck(
  response: string,
  testCase: { name: string; input: any; expectedChecks?: ExpectedChecks },
  apiKey: string
): Promise<ValidationResult> {
  const systemPrompt = `You are a Magic: The Gathering expert fact-checker. Review the AI assistant's response and verify its accuracy.

Test case: ${testCase.name}
User question: ${JSON.stringify(testCase.input.userMessage || "")}

Evaluate the response for:
1. Factual accuracy (card names, rules, format legality)
2. Consistency with MTG best practices
3. Appropriate tone (not overpromising)
4. Correct categorization (e.g., ramp types)

Return JSON: {"accurate": true/false, "score": 0-100, "issues": ["issue1", "issue2"], "strengths": ["strength1"]}`;

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
        max_tokens: 500,
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

    const result = JSON.parse(content);
    const passed = result.accurate === true && result.score >= 70;

    return {
      passed,
      score: result.score || 0,
      checks: [
        {
          type: "llm_fact_check",
          passed,
          message: passed
            ? `LLM fact-check passed (score: ${result.score})`
            : `LLM fact-check found issues: ${result.issues?.join(", ") || "unknown"}`,
        },
      ],
      warnings: result.issues || [],
    };
  } catch (error: any) {
    return {
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
    };
  }
}

/**
 * Compare response against reference sources (Scryfall, EDHREC)
 * This is a placeholder - full implementation would call those APIs
 */
export async function validateReferenceCompare(
  response: string,
  testCase: { input: any; expectedChecks?: ExpectedChecks }
): Promise<ValidationResult> {
  // Placeholder: In full implementation, would:
  // 1. Extract card names from response
  // 2. Check Scryfall for legality/format
  // 3. Check EDHREC for popularity/usage stats
  // 4. Compare against expected values

  const checks: Array<{ type: string; passed: boolean; message: string }> = [];
  const warnings: string[] = [];

  // Basic check: if format is specified, ensure mentioned cards are legal
  if (testCase.input.format) {
    // This would be expanded with actual Scryfall API calls
    checks.push({
      type: "reference_compare",
      passed: true,
      message: "Reference comparison not yet implemented (would check Scryfall/EDHREC)",
    });
  }

  return {
    passed: true,
    score: 100,
    checks,
    warnings,
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
  },
  options: {
    runKeywordChecks?: boolean;
    runLLMFactCheck?: boolean;
    runReferenceCompare?: boolean;
    apiKey?: string;
  } = {}
): Promise<{
  keywordResults?: ValidationResult;
  llmResults?: ValidationResult;
  referenceResults?: ValidationResult;
  overall: {
    passed: boolean;
    score: number;
    summary: string;
  };
}> {
  const results: {
    keywordResults?: ValidationResult;
    llmResults?: ValidationResult;
    referenceResults?: ValidationResult;
  } = {};

  // Keyword checks (always run if expectedChecks exist)
  if (testCase.expectedChecks && (options.runKeywordChecks !== false)) {
    results.keywordResults = validateKeywords(response, testCase.expectedChecks);
  }

  // LLM fact-check
  if (options.runLLMFactCheck && options.apiKey) {
    results.llmResults = await validateLLMFactCheck(response, testCase, options.apiKey);
  }

  // Reference comparison
  if (options.runReferenceCompare) {
    results.referenceResults = await validateReferenceCompare(response, testCase);
  }

  // Calculate overall score
  const allScores: number[] = [];
  if (results.keywordResults) allScores.push(results.keywordResults.score);
  if (results.llmResults) allScores.push(results.llmResults.score);
  if (results.referenceResults) allScores.push(results.referenceResults.score);

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

