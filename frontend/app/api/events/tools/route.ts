// app/api/events/tools/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MULLIGAN_FREE, MULLIGAN_GUEST, MULLIGAN_PRO, PROBABILITY_FREE, PROBABILITY_PRO } from "@/lib/feature-limits";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user;

    const body = await req.json().catch(() => ({}));
    const type = String(body?.type || "");
    const iters = Number(body?.iters || 0);

    if (!user && type !== "mull_run") {
      return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
    }

    if (type === "mull_run" || type === "prob_run") {
      const { cookies } = await import("next/headers");
      const { checkDurableRateLimit } = await import("@/lib/api/durable-rate-limit");
      const { hashGuestToken, hashString } = await import("@/lib/guest-tracking");
      const route = type === "mull_run" ? "/api/events/tools-mulligan" : "/api/events/tools-probability";

      let isPro = false;
      let dailyCap = type === "mull_run" ? MULLIGAN_FREE : PROBABILITY_FREE;
      let keyHash = "";
      let identity: "guest" | "anonymous" | "free" | "pro" = "free";
      let verifiedUserId: string | null = null;

      if (user) {
        const { checkProStatus } = await import("@/lib/server-pro-check");
        isPro = await checkProStatus(user.id);
        dailyCap = type === "mull_run"
          ? (isPro ? MULLIGAN_PRO : MULLIGAN_FREE)
          : (isPro ? PROBABILITY_PRO : PROBABILITY_FREE);
        keyHash = `user:${await hashString(user.id)}`;
        identity = isPro ? "pro" : "free";
        verifiedUserId = isPro ? user.id : null;
      } else {
        dailyCap = MULLIGAN_GUEST;
        const cookieStore = await cookies();
        const guestToken = cookieStore.get("guest_session_token")?.value;
        if (guestToken) {
          keyHash = `guest:${await hashGuestToken(guestToken)}`;
          identity = "guest";
        } else {
          const ip =
            (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() ||
            req.headers.get("x-real-ip") ||
            "unknown";
          keyHash = `ip:${await hashString(ip)}`;
          identity = "anonymous";
        }
      }

      if (!(user && isPro)) {
        const rateLimit = await checkDurableRateLimit(supabase, keyHash, route, dailyCap, 1, {
          identity,
          verifiedUserId,
        });
        if (!rateLimit.allowed) {
          const errMsg = type === "mull_run"
            ? !user
              ? `You've used your ${MULLIGAN_GUEST} free Mulligan runs today. Sign in for more!`
              : `You've used your ${MULLIGAN_FREE} free Mulligan runs today. Upgrade to Pro for more!`
            : `You've used your ${PROBABILITY_FREE} free Probability runs today. Upgrade to Pro for more!`;
          return NextResponse.json(
            { ok: false, code: "RATE_LIMIT_DAILY", proUpsell: !isPro, error: errMsg, resetAt: rateLimit.resetAt },
            { status: 429 }
          );
        }
      }

      if (type === "mull_run" && !user) {
        return NextResponse.json({ ok: true });
      }
    }

    if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

    const md: any = user.user_metadata || {};
    md.tools = md.tools || {};
    if (type === "prob_run") md.tools.prob_runs = (md.tools.prob_runs || 0) + 1;
    if (type === "prob_save") md.tools.prob_saves = (md.tools.prob_saves || 0) + 1;
    if (type === "mull_run") md.tools.mull_iters_total = (md.tools.mull_iters_total || 0) + Math.max(0, Math.floor(iters || 0));
    if (type === "card_attach") md.tools.card_attach_count = (md.tools.card_attach_count || 0) + 1;
    if (type === "card_art_view") md.tools.card_art_views = (md.tools.card_art_views || 0) + 1;

    const { error } = await supabase.auth.updateUser({ data: md });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}
