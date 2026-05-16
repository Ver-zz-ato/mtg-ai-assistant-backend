import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { buildCommanderRecommendations, type CommanderRecommendationRequest } from "@/lib/recommendations/commander-recommender";
import { captureServer } from "@/lib/server/analytics";
import { createClient } from "@/lib/server-supabase";
import { checkProStatus } from "@/lib/server-pro-check";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as CommanderRecommendationRequest;
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    let supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }
    const isPro = user ? await checkProStatus(user.id) : false;
    const results = await buildCommanderRecommendations(admin, body, {
      userId: user?.id ?? null,
      isPro,
      isGuest: !user,
    });
    void captureServer("mobile_commander_recommendations_served", {
      format: body.format ?? "Commander",
      profileLabel: body.profileLabel ?? null,
      resultCount: results.length,
      budget: body.budget ?? null,
      powerLevel: body.powerLevel ?? null,
      user_tier: !user ? "guest" : isPro ? "pro" : "free",
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, recommendations: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "commander_recommendations_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
