/**
 * Mobile-only Deck Compare AI prompts (distinct from /api/deck/compare-ai web prompt).
 * Optimizes for short, skimmable, decision-first JSON for the app.
 */

function isCommanderFormatLabel(formatLabel: string): boolean {
  return formatLabel.trim().toLowerCase() === "commander";
}

export function buildMobileDeckCompareSystemPrompt(formatLabel: string): string {
  const fl = formatLabel.trim();
  const isCmd = isCommanderFormatLabel(fl);
  const analystLine = isCmd
    ? "You are an expert Magic: The Gathering Commander deck analyst."
    : `You are an expert Magic: The Gathering deck analyst for ${fl}.`;
  return [
    analystLine,
    "You output ONLY valid JSON (no markdown, no code fences, no commentary before or after the JSON).",
    "Your audience is a mobile app: prioritize quick decisions, clear deck-vs-deck framing, and concrete play patterns.",
    "Avoid generic filler, apologies, 'As an AI', or long intros.",
    "Do not use markdown headings (no # or ##).",
    "Compare speed, interaction density, finishers, consistency, resilience, tempo, and late-game — not card-by-card essays.",
    `If you name new cards as ideas, only cards legal in ${fl}; use [[double brackets]] for card names.`,
    "For 3-deck comparisons, keep the same JSON shape; verdict strings may name Deck A, Deck B, or Deck C as appropriate.",
  ].join(" ");
}

function schemaDimensionHints(formatLabel: string): string {
  const isCmd = isCommanderFormatLabel(formatLabel);
  if (isCmd) {
    return [
      '- summary.better_for_fast_tables / better_for_slower_pods: compare which list is stronger in fast multiplayer pods vs slower/grindier pods (use the JSON keys exactly as specified).',
      '- ui.verdict_cards: first two cards conceptually map to "Fast tables" vs "Slower pods" (labels in output can be short synonyms).',
      '- ui.scenario_cards: may reference slower pods / faster tables where appropriate.',
    ].join("\n");
  }
  return [
    '- summary.better_for_fast_tables / better_for_slower_pods: use the SAME JSON keys; semantically treat them as "faster games / aggressive metas" vs "grindier games / longer interactive games" for this format (do not mention Commander pods unless the decks are Commander).',
    '- ui.verdict_cards: first two entries should read like faster-game edge vs grindier-game edge while keeping winner strings aligned with deck list titles/commanders.',
    '- ui.scenario_cards: prefer "best for grindier games" style labels over "pods" for this format.',
  ].join("\n");
}

export function buildMobileDeckCompareUserPrompt(params: {
  decks: string;
  comparisonSummary: string;
  formatLabel: string;
}): string {
  const fl = params.formatLabel.trim();
  const schemaHint = [
    "Return a single JSON object with this exact top-level structure:",
    "{",
    '  "summary": {',
    '    "better_for_fast_tables": "Deck A|Deck B|Deck C — short label",',
    '    "better_for_slower_pods": "...",',
    '    "more_consistent": "...",',
    '    "highest_ceiling": "...",',
    '    "one_line_verdict": "1–2 sentences max comparing the decks."',
    "  },",
    '  "sections": {',
    '    "key_differences": ["short bullet", "..."],',
    '    "strategy": ["..."],',
    '    "strengths_weaknesses": ["..."],',
    '    "recommended_scenarios": ["when to pick which deck — short"]',
    "  },",
    '  "full_analysis": {',
    '    "key_differences": "compact paragraph, no markdown",',
    '    "strategy": "...",',
    '    "strengths_and_weaknesses": "...",',
    '    "recommendations": "brief tuning / meta tips",',
    '    "best_in_different_scenarios": "when each list shines"',
    "  },",
    '  "ui": {',
    '    "verdict_cards": [',
    '      { "label": "Fast tables", "winner": "commander or short deck label" },',
    '      { "label": "Slower pods", "winner": "..." },',
    '      { "label": "More consistent", "winner": "..." },',
    '      { "label": "Highest ceiling", "winner": "..." }',
    "    ],",
    '    "deck_strengths": {',
    '      "deck_a": ["short phrase", "max three"],',
    '      "deck_b": ["short phrase", "max three"]',
    "    },",
    '    "scenario_cards": [',
    '      { "label": "Best for slower pods", "winner": "...", "reason": "One sentence, plain text." }',
    "    ]",
    "  }",
    "}",
    "Rules:",
    "- Always include summary, sections, full_analysis, and ui.",
    "- ui.verdict_cards: exactly 4 objects; short labels; winners must match names from the deck lists.",
    schemaDimensionHints(fl),
    "- ui.deck_strengths: phrases only (no paragraphs); at most 3 strings per deck_a and deck_b.",
    "- For three-deck comparisons, add optional deck_c array inside deck_strengths only if the third list is meaningfully distinct; otherwise omit deck_c.",
    "- ui.scenario_cards: at most 3 objects; one-sentence reasons; no markdown or ** in ui strings.",
    "- Each sections.* array: at most 5 strings; each string under ~180 characters.",
    "- full_analysis values: tighter prose than a blog post; avoid rambling.",
    "- summary fields must be very short (verdict is the only 1–2 sentences).",
    "- Prefer game outcomes and play patterns over vague flavor.",
  ].join("\n");

  const constructedLens = isCommanderFormatLabel(fl)
    ? ""
    : [
        "",
        "Constructed lens (60-card): emphasize speed, curve, interaction density, consistency, sideboard readiness when inferable from lists, and how each deck navigates an unknown matchup — avoid multiplayer politics unless format is Commander.",
        "",
      ].join("\n");

  return [
    "DECKS AND LISTS:",
    params.decks,
    "",
    "COMPARISON STATS:",
    params.comparisonSummary,
    "",
    `Format context: ${fl}.`,
    constructedLens,
    schemaHint,
  ].join("\n");
}

export function buildComparisonSummaryLine(body: {
  comparison: {
    sharedCards?: unknown;
    uniqueToDecks?: Array<{ deckIndex?: number; cards?: unknown }>;
  };
}): string {
  const shared = Array.isArray(body.comparison.sharedCards) ? body.comparison.sharedCards.length : 0;
  const parts =
    body.comparison.uniqueToDecks?.map((d, i) => {
      const n = Array.isArray(d.cards) ? d.cards.length : 0;
      return `Deck index ${i}: ${n} unique card names`;
    }) ?? [];
  return [`Shared names (deduped overlap count context): ${shared}`, ...parts].join("\n");
}
