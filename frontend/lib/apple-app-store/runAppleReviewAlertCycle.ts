import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLatestCustomerReviews } from "@/lib/apple-app-store/fetchCustomerReviews";
import { getAppStoreConnectJwtFromEnv } from "@/lib/apple-app-store/createAppStoreConnectJwt";
import { notifyAppStoreReviewDiscord } from "@/lib/apple-app-store/notifyAppStoreReviewDiscord";

export type AppleReviewAlertCycleOptions = {
  dryRun?: boolean;
  /** When the dedupe table is empty, seed rows without Discord (avoids spamming history). */
  bootstrapIfEmpty?: boolean;
  forceNotify?: boolean;
};

export type AppleReviewAlertCycleResult = {
  ok: true;
  checked: number;
  newReviews: number;
  dryRun?: boolean;
  bootstrapped?: number;
  skippedBootstrapNotify?: boolean;
};

function parseCreatedDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function runAppleReviewAlertCycle(
  admin: SupabaseClient,
  options: AppleReviewAlertCycleOptions = {},
): Promise<AppleReviewAlertCycleResult> {
  const dryRun = options.dryRun === true;
  const bootstrapIfEmpty = options.bootstrapIfEmpty !== false;
  const forceNotify = options.forceNotify === true;

  const appId = process.env.APPLE_ASC_APP_ID?.trim();
  if (!appId) {
    throw new Error("apple_asc_app_id_missing");
  }

  const jwt = getAppStoreConnectJwtFromEnv();
  const reviews = await fetchLatestCustomerReviews({ appId, jwt, limit: 20 });

  console.info(
    JSON.stringify({
      tag: "apple_reviews_fetched",
      count: reviews.length,
      dryRun,
      timestamp: new Date().toISOString(),
    }),
  );

  if (reviews.length === 0) {
    return { ok: true, checked: 0, newReviews: 0, dryRun: dryRun || undefined };
  }

  const reviewIds = reviews.map((r) => r.id);
  const { data: existingRows, error: existingError } = await admin
    .from("app_store_review_notifications")
    .select("review_id")
    .in("review_id", reviewIds);

  if (existingError) {
    throw new Error(`app_store_review_notifications_lookup_failed:${existingError.message}`);
  }

  const existingIds = new Set((existingRows || []).map((row) => String(row.review_id)));
  const unseen = reviews.filter((review) => !existingIds.has(review.id));

  const { count: totalStored, error: countError } = await admin
    .from("app_store_review_notifications")
    .select("id", { count: "exact", head: true });

  if (countError) {
    throw new Error(`app_store_review_notifications_count_failed:${countError.message}`);
  }

  const tableEmpty = (totalStored ?? 0) === 0;
  const shouldBootstrap = bootstrapIfEmpty && tableEmpty && !forceNotify && unseen.length > 0;

  if (shouldBootstrap) {
    console.info(
      JSON.stringify({
        tag: "apple_reviews_bootstrap",
        seedCount: unseen.length,
        message: "Dedupe table empty; seeding without Discord to avoid historical spam",
        timestamp: new Date().toISOString(),
      }),
    );
  }

  let newReviews = 0;
  let bootstrapped = 0;

  for (const review of unseen) {
    const row = {
      review_id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      reviewer_nickname: review.reviewerNickname,
      territory: review.territory,
      created_date: parseCreatedDate(review.createdDate),
      raw: review.raw,
    };

    if (dryRun) {
      console.info(
        JSON.stringify({
          tag: "apple_reviews_dry_run_would_notify",
          reviewId: review.id,
          rating: review.rating,
          territory: review.territory,
        }),
      );
      newReviews += 1;
      continue;
    }

    if (shouldBootstrap) {
      const { error: insertError } = await admin.from("app_store_review_notifications").insert(row);
      if (insertError) {
        if (insertError.code === "23505") continue;
        throw new Error(`app_store_review_notifications_insert_failed:${insertError.message}`);
      }
      bootstrapped += 1;
      continue;
    }

    const { error: insertError } = await admin.from("app_store_review_notifications").insert(row);
    if (insertError) {
      if (insertError.code === "23505") continue;
      throw new Error(`app_store_review_notifications_insert_failed:${insertError.message}`);
    }

    const discord = await notifyAppStoreReviewDiscord(review);
    if (!discord.sent) {
      console.warn(
        JSON.stringify({
          tag: "apple_reviews_discord_failed",
          reviewId: review.id,
          reason: discord.reason,
          timestamp: new Date().toISOString(),
        }),
      );
    } else {
      console.info(
        JSON.stringify({
          tag: "apple_reviews_discord_sent",
          reviewId: review.id,
          rating: review.rating,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    newReviews += 1;
  }

  return {
    ok: true,
    checked: reviews.length,
    newReviews: dryRun ? newReviews : shouldBootstrap ? 0 : newReviews,
    dryRun: dryRun || undefined,
    bootstrapped: bootstrapped || undefined,
    skippedBootstrapNotify: shouldBootstrap || undefined,
  };
}
