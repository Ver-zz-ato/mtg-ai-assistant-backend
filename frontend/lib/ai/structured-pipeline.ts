import { callLLM } from "@/lib/ai/unified-llm-client";
import { formatTierCapabilityPrompt, resolveManaTapTier, type ManaTapTier } from "@/lib/ai/tier-policy";
import { getRecommendationTierConfig } from "@/lib/recommendations/recommendation-tier";
import type { DeckContextSummary } from "@/lib/deck/deck-context-summary";

export type AiPipelineTier = ManaTapTier;

export type AiRouteExecutionContext = {
  userId: string | null;
  isGuest: boolean;
  isPro: boolean;
  tier: AiPipelineTier;
  model: string;
  fallbackModel: string;
  candidateLimit: number;
  judgePasses: 1 | 2;
  useCriticPass: boolean;
  shortReasons: boolean;
  latencyBudgetMs: number;
  source: string | null;
  sourcePage: string | null;
  featureKey: string;
  rateLimitKey: string;
};

export type GroundingPacket = {
  title: string;
  lines: string[];
};

export type JudgeCandidate = {
  name: string;
  summary: string;
};

export type JudgeResult<T> = {
  value: T;
  model: string;
  usedAi: boolean;
  fallbackUsed: boolean;
};

export type CriticResult<T> = {
  value: T;
  changed: boolean;
};

type PassSpec<T> = {
  enabled?: boolean;
  passName: string;
  buildMessages: (current: T) => Array<{ role: "system" | "user"; content: string }>;
  parse: (text: string, current: T) => T;
  timeoutMs?: number;
  maxTokens?: number;
  jsonResponse?: boolean;
};

function compactList(values: Array<string | null | undefined>, limit = 4): string {
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, limit).join(", ");
}

export function resolveAiPipelineTier(input: {
  userId?: string | null;
  isGuest?: boolean | null;
  isPro?: boolean | null;
}): AiPipelineTier {
  return resolveManaTapTier(input);
}

export function buildAiRouteExecutionContext(input: {
  userId?: string | null;
  isGuest?: boolean | null;
  isPro?: boolean | null;
  source?: string | null;
  sourcePage?: string | null;
  featureKey: string;
  rateLimitKey: string;
}): AiRouteExecutionContext {
  const tier = resolveAiPipelineTier(input);
  const tierConfig = getRecommendationTierConfig(tier);
  return {
    userId: input.userId ?? null,
    isGuest: !!input.isGuest || !input.userId,
    isPro: !!input.isPro,
    tier,
    model: tierConfig.model,
    fallbackModel: tierConfig.fallbackModel,
    candidateLimit: tierConfig.candidateLimit,
    judgePasses: tierConfig.judgePasses,
    useCriticPass: tierConfig.useCriticPass,
    shortReasons: tierConfig.shortReasons,
    latencyBudgetMs: tierConfig.latencyBudgetMs,
    source: input.source ?? null,
    sourcePage: input.sourcePage ?? null,
    featureKey: input.featureKey,
    rateLimitKey: input.rateLimitKey,
  };
}

