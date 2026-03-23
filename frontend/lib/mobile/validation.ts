import { z } from "zod";

const limitNumber = z.number().int();

export const tierLimitsSchema = z.object({
  guest: z.object({
    chatPerDay: limitNumber,
    deckAnalysisPerDay: limitNumber,
    roastPerDay: limitNumber,
  }),
  free: z.object({
    chatPerDay: limitNumber,
    deckAnalysisPerDay: limitNumber,
    roastPerDay: limitNumber,
  }),
  pro: z.object({
    chatPerDay: limitNumber,
    deckAnalysisPerDay: limitNumber,
    roastPerDay: limitNumber,
  }),
});

export type TierLimits = z.infer<typeof tierLimitsSchema>;

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

export function parseTierLimitsJson(raw: string): { ok: true; value: TierLimits } | { ok: false; error: string } {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) return parsed;
  const r = tierLimitsSchema.safeParse(parsed.value);
  if (!r.success) return { ok: false, error: r.error.flatten().formErrors.join("; ") || "Validation failed" };
  return { ok: true, value: r.data };
}

export const featureFlagPlatformSchema = z.enum(["all", "mobile", "ios", "android", "web"]);
export const remoteConfigPlatformSchema = z.enum(["all", "mobile", "ios", "android", "web"]);
