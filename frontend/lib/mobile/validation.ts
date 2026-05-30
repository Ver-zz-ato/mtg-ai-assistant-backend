import { z } from "zod";

const limitNumber = z.number().int();

export const tierLimitFieldKeys = [
  "chatPerDay",
  "deckAnalysisPerDay",
  "roastPerDay",
  "voicePerDay",
  "mulliganAdvicePerDay",
  "cardExplainPerDay",
  "deckComparePerDay",
  "generateFromCollectionPerDay",
  "generateConstructedPerDay",
] as const;

export type TierLimitFieldKey = (typeof tierLimitFieldKeys)[number];

const tierLimitBucketShape = {
  chatPerDay: limitNumber,
  deckAnalysisPerDay: limitNumber,
  roastPerDay: limitNumber,
  voicePerDay: limitNumber,
  mulliganAdvicePerDay: limitNumber,
  cardExplainPerDay: limitNumber,
  deckComparePerDay: limitNumber,
  generateFromCollectionPerDay: limitNumber,
  generateConstructedPerDay: limitNumber,
};

export const tierLimitBucketSchema = z.object(tierLimitBucketShape);
export const tierLimitBucketOverrideSchema = z.object(tierLimitBucketShape).partial();

export const tierLimitsSchema = z.object({
  guest: tierLimitBucketSchema,
  free: tierLimitBucketSchema,
  pro: tierLimitBucketSchema,
});

export const tierLimitOverridesSchema = z.object({
  guest: tierLimitBucketOverrideSchema.optional(),
  free: tierLimitBucketOverrideSchema.optional(),
  pro: tierLimitBucketOverrideSchema.optional(),
});

export type TierLimits = z.infer<typeof tierLimitsSchema>;
export type TierLimitBucket = z.infer<typeof tierLimitBucketSchema>;
export type TierLimitsOverride = z.infer<typeof tierLimitOverridesSchema>;

export function parseJsonObject(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    const v = JSON.parse(raw) as unknown;
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      return { ok: false, error: "JSON must be an object" };
    }
    return { ok: true, value: v };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}

export function parseTierLimitsJson(raw: string): { ok: true; value: TierLimitsOverride } | { ok: false; error: string } {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) return parsed;
  const r = tierLimitOverridesSchema.safeParse(parsed.value);
  if (!r.success) return { ok: false, error: r.error.flatten().formErrors.join("; ") || "Validation failed" };
  return { ok: true, value: r.data };
}

export const featureFlagPlatformSchema = z.enum(["all", "mobile", "ios", "android", "web"]);
export const remoteConfigPlatformSchema = z.enum(["all", "mobile", "ios", "android", "web"]);
