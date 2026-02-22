// lib/playstyle/depth.ts
// Tiered depth configuration for playstyle quiz results

import { ModelTier } from '@/hooks/useProStatus';

export type PlaystyleDepth = {
  plan: ModelTier;
  commanderCount: number;           // guest 3, free 6, pro 12
  showAiExplanation: boolean;       // guest false, free true, pro true
  aiExplanationLevel: 'none' | 'short' | 'full';
  showAvoidList: boolean;
  avoidCount: number;               // guest 1, free 3, pro 3
  showArchetypeWhy: boolean;        // guest false, free true, pro true
  showBlueprint: boolean;           // pro only
  allowDeckBuild: 'sample' | 'limited' | 'full';
  dailyDeckBuildLimit?: number;     // free: 1, pro: unlimited
};

/**
 * Resolve the depth of playstyle features based on user tier.
 * This determines what content is shown/hidden in the results modal.
 */
export function resolvePlaystyleDepth(tier: ModelTier): PlaystyleDepth {
  switch (tier) {
    case 'guest':
      return {
        plan: 'guest',
        commanderCount: 3,
        showAiExplanation: false,
        aiExplanationLevel: 'none',
        showAvoidList: true,
        avoidCount: 1,
        showArchetypeWhy: false,
        showBlueprint: false,
        allowDeckBuild: 'sample',
        dailyDeckBuildLimit: 0,
      };
    case 'free':
      return {
        plan: 'free',
        commanderCount: 6,
        showAiExplanation: true,
        aiExplanationLevel: 'short',
        showAvoidList: true,
        avoidCount: 3,
        showArchetypeWhy: true,
        showBlueprint: false,
        allowDeckBuild: 'limited',
        dailyDeckBuildLimit: 1,
      };
    case 'pro':
      return {
        plan: 'pro',
        commanderCount: 12,
        showAiExplanation: true,
        aiExplanationLevel: 'full',
        showAvoidList: true,
        avoidCount: 3,
        showArchetypeWhy: true,
        showBlueprint: true,
        allowDeckBuild: 'full',
        dailyDeckBuildLimit: undefined, // unlimited
      };
  }
}

/**
 * Get the upgrade prompt message based on current tier.
 */
export function getUpgradePrompt(tier: ModelTier, feature: string): { message: string; cta: string; action: 'login' | 'upgrade' } | null {
  if (tier === 'guest') {
    return {
      message: `Sign in to unlock ${feature}`,
      cta: 'Create free account',
      action: 'login',
    };
  }
  if (tier === 'free') {
    return {
      message: `Go Pro to unlock ${feature}`,
      cta: 'Upgrade to Pro',
      action: 'upgrade',
    };
  }
  return null;
}
