/**
 * Auth, tier, and durable rate limits for scanner AI routes.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { getGuestToken } from "@/lib/api/get-guest-token";
import { hashGuestToken, hashString } from "@/lib/guest-tracking";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import type { User } from "@supabase/supabase-js";

export type ScanAiUserTier = "guest" | "free" | "pro";

export type ScanAiRouteAuth = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User | null;
  realUserId: string | null;
  userTier: ScanAiUserTier;
  isPro: boolean;
  keyHash: string;
  dailyLimit: number;
  rateLimit: Awaited<ReturnType<typeof checkDurableRateLimit>>;
};

function isSupabaseAnonymousUser(user: unknown): boolean {
  return Boolean((user as { is_anonymous?: unknown } | null)?.is_anonymous === true);
}

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0]?.trim() || "unknown" : req.headers.get("x-real-ip") || "unknown";
}

export async function resolveScanAiRouteAuth(
  req: NextRequest,
  routePath: string,
  limits: { guest: number; free: number; pro: number }
): Promise<ScanAiRouteAuth | NextResponse> {
  const { supabase, user } = await getUserAndSupabase(req);
  const isAnonymousUser = isSupabaseAnonymousUser(user);
  const realUserId = user && !isAnonymousUser ? user.id : null;
  let isPro = false;
  if (realUserId) {
    const { checkProStatus } = await import("@/lib/server-pro-check");
    isPro = await checkProStatus(realUserId);
  }
  const userTier: ScanAiUserTier = realUserId ? (isPro ? "pro" : "free") : "guest";
  const dailyLimit = userTier === "pro" ? limits.pro : userTier === "free" ? limits.free : limits.guest;

  const { guestToken } = await getGuestToken(req);
  const ip = getIp(req);
  const keyHash = realUserId
    ? `user:${await hashString(realUserId)}`
    : guestToken
      ? `guest:${await hashGuestToken(guestToken)}`
      : isAnonymousUser && user?.id
        ? `guest:${await hashString(`anonymous-user:${user.id}`)}`
        : `ip:${await hashString(ip)}`;

  // Pro: no per-route daily cap (global AI budget check still applies below).
  const rateLimit =
    userTier === "pro" && realUserId
      ? { allowed: true as const, remaining: -1, limit: -1, count: 0 }
      : await checkDurableRateLimit(supabase, keyHash, routePath, dailyLimit, 1, {
          identity: userTier,
          verifiedUserId: null,
        });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMIT_DAILY",
        error: "Daily scanner AI limit reached. Try again tomorrow.",
        tier: userTier,
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt ?? null,
        requiresAuth: userTier === "guest",
      },
      { status: 429 }
    );
  }

  const { allowAIRequest } = await import("@/lib/server/budgetEnforcement");
  const budgetCheck = await allowAIRequest(supabase);
  if (!budgetCheck.allow) {
    return NextResponse.json(
      {
        ok: false,
        code: "BUDGET_LIMIT",
        error: budgetCheck.reason || "Server AI budget limit reached. Try again later.",
        tier: userTier,
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt ?? null,
        requiresAuth: userTier === "guest",
      },
      { status: 429 }
    );
  }

  return {
    supabase,
    user,
    realUserId,
    userTier,
    isPro,
    keyHash,
    dailyLimit,
    rateLimit,
  };
}

export function scanAiRateLimitMeta(auth: ScanAiRouteAuth) {
  if (auth.userTier === "pro" && auth.rateLimit.limit < 0) {
    return { tier: auth.userTier, limit: null, remaining: null, resetAt: null };
  }
  return {
    tier: auth.userTier,
    limit: auth.rateLimit.limit,
    remaining: auth.rateLimit.remaining,
    resetAt: auth.rateLimit.resetAt ?? null,
  };
}
