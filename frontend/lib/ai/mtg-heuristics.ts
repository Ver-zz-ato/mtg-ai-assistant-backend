/**
 * MTG Domain Heuristics
 * Standard deck construction ranges and rules for validation
 */

export type Format = 'Commander' | 'Modern' | 'Standard' | 'Pioneer' | 'Pauper' | 'Legacy' | 'Vintage';
export type DeckArchetype = 'midrange' | 'aggro' | 'control' | 'combo' | 'burn' | 'tempo';

export interface RangeHeuristic {
  typical: [number, number]; // [min, max] typical range
  acceptable: [number, number]; // [min, max] acceptable range (wider tolerance)
  min?: number; // Absolute minimum (hard floor)
  max?: number; // Absolute maximum (hard ceiling)
}

export interface FormatHeuristics {
  lands: RangeHeuristic;
  ramp?: RangeHeuristic;
  draw?: RangeHeuristic;
  removal?: RangeHeuristic;
  interaction?: RangeHeuristic;
}

export interface ArchetypeHeuristics {
  [key: string]: FormatHeuristics;
}

/**
 * MTG deck construction heuristics by format and archetype
 */
export const MTG_HEURISTICS: Record<Format, ArchetypeHeuristics | FormatHeuristics> = {
  Commander: {
    lands: {
      typical: [35, 38],
      acceptable: [33, 40],
      min: 30,
      max: 45,
    },
    ramp: {
      typical: [8, 12],
      acceptable: [6, 15],
      min: 5,
      max: 20,
    },
    draw: {
      typical: [8, 12],
      acceptable: [6, 15],
      min: 4,
      max: 20,
    },
    removal: {
      typical: [5, 10],
      acceptable: [4, 12],
      min: 3,
      max: 15,
    },
    interaction: {
      typical: [8, 12], // Combination of removal + counters + protection
      acceptable: [6, 15],
    },
  },
  Modern: {
    midrange: {
      lands: {
        typical: [24, 25],
        acceptable: [23, 26],
        min: 22,
        max: 27,
      },
    },
    aggro: {
      lands: {
        typical: [19, 21],
        acceptable: [18, 22],
        min: 17,
        max: 23,
      },
    },
    burn: {
      lands: {
        typical: [19, 20],
        acceptable: [18, 21],
        min: 17,
        max: 22,
      },
    },
    control: {
      lands: {
        typical: [25, 26],
        acceptable: [24, 27],
        min: 23,
        max: 28,
      },
    },
  },
  Standard: {
    midrange: {
      lands: {
        typical: [24, 25],
        acceptable: [23, 26],
        min: 22,
        max: 27,
      },
    },
    aggro: {
      lands: {
        typical: [20, 22],
        acceptable: [19, 23],
        min: 18,
        max: 24,
      },
    },
    control: {
      lands: {
        typical: [25, 26],
        acceptable: [24, 27],
        min: 23,
        max: 28,
      },
    },
  },
  Pioneer: {
    midrange: {
      lands: {
        typical: [24, 25],
        acceptable: [23, 26],
        min: 22,
        max: 27,
      },
    },
    aggro: {
      lands: {
        typical: [20, 22],
        acceptable: [19, 23],
        min: 18,
        max: 24,
      },
    },
  },
  Pauper: {
    midrange: {
      lands: {
        typical: [23, 24],
        acceptable: [22, 25],
        min: 20,
        max: 26,
      },
    },
  },
  Legacy: {
    midrange: {
      lands: {
        typical: [23, 24],
        acceptable: [22, 25],
        min: 20,
        max: 26,
      },
    },
    aggro: {
      lands: {
        typical: [18, 20],
        acceptable: [17, 21],
        min: 16,
        max: 22,
      },
    },
  },
  Vintage: {
    midrange: {
      lands: {
        typical: [23, 24],
        acceptable: [22, 25],
        min: 20,
        max: 26,
      },
    },
  },
};

/**
 * Check if a numeric recommendation matches MTG heuristics
 */
