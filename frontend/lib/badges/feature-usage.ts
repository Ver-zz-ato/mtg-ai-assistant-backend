import { getAdmin } from "@/app/api/_lib/supa";

export type FeatureUsageKey =
  | "build_around_card"
  | "commander_picker"
  | "idea_to_deck"
  | "price_tracker_lookup";

export async function recordUserFeatureUsage(params: {
  userId: string | null | undefined;
  featureKey: FeatureUsageKey;
  source: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const userId = params.userId?.trim();
  if (!userId) return;

  const admin = getAdmin();
  if (!admin) return;

  const { error } = await admin.from("user_feature_usage").insert({
    user_id: userId,
    feature_key: params.featureKey,
    source: params.source,
    metadata: params.metadata ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }
}
