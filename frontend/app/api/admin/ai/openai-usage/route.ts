/**
 * Fetches live usage and spend from OpenAI's org Usage + Costs APIs.
 * Requires OPENAI_ADMIN_API_KEY.
 * Optional filters: OPENAI_USAGE_PROJECT_IDS and OPENAI_USAGE_API_KEY_IDS,
 * or query params project_id / api_key_id for admin inspection.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { fetchOpenAiOrgSpendSnapshot, getMonthStartUtcEpoch } from "@/lib/ai/openai-org-usage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const days = Math.min(90, Math.max(1, parseInt(sp.get("days") || "7", 10) || 7));
    const projectIds = sp.getAll("project_id");
    const apiKeyIds = sp.getAll("api_key_id");
    const endTime = Math.floor(Date.now() / 1000);

    const [rangeSnapshot, monthToDateSnapshot] = await Promise.all([
      fetchOpenAiOrgSpendSnapshot({ days, endTime, projectIds, apiKeyIds }),
      fetchOpenAiOrgSpendSnapshot({ startTime: getMonthStartUtcEpoch(), endTime, projectIds, apiKeyIds }),
    ]);

    return NextResponse.json({
      ok: true,
      ...rangeSnapshot,
      days,
      month_to_date: {
        start_date: new Date(getMonthStartUtcEpoch() * 1000).toISOString().slice(0, 10),
        cost_usd: monthToDateSnapshot.totals.cost_usd,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