export function validateHeuristic(
  category: 'lands' | 'ramp' | 'draw' | 'removal' | 'interaction',
  value: number,
  format: Format,
  archetype?: DeckArchetype
): {
  passed: boolean;
  severity: 'critical' | 'warning' | 'acceptable' | 'typical';
  message: string;
} {
  const formatData = MTG_HEURISTICS[format];
  
  // Handle Commander (no archetype sub-structure)
  let heuristic: RangeHeuristic | undefined;
  if ('lands' in formatData && typeof formatData.lands === 'object' && 'typical' in formatData.lands) {
    // Commander format - direct access
    heuristic = (formatData as FormatHeuristics)[category];
  } else if (archetype && formatData && typeof formatData === 'object' && archetype in formatData) {
    // Format with archetypes
    const archetypeData = (formatData as ArchetypeHeuristics)[archetype];
    if (archetypeData && category in archetypeData) {
      heuristic = archetypeData[category];
    }
  } else if (formatData && typeof formatData === 'object' && 'midrange' in formatData) {
    // Fallback to midrange if archetype not found
    const midrangeData = (formatData as ArchetypeHeuristics).midrange;
    if (midrangeData && category in midrangeData) {
      heuristic = midrangeData[category];
    }
  }

  if (!heuristic) {
    return {
      passed: true,
      severity: 'acceptable',
      message: `No heuristic defined for ${format} ${archetype || ''} ${category}`,
    };
  }

  const { typical, acceptable, min, max } = heuristic;

  // Check absolute limits first
  if (min !== undefined && value < min) {
    return {
      passed: false,
      severity: 'critical',
      message: `${category} count ${value} is below absolute minimum ${min} for ${format} ${archetype || ''}`,
    };
  }
  if (max !== undefined && value > max) {
    return {
      passed: false,
      severity: 'critical',
      message: `${category} count ${value} exceeds absolute maximum ${max} for ${format} ${archetype || ''}`,
    };
  }

  // Check typical range
  if (value >= typical[0] && value <= typical[1]) {
    return {
      passed: true,
      severity: 'typical',
      message: `${category} count ${value} is in typical range [${typical[0]}, ${typical[1]}] for ${format} ${archetype || ''}`,
    };
  }

  // Check acceptable range
  if (value >= acceptable[0] && value <= acceptable[1]) {
    return {
      passed: true,
      severity: 'acceptable',
      message: `${category} count ${value} is in acceptable range [${acceptable[0]}, ${acceptable[1]}] for ${format} ${archetype || ''}`,
    };
  }

  // Outside acceptable range - calculate severity
  const typicalMid = (typical[0] + typical[1]) / 2;
  const distance = Math.abs(value - typicalMid);
  const typicalRange = typical[1] - typical[0];
  const acceptableRange = acceptable[1] - acceptable[0];

  // If very far from typical, it's critical
  if (distance > typicalRange * 2) {
    return {
      passed: false,
      severity: 'critical',
      message: `${category} count ${value} is far outside typical range [${typical[0]}, ${typical[1]}] for ${format} ${archetype || ''}`,
    };
  }

  // Otherwise it's a warning
  return {
    passed: true, // Still passes but with warning
    severity: 'warning',
    message: `${category} count ${value} is outside typical range [${typical[0]}, ${typical[1]}] but within acceptable limits`,
  };
}

/**
 * Extract numeric recommendations from text
 * Prioritizes explicit recommendations over example counts
 */