export function buildCompactGroundingPacket(input: {
  title: string;
  format?: string | null;
  commander?: string | null;
  summary?: DeckContextSummary | null;
  lines?: Array<string | null | undefined>;
  extraSections?: GroundingPacket[];
}): string {
  const lines: string[] = [];
  if (input.format) lines.push(`Format: ${input.format}`);
  if (input.commander) lines.push(`Commander: ${input.commander}`);
  if (input.summary) {
    lines.push(
      `Deck summary: lands ${input.summary.land_count}, ramp ${input.summary.ramp}, draw ${input.summary.draw}, removal ${input.summary.removal}, wincons ${input.summary.wincons}.`,
    );
    if (input.summary.archetype_tags?.length) {
      lines.push(`Archetypes: ${compactList(input.summary.archetype_tags, 3)}.`);
    }
    if (input.summary.warning_flags?.length) {
      lines.push(`Warnings: ${compactList(input.summary.warning_flags, 4)}.`);
    }
    if (input.summary.deck_facts?.archetype_candidates?.length) {
      lines.push(
        `Archetype confidence: ${input.summary.deck_facts.archetype_candidates
          .slice(0, 3)
          .map((entry) => `${entry.name} ${Math.round(entry.score * 100)}%`)
          .join(", ")}.`,
      );
    }
  }
  for (const line of input.lines ?? []) {
    if (typeof line === "string" && line.trim()) lines.push(line.trim());
  }
  const sections = [input.title, ...lines].join("\n- ");
  const extras = (input.extraSections ?? [])
    .map((section) => {
      const body = section.lines.filter(Boolean).map((line) => `- ${line}`).join("\n");
      return body ? `${section.title}\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return [sections ? `${input.title}\n- ${lines.join("\n- ")}` : "", extras].filter(Boolean).join("\n\n");
}

async function runPass<T>(
  context: AiRouteExecutionContext,
  routePath: string,
  current: T,
  spec: PassSpec<T>,
): Promise<{ next: T; usedAi: boolean }> {
  const messages = spec.buildMessages(current);
  const response = await callLLM(messages, {
    route: `${routePath}/${spec.passName}`,
    feature: context.featureKey,
    model: context.model,
    fallbackModel: context.fallbackModel,
    timeout: Math.min(spec.timeoutMs ?? context.latencyBudgetMs, context.latencyBudgetMs),
    maxTokens: spec.maxTokens ?? 1000,
    apiType: "chat",
    userId: context.userId,
    isPro: context.isPro,
    user_tier: context.tier,
    source: context.source,
    source_page: context.sourcePage,
    jsonResponse: spec.jsonResponse ?? true,
    skipRecordAiUsage: true,
  });
  return {
    next: spec.parse(response.text || "", current),
    usedAi: true,
  };
}

export async function runStructuredAiFlow<T>(args: {
  context: AiRouteExecutionContext;
  routePath: string;
  deterministic: T;
  judge?: PassSpec<T>;
  writer?: PassSpec<T>;
  critic?: PassSpec<T>;
}): Promise<JudgeResult<T>> {
  let current = args.deterministic;
  let usedAi = false;
  try {
    if (args.judge?.enabled !== false) {
      const judge = await runPass(args.context, args.routePath, current, args.judge!);
      current = judge.next;
      usedAi = usedAi || judge.usedAi;
    }
    if (args.context.judgePasses >= 2 && args.writer?.enabled !== false) {
      const writer = await runPass(args.context, args.routePath, current, args.writer!);
      current = writer.next;
      usedAi = usedAi || writer.usedAi;
    }
    if (args.context.useCriticPass && args.critic?.enabled !== false) {
      const critic = await runPass(args.context, args.routePath, current, args.critic!);
      current = critic.next;
      usedAi = usedAi || critic.usedAi;
    }
    return {
      value: current,
      model: args.context.model,
      usedAi,
      fallbackUsed: false,
    };
  } catch {
    return {
      value: args.deterministic,
      model: args.context.model,
      usedAi,
      fallbackUsed: true,
    };
  }
}

export function buildTierCapabilityBlock(context: AiRouteExecutionContext): string {
  return formatTierCapabilityPrompt({
    tier: context.tier,
    persistMemory: false,
    deckMutations: true,
    maxToolResults: 0,
    maxProtectedCards: context.tier === "pro" ? 18 : context.tier === "free" ? 10 : 6,
    maxCombos: context.tier === "pro" ? 6 : context.tier === "free" ? 3 : 1,
    includeCollectionFit: context.tier === "pro" ? "full" : context.tier === "free" ? "basic" : "none",
    includePowerProfile: context.tier !== "guest",
    includeDurableMemories: false,
    includeRulesGrounding: context.tier === "pro" ? "full" : "basic",
    includePriceHistory: false,
    includeProbability: false,
    recommendationStrictness: context.tier === "pro" ? "strict" : context.tier === "free" ? "guarded" : "basic",
  });
}
