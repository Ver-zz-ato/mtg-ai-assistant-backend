import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { buildCommanderRecommendations, type CommanderRecommendationRequest } from "@/lib/recommendations/commander-recommender";
import { captureServer } from "@/lib/server/analytics";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as CommanderRecommendationRequest;
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const results = await buildCommanderRecommendations(admin, body);
    void captureServer("mobile_commander_recommendations_served", {
      format: body.format ?? "Commander",
      profileLabel: body.profileLabel ?? null,
      resultCount: results.length,
      budget: body.budget ?? null,
      powerLevel: body.powerLevel ?? null,
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, recommendations: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "commander_recommendations_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