export function extractNumericRecommendations(
  text: string,
  category: 'lands' | 'ramp' | 'draw' | 'removal' | 'interaction'
): number[] {
  const categoryKeywords: Record<string, string[]> = {
    lands: ['land', 'lands', 'mana base'],
    ramp: ['ramp', 'mana acceleration', 'mana rock', 'mana dork'],
    draw: ['draw', 'card draw', 'card advantage', 'card selection'],
    removal: ['removal', 'interaction', 'kill spell', 'destroy', 'exile'],
    interaction: ['interaction', 'removal', 'counterspell', 'counter', 'protection'],
  };

  const keywords = categoryKeywords[category] || [];
  const values: number[] = [];

  // FIRST PASS: Look for explicit recommendations (prioritize these)
  // Patterns like "run 8-12 ramp", "aim for X-Y lands", "should have X-Y pieces", "recommended X-Y"
  const recommendationPhrases = [
    'run', 'aim for', 'should have', 'recommended', 'typically', 'usually', 'generally',
    'you should', 'try to run', 'consider running', 'target', 'goal is', 'shoot for'
  ];

  for (const keyword of keywords) {
    for (const phrase of recommendationPhrases) {
      // Pattern for ranges: "run 8-12 ramp pieces" or "aim for 33-37 lands"
      const recommendationRangePattern = new RegExp(
        `${phrase}\\s+(?:about|around|roughly)?\\s*(\\d+)[\\s-–]+(?:to|–|-)[\\s-–]+(\\d+)\\s+${keyword}(?:\\s+(?:pieces?|cards?|sources?|effects?))?`,
        'gi'
      );
      let match;
      while ((match = recommendationRangePattern.exec(text)) !== null) {
        const min = parseInt(match[1]);
        const max = parseInt(match[2]);
        if (min > 0 && max > 0 && max >= min && max < 100) {
          values.push(Math.round((min + max) / 2));
        }
      }

      // Pattern for single numbers: "run 10 ramp pieces" or "aim for 24 lands"
      const recommendationSinglePattern = new RegExp(
        `${phrase}\\s+(?:about|around|roughly)?\\s*(\\d+)\\s+${keyword}(?:\\s+(?:pieces?|cards?|sources?|effects?))?`,
        'gi'
      );
      while ((match = recommendationSinglePattern.exec(text)) !== null) {
        const val = parseInt(match[1]);
        if (val > 0 && val < 100) {
          values.push(val);
        }
      }
    }

    // Also check for standalone ranges at sentence start or after punctuation (likely recommendations)
    const standaloneRangePattern = new RegExp(
      `(?:^|[.!?]\\s+)(?:you|your|a|an|the|in|for)\\s+(?:typical|standard|normal|good)\\s+(?:commander|deck|build).*?(\\d+)[\\s-–]+(?:to|–|-)[\\s-–]+(\\d+)\\s+${keyword}(?:\\s+(?:pieces?|cards?|sources?|effects?))?`,
      'gi'
    );
    let match: RegExpExecArray | null;
    while ((match = standaloneRangePattern.exec(text)) !== null) {
      const min = parseInt(match[1]);
      const max = parseInt(match[2]);
      if (min > 0 && max > 0 && max >= min && max < 100) {
        values.push(Math.round((min + max) / 2));
      }
    }
  }

  // If we found explicit recommendations, return those (prioritize over examples)
  if (values.length > 0) {
    return Array.from(new Set(values)).sort((a, b) => a - b);
  }

  // SECOND PASS: Fall back to counting examples only if no recommendations found
  // Pattern 1: "X lands" or "X ramp pieces" (simple count)
  for (const keyword of keywords) {
    const patterns = [
      new RegExp(`(\\d+)\\s+${keyword}(?:\\s+(?:pieces?|cards?|sources?|effects?|spells?))?(?:,|\\s|$)`, 'gi'),
      new RegExp(`(\\d+)[\\s-–]+(?:to|–|-)[\\s-–]+(\\d+)\\s+${keyword}(?:\\s+(?:pieces?|cards?|sources?|effects?))?`, 'gi'), // Ranges
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[2]) {
          // Range - take midpoint
          const min = parseInt(match[1]);
          const max = parseInt(match[2]);
          values.push(Math.round((min + max) / 2));
        } else {
          const val = parseInt(match[1]);
          // Filter out obvious non-recommendations (like "4-player" or page numbers)
          if (val > 0 && val < 100 && val !== 4 && val !== 60 && val !== 100) {
            values.push(val);
          }
        }
      }
    }
  }

  // Remove duplicates and sort
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

