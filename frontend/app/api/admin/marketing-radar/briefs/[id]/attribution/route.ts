import { NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { buildCampaignSlug } from "@/lib/marketing/marketingUtm";
import { requireAdminForApi } from "@/lib/server-admin";
import { getPosthogQueryCredentials, posthogHogql } from "@/lib/server/posthog-hogql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function countFromHogql(results: unknown[][]): number {
  const n = results[0]?.[0];
  return typeof n === "number" ? n : Number(n) || 0;
}

function escapeHogqlLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const { data: brief, error: briefErr } = await admin
      .from("marketing_briefs")
      .select("id, brief_date")
      .eq("id", id)
      .maybeSingle();

    if (briefErr) return NextResponse.json({ ok: false, error: briefErr.message }, { status: 500 });
    if (!brief) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const credentials = getPosthogQueryCredentials();
    if (!credentials) {
      return NextResponse.json({
        ok: true,
        configured: false,
        signups: null,
        pro_upgrades: null,
        posthog_url: null,
      });
    }

    const campaign = buildCampaignSlug(brief.brief_date);
    const campaignNeedle = escapeHogqlLike(`utm_campaign=${campaign}`);
    const intervalClause = "now() - INTERVAL 14 DAY";

    const signupQuery = `
      SELECT count() AS c
      FROM events
      WHERE event = 'signup_completed'
        AND timestamp >= ${intervalClause}
        AND (
          positionCaseInsensitive(toString(properties.$current_url), '${campaignNeedle}') > 0
          OR positionCaseInsensitive(toString(properties.current_utm_campaign), '${escapeHogqlLike(campaign)}') > 0
        )
    `;

    const proQuery = `
      SELECT count() AS c
      FROM events
      WHERE event = 'pro_upgrade_completed'
        AND timestamp >= ${intervalClause}
        AND (
          positionCaseInsensitive(toString(properties.$current_url), '${campaignNeedle}') > 0
          OR positionCaseInsensitive(toString(properties.current_utm_campaign), '${escapeHogqlLike(campaign)}') > 0
        )
    `;

    const [signupRes, proRes] = await Promise.all([
      posthogHogql(signupQuery),
      posthogHogql(proQuery),
    ]);

    const signups = countFromHogql(signupRes.results);
    const pro_upgrades = countFromHogql(proRes.results);

    const posthog_url = `${credentials.host}/project/${credentials.projectId}/activity/explore`;

    return NextResponse.json(
      {
        ok: true,
        configured: true,
        campaign,
        signups,
        pro_upgrades: pro_upgrades > 0 ? pro_upgrades : null,
        posthog_url,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
