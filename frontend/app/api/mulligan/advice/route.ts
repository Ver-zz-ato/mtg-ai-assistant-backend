import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/server-supabase";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import { checkProStatus } from "@/lib/server-pro-check";
import { hashString, hashGuestToken } from "@/lib/guest-tracking";
import {
  MULLIGAN_ADVICE_GUEST,
  MULLIGAN_ADVICE_FREE,
  MULLIGAN_ADVICE_PRO,
} from "@/lib/feature-limits";
import { runMulliganAdvice } from "@/lib/mulligan/advice-handler";

export const runtime = "nodejs";

const AdviceSchema = z.object({
  modelTier: z.enum(["mini", "full"]).optional(),
  format: z.literal("commander").optional(),
  playDraw: z.enum(["play", "draw"]),
  mulliganCount: z.number().min(0).max(7),
  hand: z.array(z.string()).min(1).max(7),
  deck: z.object({
    cards: z.array(z.object({ name: z.string(), count: z.number() })),
    commander: z.string().nullable().optional(),
  }),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = AdviceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let keyHash: string;
  let effectiveTier: "guest" | "free" | "pro";
  let limit: number;

  if (user) {
    const isPro = await checkProStatus(user.id);
    effectiveTier = isPro ? "pro" : "free";
    limit = isPro ? MULLIGAN_ADVICE_PRO : MULLIGAN_ADVICE_FREE;
    keyHash = `user:${await hashString(user.id)}`;
  } else {
    effectiveTier = "guest";
    limit = MULLIGAN_ADVICE_GUEST;
    const guestToken = cookieStore.get("guest_session_token")?.value;
    keyHash = guestToken
      ? `guest:${await hashGuestToken(guestToken)}`
      : `ip:${await hashString((req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown")}`;
  }

  const rateLimit = await checkDurableRateLimit(
    supabase,
    keyHash,
    "/api/mulligan/advice",
    limit,
    1
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMIT_DAILY",
        proUpsell: effectiveTier !== "pro",
        error:
          effectiveTier === "guest"
            ? `You've used your ${limit} free AI advice runs today. Sign in for more!`
            : effectiveTier === "free"
              ? `You've used your ${limit} free runs today. Upgrade to Pro for more!`
              : "You've reached your daily limit.",
        resetAt: rateLimit.resetAt,
      },
      { status: 429 }
    );
  }

  const modelTier = effectiveTier === "pro" ? (parsed.data.modelTier ?? "mini") : "mini";
  const input = {
    ...parsed.data,
    modelTier: modelTier as "mini" | "full",
    format: "commander" as const,
  };

  const result = await runMulliganAdvice(input, {
    userId: user?.id ?? null,
    source: "production_widget",
    effectiveTier,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
