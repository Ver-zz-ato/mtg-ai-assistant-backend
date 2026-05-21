import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkDurableRateLimit, type DurableRateLimitIdentity } from "@/lib/api/durable-rate-limit";
import { getGuestToken } from "@/lib/api/get-guest-token";
import { hashGuestToken, hashString } from "@/lib/guest-tracking";

export type RouteGuardTier = "guest" | "free" | "pro";

export interface RouteGuardIdentity {
  keyHash: string;
  identity: DurableRateLimitIdentity;
  tier: RouteGuardTier;
  userId: string | null;
}

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function buildRateLimitIdentity(
  req: NextRequest,
  user: { id?: string | null; is_anonymous?: boolean | null } | null | undefined,
  isPro: boolean,
): Promise<RouteGuardIdentity> {
  const userId = user?.id ?? null;
  const isAnonymousUser = user?.is_anonymous === true;
  const realUserId = userId && !isAnonymousUser ? userId : null;

  if (realUserId) {
    return {
      keyHash: `user:${await hashString(realUserId)}`,
      identity: isPro ? "pro" : "free",
      tier: isPro ? "pro" : "free",
      userId: realUserId,
    };
  }

  const { guestToken } = await getGuestToken(req);
  if (guestToken) {
    return {
      keyHash: `guest:${await hashGuestToken(guestToken)}`,
      identity: "guest",
      tier: "guest",
      userId: null,
    };
  }

  if (isAnonymousUser && userId) {
    return {
      keyHash: `guest:${await hashString(`anonymous-user:${userId}`)}`,
      identity: "guest",
      tier: "guest",
      userId: null,
    };
  }

  return {
    keyHash: `ip:${await hashString(getClientIp(req))}`,
    identity: "anonymous",
    tier: "guest",
    userId: null,
  };
}

export async function enforceDailyDurableRateLimit(args: {
  req: NextRequest;
  supabase: SupabaseClient;
  routePath: string;
  user: { id?: string | null; is_anonymous?: boolean | null } | null | undefined;
  isPro: boolean;
  limits: { guest: number; free: number; pro: number };
  error?: string;
}): Promise<
  | { allowed: true; tier: RouteGuardTier; limit: number; remaining: number; resetAt: string | null }
  | { allowed: false; response: NextResponse; tier: RouteGuardTier }
> {
  const identity = await buildRateLimitIdentity(args.req, args.user, args.isPro);
  const dailyLimit =
    identity.tier === "pro" ? args.limits.pro : identity.tier === "free" ? args.limits.free : args.limits.guest;

  const rateLimit = await checkDurableRateLimit(
    args.supabase,
    identity.keyHash,
    args.routePath,
    dailyLimit,
    1,
    {
      identity: identity.identity,
      verifiedUserId: identity.identity === "pro" ? identity.userId : null,
    },
  );

  if (!rateLimit.allowed) {
    return {
      allowed: false,
      tier: identity.tier,
      response: NextResponse.json(
        {
          ok: false,
          code: "RATE_LIMIT_DAILY",
          error: args.error ?? "Daily limit reached. Try again tomorrow.",
          tier: identity.tier,
          limit: rateLimit.limit,
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt ?? null,
          requiresAuth: identity.tier === "guest",
        },
        { status: 429 },
      ),
    };
  }

  return {
    allowed: true,
    tier: identity.tier,
    limit: rateLimit.limit,
    remaining: rateLimit.remaining,
    resetAt: rateLimit.resetAt ?? null,
  };
}

