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

  // Pattern 1: "X lands" or "X ramp pieces"
  for (const keyword of keywords) {
    const patterns = [
      new RegExp(`(\\d+)\\s+${keyword}`, 'gi'),
      new RegExp(`${keyword}.*?(\\d+)`, 'gi'),
      new RegExp(`(\\d+)[\\s-–]+(?:to|–|-)[\\s-–]+(\\d+)\\s+${keyword}`, 'gi'), // Ranges
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
          if (val > 0 && val < 100) {
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

  // Check land count (most important)
  const landValues = extractNumericRecommendations(text, 'lands');
  for (const value of landValues) {
    const result = validateHeuristic('lands', value, format, archetype);
    if (result.severity === 'critical' || (result.severity === 'warning' && format === 'Modern' && archetype === 'midrange' && value < 23)) {
      issues.push({
        category: 'lands',
        value,
        severity: result.severity,
        message: result.message,
      });
    }
  }

  // Check ramp count (for Commander)
  if (format === 'Commander') {
    const rampValues = extractNumericRecommendations(text, 'ramp');
    for (const value of rampValues) {
      const result = validateHeuristic('ramp', value, format);
      if (result.severity === 'critical') {
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