/**
 * Check if text contains poor strategic advice based on MTG heuristics
 * Distinguishes between general advice (recommendations) and deck list analysis
 */
export function checkStrategicAdvice(
  text: string,
  format: Format,
  archetype?: DeckArchetype
): Array<{
  category: string;
  value: number;
  severity: 'critical' | 'warning' | 'acceptable' | 'typical';
  message: string;
}> {
  const issues: Array<{
    category: string;
    value: number;
    severity: 'critical' | 'warning' | 'acceptable' | 'typical';
    message: string;
  }> = [];

  // Detect if this is general advice (guidelines) vs deck list analysis
  // General advice indicators: "you should", "run", "aim for", "typically", "recommended", "generally"
  // Deck list indicators: card lists, "your deck has", "the deck contains", specific card counts
  const textLower = text.toLowerCase();
  const isGeneralAdvice = /\b(you should|run|aim for|typically|usually|generally|recommended|consider running|target|goal|shoot for|in a typical|standard|normal|good)\b/i.test(text);
  const isDeckList = /\b(your deck|this deck|the deck|deck contains|deck has|you have|you're running|currently have|deck list|decklist)\b/i.test(text);

  // Check land count (most important)
  const landValues = extractNumericRecommendations(text, 'lands');
  for (const value of landValues) {
    // If this is general advice and we found a recommendation value, it's likely correct guidance
    // Only flag if it's clearly wrong (critical violations)
    const result = validateHeuristic('lands', value, format, archetype);
    if (result.severity === 'critical') {
      // Always flag critical violations
      issues.push({
        category: 'lands',
        value,
        severity: result.severity,
        message: result.message,
      });
    } else if (result.severity === 'warning' && format === 'Modern' && archetype === 'midrange' && value < 23) {
      // Flag specific Modern midrange land count warnings
      issues.push({
        category: 'lands',
        value,
        severity: result.severity,
        message: result.message,
      });
    } else if (result.severity === 'warning' && isDeckList && !isGeneralAdvice) {
      // For deck lists, warnings are more relevant (actual deck problems)
      issues.push({
        category: 'lands',
        value,
        severity: result.severity,
        message: result.message,
      });
    }
    // Skip warnings for general advice recommendations (they're guidelines, not actual deck counts)
  }

  // Check ramp count (for Commander)
  if (format === 'Commander') {
    const rampValues = extractNumericRecommendations(text, 'ramp');
    
    // If we have multiple ramp values and this looks like general advice, prioritize higher values
    // (recommendations are usually higher than example counts)
    let valuesToCheck = rampValues;
    if (isGeneralAdvice && rampValues.length > 1) {
      // In general advice, higher values are more likely to be the recommendation
      // Lower values might be example counts or other mentions
      valuesToCheck = [Math.max(...rampValues)];
    }
    
    for (const value of valuesToCheck) {
      const result = validateHeuristic('ramp', value, format);
      
      // Only flag critical violations for ramp
      // If this is general advice recommending "8-12 ramp" and we found a value >= 8, it's fine
      // Only flag if it's clearly too low (critical) AND not clearly a recommendation
      if (result.severity === 'critical') {
        // For general advice with recommendation phrases, be more lenient
        // If value is 4 but text says "run 8-12", ignore the 4 (it's just an example count)
        if (isGeneralAdvice && value < 6) {
          // Check if there's a higher recommendation mentioned
          const hasHigherRecommendation = /\b(run|aim|target|recommended|typically|usually).*?([6-9]|\d{2,})\s+ramp/gi.test(text);
          if (hasHigherRecommendation) {
            // Skip this low value - it's just an example count, not the recommendation
            continue;
          }
        }
        
        issues.push({
          category: 'ramp',
          value,
          severity: result.severity,
          message: result.message,
        });
      }
    }
  }

  return issues;
}
