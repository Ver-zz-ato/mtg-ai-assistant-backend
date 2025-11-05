// Prompt version configuration for A/B testing
// Store active version in environment variable or database config

export const PROMPT_VERSIONS = {
  'deck-ai-v4': {
    name: 'deck-ai-v4',
    description: 'Current stable version with co-pilot behaviors and meta humility',
    changelog: [
      'v1: base inference',
      'v2: legality + budget',
      'v3: redundancy + tutor classification',
      'v4: co-pilot behaviors + meta humility'
    ]
  },
  // Future versions can be added here for A/B testing
  // 'deck-ai-v5': {
  //   name: 'deck-ai-v5',
  //   description: 'Experimental version with enhanced synergy detection',
  //   changelog: ['v5: enhanced synergy detection']
  // }
} as const;

export type PromptVersion = keyof typeof PROMPT_VERSIONS;

/**
 * Get the active prompt version from environment variable or default to v4
 */
export function getActivePromptVersion(): PromptVersion {
  const envVersion = process.env.ACTIVE_PROMPT_VERSION as PromptVersion;
  if (envVersion && envVersion in PROMPT_VERSIONS) {
    return envVersion;
  }
  return 'deck-ai-v4'; // Default to current stable version
}

/**
 * Get prompt version info
 */
export function getPromptVersionInfo(version: PromptVersion) {
  return PROMPT_VERSIONS[version];
}

